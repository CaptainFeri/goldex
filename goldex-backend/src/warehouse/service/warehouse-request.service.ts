import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import Decimal from "decimal.js";
import { WarehouseRequestEntity } from "../entity/warehouse-request.entity";
import { WarehouseHistoryEntity } from "../entity/warehouse-history.entity";
import { PacketEntity } from "../entity/packet.entity";
import { WarehouseEntity } from "../entity/warehouse.entity";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { TransactionEntity } from "../../wallet/entities/transaction.entity";
import { DepositEntity } from "../../deposit/deposit.entity";
import { WithdrawEntity } from "../../withdraw/withdraw.entity";
import { DepositStatusEnum } from "../../deposit/enum/deposit-status.enum";
import { WithdrawStatusEnum } from "../../withdraw/enum/withdraw-status.enum";
import { RequestTypeEnum } from "../enum/request-type.enum";
import { RequestStatusEnum } from "../enum/request-status.enum";
import { PacketStatusEnum } from "../enum/packet-status.enum";
import { WarehouseStatusEnum } from "../enum/warehouse-status.enum";
import { CreateDepositRequestDto } from "../dto/create-deposit-request.dto";
import { CreateWithdrawRequestDto } from "../dto/create-withdraw-request.dto";
import { AdminProcessRequestDto } from "../admin/dto/admin-process-request.dto";
import { ApproveWithdrawOutputDto } from "../admin/dto/approve-withdraw-output.dto";
import { AdminRequestQueryDto } from "../admin/dto/admin-request-query.dto";
import { WarehouseService } from "./warehouse.service";
import { TransactionTypeEnum } from "../../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../../wallet/enum/transaction.status.enum";
import { PacketService } from "./packet.service";
import { SmsService } from "../../sms/sms.service";
import { AllocationService, AllocationOption } from "./allocation.service";
import { TOLERANCE_GRAMS, computeNetWeight } from "../constants/warehouse.constants";

Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21,
});

@Injectable()
export class WarehouseRequestService {
  private readonly logger = new Logger(WarehouseRequestService.name);

  constructor(
    @InjectRepository(WarehouseRequestEntity)
    private readonly requestRepository: Repository<WarehouseRequestEntity>,
    @InjectRepository(WarehouseHistoryEntity)
    private readonly historyRepository: Repository<WarehouseHistoryEntity>,
    @InjectRepository(PacketEntity)
    private readonly packetRepository: Repository<PacketEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    private readonly warehouseService: WarehouseService,
    private readonly packetService: PacketService,
    private readonly smsService: SmsService,
    private readonly allocationService: AllocationService,
    private readonly dataSource: DataSource
  ) {}

  async createDepositRequest(userId: string, dto: CreateDepositRequestDto): Promise<any> {
    const warehouse = await this.warehouseService.findById(dto.warehouseId);

    if (warehouse.status !== WarehouseStatusEnum.ACTIVE) {
      throw new BadRequestException(`Warehouse is not active. Current status: ${warehouse.status}`);
    }

    const request = this.requestRepository.create({
      type: RequestTypeEnum.INPUT,
      status: RequestStatusEnum.PENDING,
      userId,
      warehouseId: dto.warehouseId,
      symbolId: dto.symbolId,
      weight: dto.weight,
      notes: dto.notes,
    });

    const saved = await this.requestRepository.save(request);

    await this.addHistory(null, {
      requestId: saved.id,
      warehouseId: dto.warehouseId,
      action: "DEPOSIT_REQUEST_CREATED",
      description: `Deposit request created by user ${userId} for ${dto.weight} weight, pending admin approval`,
      performedBy: userId,
      performedRole: "USER",
    });

    this.logger.log(`Deposit request created: ${saved.id} by user ${userId}, pending admin approval`);

    const deliveryInfo = this.getDeliveryInfoFromWarehouse(warehouse);
    return {
      ...saved,
      deliveryDate: deliveryInfo.date,
      deliveryTime: deliveryInfo.time,
      deliveryLocation: warehouse.location || null,
    };
  }

  async createWithdrawRequest(userId: string, dto: CreateWithdrawRequestDto): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const wallet = await this.getWalletForUpdate(queryRunner, userId, dto.symbolId);
      const decimalAmount = new Decimal(dto.weight);
      const freeBalance = new Decimal(wallet.freeBalance);

      if (freeBalance.lessThan(decimalAmount)) {
        throw new BadRequestException(
          `Insufficient free balance. Available: ${freeBalance.toString()}, Required: ${decimalAmount.toString()}`
        );
      }

      let warehouse: WarehouseEntity | null = null;
      if (dto.warehouseId) {
        warehouse = await queryRunner.manager.findOne(WarehouseEntity, {
          where: { id: dto.warehouseId },
        });
      }

      const request = queryRunner.manager.create(WarehouseRequestEntity, {
        type: RequestTypeEnum.OUTPUT,
        status: RequestStatusEnum.PENDING,
        userId,
        warehouseId: dto.warehouseId,
        symbolId: dto.symbolId,
        weight: dto.weight,
        notes: dto.notes,
      });

      const saved = await queryRunner.manager.save(request);

      wallet.freeBalance = freeBalance.minus(decimalAmount).toNumber();
      wallet.lockedBalance = new Decimal(wallet.lockedBalance).plus(decimalAmount).toNumber();
      await queryRunner.manager.save(wallet);

      const transaction = this.createTransactionRecord(
        wallet,
        TransactionTypeEnum.MATERIAL_WITHDRAW,
        decimalAmount.toNumber(),
        TransactionStatusEnum.PENDING,
        `Withdraw request ${saved.id}: ${decimalAmount.toString()} locked, awaiting admin approval and packet assignment`,
        { requestId: saved.id, weight: decimalAmount.toString(), status: "AWAITING_APPROVAL" }
      );
      await queryRunner.manager.save(transaction);

      await this.addHistory(queryRunner, {
        requestId: saved.id,
        warehouseId: dto.warehouseId,
        action: "WITHDRAW_REQUEST_CREATED_PENDING",
        description: `Withdraw request created by user ${userId} for ${decimalAmount.toString()}, awaiting admin approval`,
        performedBy: userId,
        performedRole: "USER",
      });

      await queryRunner.commitTransaction();
      this.logger.log(`Withdraw request created (pending): ${saved.id} by user ${userId}, awaiting admin approval`);

      const deliveryInfo = warehouse
        ? this.getDeliveryInfoFromWarehouse(warehouse)
        : { date: null, time: null };

      return {
        ...saved,
        status: "PENDING",
        message: "Request is pending admin approval and packet assignment.",
        deliveryDate: deliveryInfo.date,
        deliveryTime: deliveryInfo.time,
        deliveryLocation: warehouse?.location || null,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to create withdraw request: ${(error as any).message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getUserRequests(
    userId: string,
    query: { type?: RequestTypeEnum; status?: RequestStatusEnum; limit?: string; offset?: string }
  ): Promise<{ requests: WarehouseRequestEntity[]; total: number }> {
    const { type, status, limit = "10", offset = "0" } = query;

    const queryBuilder = this.requestRepository
      .createQueryBuilder("request")
      .leftJoinAndSelect("request.warehouse", "warehouse")
      .leftJoinAndSelect("request.packet", "packet")
      .where("request.user_id = :userId", { userId });

    if (type) {
      queryBuilder.andWhere("request.type = :type", { type });
    }

    if (status) {
      queryBuilder.andWhere("request.status = :status", { status });
    }

    queryBuilder.orderBy("request.created_at", "DESC").skip(Number(offset)).take(Number(limit));

    const [requests, total] = await queryBuilder.getManyAndCount();
    return { requests, total };
  }

  async getAllRequests(query: AdminRequestQueryDto): Promise<{ requests: WarehouseRequestEntity[]; total: number }> {
    const { type, status, userId, warehouseId, search, startDate, endDate, limit = "10", offset = "0" } = query;

    const queryBuilder = this.requestRepository
      .createQueryBuilder("request")
      .leftJoinAndSelect("request.user", "user")
      .leftJoinAndSelect("request.warehouse", "warehouse")
      .leftJoinAndSelect("request.packet", "packet")
      .leftJoinAndSelect("request.admin", "admin");

    if (type) {
      queryBuilder.andWhere("request.type = :type", { type });
    }

    if (status) {
      queryBuilder.andWhere("request.status = :status", { status });
    }

    if (userId) {
      queryBuilder.andWhere("request.user_id = :userId", { userId });
    }

    if (warehouseId) {
      queryBuilder.andWhere("request.warehouse_id = :warehouseId", { warehouseId });
    }

    if (search) {
      queryBuilder.andWhere("(user.phone ILIKE :search OR request.notes ILIKE :search)", {
        search: `%${search}%`,
      });
    }

    if (startDate) {
      queryBuilder.andWhere("request.created_at >= :startDate", { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere("request.created_at <= :endDate", { endDate });
    }

    queryBuilder.orderBy("request.created_at", "DESC").skip(Number(offset)).take(Number(limit));

    const [requests, total] = await queryBuilder.getManyAndCount();
    return { requests, total };
  }

  async getRequestById(id: string): Promise<WarehouseRequestEntity> {
    const request = await this.requestRepository.findOne({
      where: { id },
      relations: { user: true, warehouse: true, packet: true, admin: true },
    });

    if (!request) {
      throw new NotFoundException("Request not found");
    }

    return request;
  }

  async confirmDepositMaterial(
    requestId: string,
    adminId: string,
    materialData?: { ang?: number; ayar?: number; apparentWeight?: number; wastage?: number; picture?: string; warehouseIndexPosition?: string }
  ): Promise<WarehouseRequestEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const request = await queryRunner.manager.findOne(WarehouseRequestEntity, {
        where: { id: requestId },
        lock: { mode: "pessimistic_write" },
      });

      if (!request) {
        throw new NotFoundException("Request not found");
      }

      if (request.type !== RequestTypeEnum.INPUT) {
        throw new BadRequestException("Only deposit requests can confirm material");
      }

      if (request.status !== RequestStatusEnum.APPROVED) {
        throw new BadRequestException(`Cannot confirm material for request with status: ${request.status}. Must be APPROVED first`);
      }

      let packet: PacketEntity | null = null;
      if (request.packetId) {
        packet = await queryRunner.manager.findOne(PacketEntity, {
          where: { id: request.packetId },
          lock: { mode: "pessimistic_write" },
        });
      }

      if (!packet) {
        throw new BadRequestException("No packet associated with this deposit request");
      }

      if (packet.status !== PacketStatusEnum.PENDING) {
        throw new BadRequestException("Packet already processed");
      }

      if (materialData) {
        if (materialData.ang !== undefined) packet.ang = materialData.ang;
        if (materialData.ayar !== undefined) packet.ayar = materialData.ayar;
        if (materialData.picture !== undefined) packet.picture = materialData.picture;
        if (materialData.warehouseIndexPosition !== undefined) packet.warehouseIndexPosition = materialData.warehouseIndexPosition;

        // Packing & QC rule: when the scale reads apparent weight + fineness is measured,
        // the REAL net weight is (apparent x fineness) / 750 regardless of declaration.
        if (
          materialData.apparentWeight !== undefined &&
          materialData.apparentWeight > 0 &&
          materialData.ayar !== undefined &&
          materialData.ayar > 0
        ) {
          const qcNet = computeNetWeight(materialData.apparentWeight, materialData.ayar);
          packet.pureWeight = qcNet;
          packet.apparentWeight = materialData.apparentWeight;
          if (materialData.wastage !== undefined) packet.wastage = materialData.wastage;
        }
      }

      packet.status = PacketStatusEnum.IN_WAREHOUSE;
      packet.deliveryTime = new Date();
      await queryRunner.manager.save(packet);
      request.packet = packet;

      await this.warehouseService.updateCapacity(request.warehouseId, packet.pureWeight ?? request.weight, queryRunner);

      request.status = RequestStatusEnum.COMPLETED;
      request.adminId = adminId;
      request.processedAt = new Date();
      await queryRunner.manager.save(request);

      const wallet = await this.getWalletForUpdate(queryRunner, request.userId, request.symbolId);
      const decimalAmount = new Decimal(packet.pureWeight ?? request.weight);

      if (packet.pureWeight !== request.weight) {
        await this.addHistory(queryRunner, {
          warehouseId: request.warehouseId,
          packetId: packet.id,
          requestId: request.id,
          action: "QC_WEIGHT_RECALC",
          description:
            `QC: apparent ${materialData?.apparentWeight}g x fineness ${materialData?.ayar} / 750 = net ${packet.pureWeight}g ` +
            `(declared ${request.weight}g)`,
          performedBy: adminId,
          performedRole: "ADMIN",
          metadata: { declaredWeight: request.weight, netWeight: packet.pureWeight, apparentWeight: materialData?.apparentWeight },
        });
      }

      wallet.freeBalance = new Decimal(wallet.freeBalance).plus(decimalAmount).toNumber();
      await queryRunner.manager.save(wallet);

      const completedTx = this.createTransactionRecord(
        wallet,
        TransactionTypeEnum.MATERIAL_DEPOSIT,
        decimalAmount.toNumber(),
        TransactionStatusEnum.COMPLETED,
        `Deposit request ${request.id} completed: material received, ${decimalAmount.toString()} credited`,
        { requestId: request.id, packetId: request.packetId, weight: decimalAmount.toString(), confirmedBy: adminId }
      );
      await queryRunner.manager.save(completedTx);

      await this.addHistory(queryRunner, {
        requestId: request.id,
        packetId: request.packetId,
        warehouseId: request.warehouseId,
        action: "DEPOSIT_MATERIAL_CONFIRMED",
        description: `Material confirmed and deposit completed for request ${request.id}, packet ${request.packet.idSecure}, ${decimalAmount.toString()} credited`,
        performedBy: adminId,
        performedRole: "ADMIN",
        metadata: { ang: materialData?.ang, ayar: materialData?.ayar },
      });

      await queryRunner.commitTransaction();
      this.logger.log(`Deposit material confirmed and completed for request ${requestId} by admin ${adminId}`);

      return request;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to confirm material for request ${requestId}: ${(error as any).message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async processRequest(
    requestId: string,
    adminId: string,
    dto: AdminProcessRequestDto
  ): Promise<WarehouseRequestEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const request = await queryRunner.manager.findOne(WarehouseRequestEntity, {
        where: { id: requestId },
        lock: { mode: "pessimistic_write" },
      });

      if (!request) {
        throw new NotFoundException("Request not found");
      }

      if (request.status !== RequestStatusEnum.PENDING && request.status !== RequestStatusEnum.APPROVED) {
        throw new BadRequestException(`Cannot process request with status: ${request.status}`);
      }

      let packet: PacketEntity | null = null;
      if (request.packetId) {
        packet = await queryRunner.manager.findOne(PacketEntity, {
          where: { id: request.packetId },
          lock: { mode: "pessimistic_write" },
        });
      }
      request.packet = packet;

      const prevStatus = request.status;

      request.adminId = adminId;
      request.status = dto.status;
      request.processedAt = new Date();

      if (dto.notes) request.notes = dto.notes;
      if (dto.deliveryLocation) request.deliveryLocation = dto.deliveryLocation;
      if (dto.deliveryDate) request.deliveryDate = new Date(dto.deliveryDate);
      if (dto.deliveryTime) request.deliveryTime = dto.deliveryTime;

      if (dto.status === RequestStatusEnum.APPROVED && prevStatus === RequestStatusEnum.PENDING) {
        if (request.type === RequestTypeEnum.INPUT) {
          if (!request.packet) {
            await this.processInputApproval(queryRunner, request);
          }
        } else if (request.type === RequestTypeEnum.OUTPUT) {
          if (!request.packet) {
            throw new BadRequestException("SELECT_PACKET");
          }
          await this.processOutputApproval(queryRunner, request, dto);
        }
      }

      if (dto.status === RequestStatusEnum.COMPLETED) {
        if (request.type === RequestTypeEnum.INPUT) {
          await this.processInputCompletion(queryRunner, request);
        } else if (request.type === RequestTypeEnum.OUTPUT) {
          await this.processOutputCompletion(queryRunner, request);
        }
      }

      if (dto.status === RequestStatusEnum.REJECTED) {
        if (request.type === RequestTypeEnum.OUTPUT && request.packet) {
          await this.unlockWalletForRejectedWithdraw(queryRunner, request);
          await this.returnPacketToPool(queryRunner, request, request.packet);
        } else if (request.type === RequestTypeEnum.INPUT && request.packet) {
          if (prevStatus === RequestStatusEnum.APPROVED) {
            await this.unlockWalletForRejectedDeposit(queryRunner, request);
          }
          await queryRunner.manager.softDelete(PacketEntity, request.packet.id);
        }
      }

      const saved = await queryRunner.manager.save(request);

      await this.addHistory(queryRunner, {
        requestId: saved.id,
        packetId: request.packetId,
        warehouseId: request.warehouseId,
        action: `REQUEST_${dto.status}`,
        description: `Request ${saved.id} ${dto.status.toLowerCase()} by admin ${adminId}`,
        performedBy: adminId,
        performedRole: "ADMIN",
        metadata: { previousStatus: prevStatus, newStatus: dto.status },
      });

      await this.syncLinkedRecord(queryRunner, saved);

      await queryRunner.commitTransaction();
      this.logger.log(`Request ${requestId} processed by admin ${adminId}: ${dto.status}`);

      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to process request ${requestId}: ${(error as any).message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async processInputApproval(queryRunner: any, request: WarehouseRequestEntity): Promise<void> {
    const warehouse = await queryRunner.manager.findOne(WarehouseEntity, {
      where: { id: request.warehouseId },
    });

    const packet = queryRunner.manager.create(PacketEntity, {
      warehouseId: request.warehouseId,
      userId: request.userId,
      pureWeight: request.weight,
      idSecure: `DEP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      dateTime: new Date(),
      status: PacketStatusEnum.PENDING,
      isOrphan: false,
    });

    const savedPacket = await queryRunner.manager.save(packet);
    request.packetId = savedPacket.id;
    request.packet = savedPacket;

    if (warehouse) {
      if (!request.deliveryDate) {
        const deliveryInfo = this.getDeliveryInfoFromWarehouse(warehouse);
        request.deliveryDate = deliveryInfo.date;
        request.deliveryTime = request.deliveryTime || deliveryInfo.time || warehouse.timeLimit || null;
      }
      request.deliveryLocation = request.deliveryLocation || warehouse.location || null;
    }

    await this.addHistory(queryRunner, {
      packetId: savedPacket.id,
      warehouseId: request.warehouseId,
      action: "PACKET_CREATED_FROM_DEPOSIT",
      description: `Packet ${savedPacket.idSecure} created from deposit request ${request.id}, pending user delivery`,
    });
  }

  private async processInputCompletion(queryRunner: any, request: WarehouseRequestEntity): Promise<void> {
    if (!request.packet) {
      throw new BadRequestException("No packet associated with this deposit request");
    }

    request.packet.status = PacketStatusEnum.IN_WAREHOUSE;
    request.packet.deliveryTime = new Date();
    await queryRunner.manager.save(request.packet);

    await this.warehouseService.updateCapacity(request.warehouseId, request.weight, queryRunner);

    const wallet = await this.getWalletForUpdate(queryRunner, request.userId, request.symbolId);
    const decimalAmount = new Decimal(request.weight);

    const pendingTx = await queryRunner.manager.findOne(TransactionEntity, {
      where: {
        walletId: wallet.id,
        transactionType: TransactionTypeEnum.MATERIAL_DEPOSIT,
        status: TransactionStatusEnum.PENDING,
      },
      order: { createAt: "DESC" },
      lock: { mode: "pessimistic_write" },
    });

    if (pendingTx) {
      pendingTx.status = TransactionStatusEnum.COMPLETED;
      pendingTx.completedAt = new Date();
      pendingTx.metadata = {
        ...pendingTx.metadata,
        completedAt: new Date().toISOString(),
        completedBy: request.adminId,
      };
      await queryRunner.manager.save(pendingTx);

      wallet.lockedBalance = new Decimal(wallet.lockedBalance).minus(decimalAmount).toNumber();
      await queryRunner.manager.save(wallet);
    } else {
      wallet.freeBalance = new Decimal(wallet.freeBalance).plus(decimalAmount).toNumber();
      await queryRunner.manager.save(wallet);

      const completedTx = this.createTransactionRecord(
        wallet,
        TransactionTypeEnum.MATERIAL_DEPOSIT,
        decimalAmount.toNumber(),
        TransactionStatusEnum.COMPLETED,
        `Deposit request ${request.id} completed: ${decimalAmount.toString()} credited`,
        { requestId: request.id, packetId: request.packetId, weight: decimalAmount.toString(), completedBy: request.adminId }
      );
      await queryRunner.manager.save(completedTx);
    }
  }

  private async processOutputApproval(
    queryRunner: any,
    request: WarehouseRequestEntity,
    dto: AdminProcessRequestDto
  ): Promise<void> {
    const packet = request.packet;

    if (!packet) {
      throw new BadRequestException("SELECT_PACKET");
    }

    if (packet.status !== PacketStatusEnum.IN_WAREHOUSE) {
      throw new BadRequestException(`Assigned packet is not IN_WAREHOUSE (status: ${packet.status})`);
    }

    const assignedSource =
      request.metadata?.assignedSource || (packet.isOrphan ? "orphan" : "own");
    request.metadata = {
      ...(request.metadata || {}),
      assignedSource,
      assignedPacketId: packet.id,
      assignedPacketWeight: packet.pureWeight,
    };

    const warehouse = packet.warehouse || (await queryRunner.manager.findOne(WarehouseEntity, { where: { id: packet.warehouseId } }));

    if (dto.deliveryDate) request.deliveryDate = new Date(dto.deliveryDate);
    if (dto.deliveryTime) request.deliveryTime = dto.deliveryTime;
    if (dto.deliveryLocation) request.deliveryLocation = dto.deliveryLocation;

    if (warehouse && !request.deliveryDate) {
      const deliveryInfo = this.getDeliveryInfoFromWarehouse(warehouse);
      request.deliveryDate = deliveryInfo.date;
      request.deliveryTime = request.deliveryTime || deliveryInfo.time || warehouse.timeLimit || null;
      request.deliveryLocation = request.deliveryLocation || warehouse.location || null;
    }

    await queryRunner.manager.save(request);

    const user = await queryRunner.manager.findOne("user", { where: { id: request.userId } });

    if (user && user.phone) {
      const deliveryInfo = [];
      if (request.deliveryDate) deliveryInfo.push(`date: ${request.deliveryDate.toISOString().split("T")[0]}`);
      if (request.deliveryTime) deliveryInfo.push(`time: ${request.deliveryTime}`);
      if (request.deliveryLocation) deliveryInfo.push(`location: ${request.deliveryLocation}`);

      const message = `Your gold withdrawal request ${request.id} is ready for pickup. ${deliveryInfo.length > 0 ? deliveryInfo.join(", ") : "Please check the warehouse for details."}`;

      try {
        await this.smsService.sendSMS(user.phone, message);
        this.logger.log(`SMS sent to user ${request.userId} for withdrawal approval`);
      } catch (smsError) {
        this.logger.warn(`Failed to send SMS for withdrawal approval: ${(smsError as any).message}`);
      }
    }
  }

  /**
   * Returns an assigned packet to the pool:
   * - packets that came from the orphan pool become orphans again,
   * - packets that already belonged to the user stay IN_WAREHOUSE under the user.
   */
  private async returnPacketToPool(queryRunner: any, request: WarehouseRequestEntity, packet: PacketEntity): Promise<void> {
    const assignedSource = request.metadata?.assignedSource || "orphan";
    const allocation = request.metadata?.allocation;

    if (allocation?.strategy === "combination" && allocation?.packetIds?.length) {
      for (const pid of allocation.packetIds) {
        const p = await queryRunner.manager.findOne(PacketEntity, {
          where: { id: pid },
          lock: { mode: "pessimistic_write" },
        });
        if (!p) continue;
        p.userId = null;
        p.isOrphan = true;
        p.status = PacketStatusEnum.ORPHAN;
        p.deliveryTime = null;
        await queryRunner.manager.save(p);
      }
      await this.addHistory(queryRunner, {
        requestId: request.id,
        packetId: packet.id,
        warehouseId: packet.warehouseId,
        action: "PACKET_COMBINATION_RETURNED_TO_POOL",
        description: `Combination packets returned to orphan pool after request ${request.id}`,
        metadata: { ...allocation },
      });
      return;
    }

    if (assignedSource === "orphan") {
      packet.userId = null;
      packet.isOrphan = true;
      packet.status = PacketStatusEnum.ORPHAN;
      packet.deliveryTime = null;
    } else {
      packet.status = PacketStatusEnum.IN_WAREHOUSE;
      packet.deliveryTime = null;
    }

    await queryRunner.manager.save(packet);

    await this.addHistory(queryRunner, {
      requestId: request.id,
      packetId: packet.id,
      warehouseId: packet.warehouseId,
      action: "PACKET_RETURNED_TO_POOL",
      description: `Packet ${packet.idSecure} returned to ${assignedSource === "orphan" ? "orphan pool" : "user warehouse"} after request ${request.id}`,
      metadata: { assignedSource },
    });
  }

  private async processOutputCompletion(queryRunner: any, request: WarehouseRequestEntity): Promise<void> {
    const requested = new Decimal(request.weight);

    let exitedWeight: Decimal;
    const allocation = request.metadata?.allocation;

    if (allocation?.strategy === "combination" && allocation?.packetIds?.length) {
      const packetIds: string[] = allocation.packetIds;
      let totalExited = new Decimal(0);

      for (const pid of packetIds) {
        const p = await queryRunner.manager.findOne(PacketEntity, {
          where: { id: pid },
          lock: { mode: "pessimistic_write" },
        });
        if (!p) continue;
        p.status = PacketStatusEnum.WITHDRAWN;
        p.deliveryTime = new Date();
        await queryRunner.manager.save(p);
        totalExited = totalExited.plus(new Decimal(p.pureWeight));
      }

      exitedWeight = totalExited;
    } else {
      if (!request.packet) {
        throw new BadRequestException("No packet associated with this withdrawal request");
      }

      const packetWeight = new Decimal(request.packet.pureWeight);

      if (packetWeight.greaterThan(requested)) {
        await this.packetService.splitPacket(request.packet.id, request.weight, queryRunner);
        exitedWeight = requested;
      } else {
        request.packet.status = PacketStatusEnum.WITHDRAWN;
        request.packet.deliveryTime = new Date();
        await queryRunner.manager.save(request.packet);
        exitedWeight = packetWeight;
      }
    }

    // Tolerance threshold (warehouse-roadmap.html §4): differences <= 0.05g are zeroed.
    const rawRefund = requested.minus(exitedWeight);
    const refundedWeight = rawRefund.greaterThan(0) && rawRefund.lessThanOrEqualTo(TOLERANCE_GRAMS)
      ? new Decimal(0)
      : rawRefund;

    await this.warehouseService.updateCapacity(request.warehouseId, -exitedWeight.toNumber(), queryRunner);

    const wallet = await this.getWalletForUpdate(queryRunner, request.userId, request.symbolId);

    wallet.lockedBalance = new Decimal(wallet.lockedBalance).minus(requested).toNumber();
    if (refundedWeight.greaterThan(0)) {
      wallet.freeBalance = new Decimal(wallet.freeBalance).plus(refundedWeight).toNumber();
    } else if (refundedWeight.lessThan(0) && !allocation?.packetIds?.length) {
      // Over-delivery beyond the request without prior allocation metadata is not allowed.
      throw new BadRequestException(
        `Delivered package weight (${exitedWeight.toString()}) exceeds the requested amount (${requested.toString()})`
      );
    }
    await queryRunner.manager.save(wallet);

    const pendingTx = await queryRunner.manager.findOne(TransactionEntity, {
      where: {
        walletId: wallet.id,
        transactionType: TransactionTypeEnum.MATERIAL_WITHDRAW,
        status: TransactionStatusEnum.PENDING,
      },
      order: { createAt: "DESC" },
      lock: { mode: "pessimistic_write" },
    });

    if (pendingTx) {
      pendingTx.status = TransactionStatusEnum.COMPLETED;
      pendingTx.completedAt = new Date();
      pendingTx.metadata = {
        ...pendingTx.metadata,
        completedAt: new Date().toISOString(),
        completedBy: request.adminId,
        exitedWeight: exitedWeight.toString(),
        refundedWeight: refundedWeight.toString(),
      };
      await queryRunner.manager.save(pendingTx);
    }
  }

  private async unlockWalletForRejectedDeposit(queryRunner: any, request: WarehouseRequestEntity): Promise<void> {
    const wallet = await this.getWalletForUpdate(queryRunner, request.userId, request.symbolId);
    const decimalAmount = new Decimal(request.weight);

    const pendingTx = await queryRunner.manager.findOne(TransactionEntity, {
      where: {
        walletId: wallet.id,
        transactionType: TransactionTypeEnum.MATERIAL_DEPOSIT,
        status: TransactionStatusEnum.PENDING,
      },
      order: { createAt: "DESC" },
      lock: { mode: "pessimistic_write" },
    });

    if (pendingTx) {
      pendingTx.status = TransactionStatusEnum.REFUNDED;
      pendingTx.completedAt = new Date();
      pendingTx.metadata = {
        ...pendingTx.metadata,
        rejectedAt: new Date().toISOString(),
        rejectedBy: request.adminId,
      };
      await queryRunner.manager.save(pendingTx);

      wallet.lockedBalance = new Decimal(wallet.lockedBalance).minus(decimalAmount).toNumber();
      wallet.freeBalance = new Decimal(wallet.freeBalance).minus(decimalAmount).toNumber();
      await queryRunner.manager.save(wallet);
    }
  }

  private async unlockWalletForRejectedWithdraw(queryRunner: any, request: WarehouseRequestEntity): Promise<void> {
    const wallet = await this.getWalletForUpdate(queryRunner, request.userId, request.symbolId);
    const decimalAmount = new Decimal(request.weight);

    wallet.lockedBalance = new Decimal(wallet.lockedBalance).minus(decimalAmount).toNumber();
    wallet.freeBalance = new Decimal(wallet.freeBalance).plus(decimalAmount).toNumber();
    await queryRunner.manager.save(wallet);

    const pendingTx = await queryRunner.manager.findOne(TransactionEntity, {
      where: {
        walletId: wallet.id,
        transactionType: TransactionTypeEnum.MATERIAL_WITHDRAW,
        status: TransactionStatusEnum.PENDING,
      },
      order: { createAt: "DESC" },
      lock: { mode: "pessimistic_write" },
    });

    if (pendingTx) {
      pendingTx.status = TransactionStatusEnum.REFUNDED;
      pendingTx.completedAt = new Date();
      await queryRunner.manager.save(pendingTx);
    }
  }

  async getPendingWithdrawRequests(): Promise<WarehouseRequestEntity[]> {
    return this.requestRepository.find({
      where: {
        type: RequestTypeEnum.OUTPUT,
        status: RequestStatusEnum.PENDING,
      },
      relations: { user: true, warehouse: true },
      order: { createAt: "ASC" },
    });
  }

  async getAllocationSuggestions(requestId: string): Promise<AllocationOption[]> {
    return this.allocationService.suggestForRequest(requestId);
  }

  /**
   * Applies a smart-allocation option to a pending withdraw request
   * (warehouse-roadmap.html §3): exact match, best-fit below, user packet
   * split, or a min-count combination of orphan packages.
   */
  async applyAllocationOption(
    requestId: string,
    adminId: string,
    optionKey: string
  ): Promise<WarehouseRequestEntity> {
    const { kind, packetIds } = this.allocationService.parseOptionKey(optionKey);
    if (!kind) throw new BadRequestException("Missing allocation strategy");

    if (kind === "orphan-exact" || kind === "orphan-fit") {
      if (packetIds.length !== 1) throw new BadRequestException("This strategy expects exactly one orphan packet");
      return this.assignPacketToRequest(requestId, packetIds[0], adminId);
    }

    if (kind === "own-exact" || kind === "own-fit") {
      if (packetIds.length !== 1) throw new BadRequestException("This strategy expects exactly one user packet");
      const dto = new ApproveWithdrawOutputDto();
      dto.packetId = packetIds[0];
      // empty weight1 means the service slices exactly the requested weight
      return this.approveWithdrawForOutput(requestId, adminId, dto);
    }

    if (kind === "combination") {
      return this.applyCombinationAllocation(requestId, adminId, packetIds);
    }

    throw new BadRequestException(`Unknown allocation strategy: ${kind}`);
  }

  /**
   * Allocates a combination of orphan packages to an OUTPUT request.
   * Combines the chosen orphan packets into one delivery: the packets are
   * marked as the user's (IN_WAREHOUSE), the request stores the allocation
   * metadata, and delivery refunds the digital difference at completion.
   */
  private async applyCombinationAllocation(
    requestId: string,
    adminId: string,
    packetIds: string[]
  ): Promise<WarehouseRequestEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const request = await queryRunner.manager.findOne(WarehouseRequestEntity, {
        where: { id: requestId, type: RequestTypeEnum.OUTPUT },
        lock: { mode: "pessimistic_write" },
      });

      if (!request) throw new NotFoundException("Request not found");
      if (request.status !== RequestStatusEnum.PENDING) {
        throw new BadRequestException(`Only PENDING requests can be allocated (status: ${request.status})`);
      }
      if (request.packetId) throw new BadRequestException("REQUEST_ALREADY_HAS_PACKET");

      const packets: PacketEntity[] = [];
      let totalWeight = new Decimal(0);

      for (const packetId of packetIds) {
        const packet = await queryRunner.manager.findOne(PacketEntity, {
          where: { id: packetId },
          lock: { mode: "pessimistic_write" },
          relations: { warehouse: true },
        });
        if (!packet) throw new NotFoundException(`Packet not found: ${packetId}`);
        if (!packet.isOrphan || packet.status !== PacketStatusEnum.ORPHAN) {
          throw new BadRequestException(`Packet ${packet.idSecure} is not an available orphan packet`);
        }
        packets.push(packet);
        totalWeight = totalWeight.plus(new Decimal(packet.pureWeight));
      }

      for (const packet of packets) {
        packet.userId = request.userId;
        packet.isOrphan = false;
        packet.status = PacketStatusEnum.IN_WAREHOUSE;
        await queryRunner.manager.save(packet);
      }

      request.packetId = packets[0].id;
      request.packet = packets[0];
      request.warehouseId = packets[0].warehouseId;
      request.adminId = adminId;
      request.status = RequestStatusEnum.APPROVED;
      request.processedAt = new Date();
      request.metadata = {
        ...(request.metadata || {}),
        allocation: {
          strategy: "combination",
          packetIds: packets.map((p) => p.id),
          totalWeight: totalWeight.toNumber(),
          refundWeight: Math.max(0, new Decimal(request.weight).minus(totalWeight).toNumber()),
        },
      };

      const warehouse = packets[0].warehouse || null;
      if (warehouse) {
        const deliveryInfo = this.getDeliveryInfoFromWarehouse(warehouse);
        request.deliveryDate = deliveryInfo.date;
        request.deliveryTime = request.deliveryTime || deliveryInfo.time || warehouse.timeLimit || null;
        request.deliveryLocation = request.deliveryLocation || warehouse.location || null;
      }

      await queryRunner.manager.save(request);

      await this.addHistory(queryRunner, {
        requestId: request.id,
        packetId: request.packetId,
        warehouseId: request.warehouseId,
        action: "PACKET_COMBINATION_ASSIGNED",
        description:
          `Combination of ${packets.length} orphan packets (${totalWeight.toString()}g) assigned to withdraw request ${request.id} by admin ${adminId}`,
        performedBy: adminId,
        performedRole: "ADMIN",
        metadata: { packetIds: packets.map((p) => p.id), totalWeight: totalWeight.toString() },
      });

      await this.syncLinkedRecord(queryRunner, request);
      await queryRunner.commitTransaction();
      this.logger.log(`Combination allocation applied to request ${requestId}`);

      return this.getRequestById(request.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async assignPacketToRequest(requestId: string, packetId: string, adminId: string): Promise<WarehouseRequestEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const request = await queryRunner.manager.findOne(WarehouseRequestEntity, {
        where: { id: requestId, type: RequestTypeEnum.OUTPUT },
        lock: { mode: "pessimistic_write" },
      });

      if (!request) {
        throw new NotFoundException("Request not found");
      }

      if (request.status !== RequestStatusEnum.PENDING && request.status !== RequestStatusEnum.APPROVED) {
        throw new BadRequestException("CANNOT_ASSIGN_PACKET_INVALID_STATUS");
      }

      if (request.packetId) {
        throw new BadRequestException("REQUEST_ALREADY_HAS_PACKET");
      }

      let requestUser: any = null;
      if (request.userId) {
        requestUser = await queryRunner.manager.findOne("user", {
          where: { id: request.userId },
        });
      }
      request.user = requestUser;

      const packet = await queryRunner.manager.findOne(PacketEntity, {
        where: { id: packetId },
        lock: { mode: "pessimistic_write" },
      });

      let packetWarehouse: any = null;
      if (packet) {
        packetWarehouse = await queryRunner.manager.findOne(WarehouseEntity, {
          where: { id: packet.warehouseId },
        });
        packet.warehouse = packetWarehouse;
      }

      if (!packet) {
        throw new NotFoundException("Packet not found");
      }

      if (!packet.isOrphan || packet.status !== PacketStatusEnum.ORPHAN) {
        throw new BadRequestException("Packet must be orphan to assign to a request");
      }

      const warehouse = packet.warehouse;
      const deliveryInfo = this.getDeliveryInfoFromWarehouse(warehouse);

      packet.userId = request.userId;
      packet.isOrphan = false;
      packet.status = PacketStatusEnum.IN_WAREHOUSE;
      await queryRunner.manager.save(packet);

      request.status = RequestStatusEnum.APPROVED;
      request.packetId = packet.id;
      request.warehouseId = packet.warehouseId;
      request.adminId = adminId;
      request.processedAt = new Date();
      request.deliveryDate = deliveryInfo.date;
      request.deliveryTime = deliveryInfo.time || warehouse.timeLimit || null;
      request.deliveryLocation = warehouse.location || null;
      request.metadata = {
        ...(request.metadata || {}),
        assignedSource: "orphan",
        assignedPacketId: packet.id,
        assignedPacketWeight: packet.pureWeight,
      };
      await queryRunner.manager.save(request);

      await this.addHistory(queryRunner, {
        requestId: request.id,
        packetId: packet.id,
        warehouseId: packet.warehouseId,
        action: "PACKET_ASSIGNED_BY_ADMIN",
        description: `Packet ${packet.idSecure} assigned to withdraw request ${request.id} by admin ${adminId}`,
        performedBy: adminId,
        performedRole: "ADMIN",
      });

      await this.syncLinkedRecord(queryRunner, request);

      await queryRunner.commitTransaction();

      if (request.user?.phone) {
        try {
          const msg = `Your withdrawal request ${request.id} has been approved. Delivery date: ${deliveryInfo.date.toISOString().split("T")[0]}, Location: ${warehouse.location || "Warehouse"}`;
          await this.smsService.sendSMS(request.user.phone, msg);
        } catch (e) {
          this.logger.warn(`Failed to notify user ${request.userId} about packet assignment`);
        }
      }

      return this.getRequestById(request.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Approves a withdraw request with an EXPLICIT packet choice:
   *  - user's own IN_WAREHOUSE packet -> split into two packets at approval
   *    (withdrawal part + remainder part), each with uploaded info,
   *  - or an ORPHAN orphan packet -> assigned directly.
   */
  async approveWithdrawForOutput(
    requestId: string,
    adminId: string,
    dto: ApproveWithdrawOutputDto
  ): Promise<WarehouseRequestEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const request = await queryRunner.manager.findOne(WarehouseRequestEntity, {
        where: { id: requestId },
        lock: { mode: "pessimistic_write" },
      });

      if (!request) {
        throw new NotFoundException("Request not found");
      }
      if (request.type !== RequestTypeEnum.OUTPUT) {
        throw new BadRequestException("Only withdraw requests can be approved this way");
      }
      if (request.status !== RequestStatusEnum.PENDING) {
        throw new BadRequestException(`Only PENDING requests can be approved (status: ${request.status})`);
      }
      if (!dto.packetId) {
        throw new BadRequestException("SELECT_PACKET");
      }

      const packet = await queryRunner.manager.findOne(PacketEntity, {
        where: { id: dto.packetId },
        lock: { mode: "pessimistic_write" },
        relations: { warehouse: true },
      });

      if (!packet) {
        throw new NotFoundException("Packet not found");
      }

      const requested = new Decimal(request.weight);
      const packetWeight = new Decimal(packet.pureWeight);

      const isUserPacket =
        !packet.isOrphan && packet.status === PacketStatusEnum.IN_WAREHOUSE && packet.userId === request.userId;
      const isOrphanPacket = packet.isOrphan && packet.status === PacketStatusEnum.ORPHAN;

      if (!isUserPacket && !isOrphanPacket) {
        throw new BadRequestException(
          `Packet ${packet.idSecure} cannot be assigned (status: ${packet.status}, orphan: ${packet.isOrphan})`
        );
      }

      let splitInfo: any = null;

      if (isOrphanPacket) {
        packet.userId = request.userId;
        packet.isOrphan = false;
        packet.status = PacketStatusEnum.IN_WAREHOUSE;
        if (dto.ang1 !== undefined) packet.ang = dto.ang1;
        if (dto.ayar1 !== undefined) packet.ayar = dto.ayar1;
        if (dto.position1 !== undefined) packet.warehouseIndexPosition = dto.position1;
        if (dto.picture1) packet.picture = dto.picture1;
        await queryRunner.manager.save(packet);

        await this.addHistory(queryRunner, {
          requestId: request.id,
          packetId: packet.id,
          warehouseId: packet.warehouseId,
          action: "PACKET_ASSIGNED_FROM_ORPHAN",
          description: `Orphan packet ${packet.idSecure} (${packetWeight.toString()}g) assigned to withdraw request ${request.id} by admin ${adminId}`,
          performedBy: adminId,
          performedRole: "ADMIN",
          metadata: { weight: packet.pureWeight, assignedSource: "orphan" },
        });
      } else {
        if (packetWeight.lessThan(requested)) {
          throw new BadRequestException(
            `Packet weight (${packetWeight.toString()}g) is less than the requested amount (${requested.toString()}g)`
          );
        }

        const w1 = new Decimal(dto.weight1 !== undefined ? dto.weight1 : requested);
        const w2 = packetWeight.minus(w1);

        if (w1.lessThanOrEqualTo(0)) {
          throw new BadRequestException("Withdrawal part weight must be positive");
        }
        if (w2.lessThan(0)) {
          throw new BadRequestException("Withdrawal part weight exceeds the packet weight");
        }

        packet.pureWeight = w1.toNumber();
        if (dto.ang1 !== undefined) packet.ang = dto.ang1;
        if (dto.ayar1 !== undefined) packet.ayar = dto.ayar1;
        if (dto.position1 !== undefined) packet.warehouseIndexPosition = dto.position1;
        if (dto.picture1) packet.picture = dto.picture1;
        await queryRunner.manager.save(packet);

        let remainderPacket: PacketEntity | null = null;
        if (w2.greaterThan(0)) {
          const idGen = () => Math.random().toString(36).substring(2, 8).toUpperCase();
          remainderPacket = queryRunner.manager.create(PacketEntity, {
            warehouseId: packet.warehouseId,
            userId: request.userId,
            pureWeight: w2.toNumber(),
            idSecure: `REM-${Date.now()}-${idGen()}`,
            dateTime: new Date(),
            status: PacketStatusEnum.IN_WAREHOUSE,
            ang: dto.ang2 !== undefined ? dto.ang2 : packet.ang,
            ayar: dto.ayar2 !== undefined ? dto.ayar2 : packet.ayar,
            warehouseIndexPosition: dto.position2,
            picture: dto.picture2,
            batchNumber: packet.batchNumber,
            isOrphan: false,
          });
          await queryRunner.manager.save(remainderPacket);
        }

        splitInfo = {
          sourcePacketId: packet.id,
          sourceWeight: packetWeight.toString(),
          withdrawalWeight: w1.toString(),
          remainderWeight: w2.toString(),
          remainderPacketId: remainderPacket?.id || null,
        };

        await this.addHistory(queryRunner, {
          requestId: request.id,
          packetId: packet.id,
          warehouseId: packet.warehouseId,
          action: "PACKET_SPLIT_FOR_WITHDRAW",
          description:
            `User packet ${packet.idSecure} (${packetWeight.toString()}g) split on approval of request ${request.id}: ` +
            `${w1.toString()}g withdrawal part, ${w2.toString()}g remainder` +
            (remainderPacket ? ` (new packet ${remainderPacket.idSecure})` : ""),
          performedBy: adminId,
          performedRole: "ADMIN",
          metadata: splitInfo,
        });
      }

      request.packetId = packet.id;
      request.packet = packet;
      request.warehouseId = packet.warehouseId;
      request.adminId = adminId;
      request.status = RequestStatusEnum.APPROVED;
      request.processedAt = new Date();
      request.metadata = {
        ...(request.metadata || {}),
        assignedSource: isOrphanPacket ? "orphan" : "user-split",
        ...(splitInfo ? { split: splitInfo } : {}),
      };

      const warehouse = packet.warehouse || (await queryRunner.manager.findOne(WarehouseEntity, { where: { id: packet.warehouseId } }));

      if (dto.deliveryDate) request.deliveryDate = new Date(dto.deliveryDate);
      if (dto.deliveryTime) request.deliveryTime = dto.deliveryTime;
      if (dto.deliveryLocation) request.deliveryLocation = dto.deliveryLocation;

      if (warehouse && !request.deliveryDate) {
        const deliveryInfo = this.getDeliveryInfoFromWarehouse(warehouse);
        request.deliveryDate = deliveryInfo.date;
        request.deliveryTime = request.deliveryTime || deliveryInfo.time || warehouse.timeLimit || null;
        request.deliveryLocation = request.deliveryLocation || warehouse.location || null;
      }

      await queryRunner.manager.save(request);

      await this.addHistory(queryRunner, {
        requestId: request.id,
        packetId: request.packetId,
        warehouseId: request.warehouseId,
        action: "REQUEST_APPROVED",
        description: `Withdraw request ${request.id} approved by admin ${adminId} (packet ${packet.idSecure})`,
        performedBy: adminId,
        performedRole: "ADMIN",
        metadata: { assignedSource: isOrphanPacket ? "orphan" : "user-split" },
      });

      await this.syncLinkedRecord(queryRunner, request);

      await queryRunner.commitTransaction();
      this.logger.log(`Withdraw request ${requestId} approved by admin ${adminId} with packet ${packet.idSecure}`);

const user = await queryRunner.manager.findOne<{ id: string; phone?: string }>("user", { where: { id: request.userId } });
      if (user && user.phone) {
        try {
          const deliveryInfo = [];
          if (request.deliveryDate) deliveryInfo.push(`date: ${request.deliveryDate.toISOString().split("T")[0]}`);
          if (request.deliveryTime) deliveryInfo.push(`time: ${request.deliveryTime}`);
          if (request.deliveryLocation) deliveryInfo.push(`location: ${request.deliveryLocation}`);
          await this.smsService.sendSMS(
            user.phone,
            `Your gold withdrawal request ${request.id} is ready for pickup. ${deliveryInfo.length > 0 ? deliveryInfo.join(", ") : "Please check the warehouse for details."}`
          );
        } catch (e) {
          this.logger.warn(`Failed to notify user ${request.userId} about withdrawal approval`);
        }
      }

      return this.getRequestById(request.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Mirrors a warehouse_request status onto the linked deposit/withdraw record
   * (created via POST /deposit or POST /withdraw with type=warehouse).
   */
  private async syncLinkedRecord(queryRunner: any, request: WarehouseRequestEntity): Promise<void> {
    if (!request.id) return;

    const deposit = await queryRunner.manager.findOne(DepositEntity, {
      where: { warehouseRequestId: request.id },
      lock: { mode: "pessimistic_write" },
    });

    if (deposit) {
      switch (request.status) {
        case RequestStatusEnum.PENDING:
          deposit.status = DepositStatusEnum.PENDING;
          break;
        case RequestStatusEnum.APPROVED:
          deposit.status = DepositStatusEnum.PROCESSING;
          break;
        case RequestStatusEnum.COMPLETED:
          deposit.status = DepositStatusEnum.COMPLETED;
          deposit.completedAt = new Date();
          break;
        case RequestStatusEnum.REJECTED:
        case RequestStatusEnum.CANCELLED:
          deposit.status = DepositStatusEnum.CANCELLED;
          break;
      }
      await queryRunner.manager.save(deposit);
    }

    const withdraw = await queryRunner.manager.findOne(WithdrawEntity, {
      where: { warehouseRequestId: request.id },
      lock: { mode: "pessimistic_write" },
    });

    if (withdraw) {
      switch (request.status) {
        case RequestStatusEnum.PENDING:
          withdraw.status = WithdrawStatusEnum.PENDING;
          break;
        case RequestStatusEnum.APPROVED:
          withdraw.status = WithdrawStatusEnum.PROCESSING;
          break;
        case RequestStatusEnum.COMPLETED:
          withdraw.status = WithdrawStatusEnum.COMPLETED;
          withdraw.completedAt = new Date();
          break;
        case RequestStatusEnum.REJECTED:
        case RequestStatusEnum.CANCELLED:
          withdraw.status = WithdrawStatusEnum.CANCELLED;
          break;
      }
      await queryRunner.manager.save(withdraw);
    }
  }

  /**
   * Cancels approved requests whose delivery day has ended without the user
   * showing up. Packets go back to the orphan pool (or stay under the user
   * when they owned the material) and wallet locks are refunded.
   * Returns the number of cancelled requests.
   */
  async autoCancelExpiredRequests(now: Date = new Date()): Promise<number> {
    const approved = await this.requestRepository.find({
      where: { status: RequestStatusEnum.APPROVED },
      relations: { warehouse: true, packet: true, user: true },
    });

    let cancelled = 0;

    for (const request of approved) {
      const end = this.getDeliveryDayEnd(request);
      if (!end || now.getTime() < end.getTime()) continue;

      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();
      await queryRunner.startTransaction();

      try {
        const locked = await queryRunner.manager.findOne(WarehouseRequestEntity, {
          where: { id: request.id, status: RequestStatusEnum.APPROVED },
          lock: { mode: "pessimistic_write" },
        });

        if (!locked) {
          await queryRunner.rollbackTransaction();
          continue;
        }

        let packet: PacketEntity | null = null;
        if (locked.packetId) {
          packet = await queryRunner.manager.findOne(PacketEntity, {
            where: { id: locked.packetId },
            lock: { mode: "pessimistic_write" },
          });
        }
        locked.packet = packet;

        locked.status = RequestStatusEnum.CANCELLED;
        locked.processedAt = now;
        await queryRunner.manager.save(locked);

        if (locked.type === RequestTypeEnum.OUTPUT) {
          await this.unlockWalletForRejectedWithdraw(queryRunner, locked);
          if (packet) {
            await this.returnPacketToPool(queryRunner, locked, packet);
          }
        } else if (locked.type === RequestTypeEnum.INPUT && packet) {
          await queryRunner.manager.softDelete(PacketEntity, packet.id);
        }

        await this.addHistory(queryRunner, {
          requestId: locked.id,
          packetId: locked.packetId,
          warehouseId: locked.warehouseId,
          action: "REQUEST_AUTO_CANCELLED_NO_SHOW",
          description: `Request ${locked.id} auto-cancelled: user did not show up before the end of the delivery day`,
          performedBy: "system",
          performedRole: "SYSTEM",
        });

        await this.syncLinkedRecord(queryRunner, locked);

        await queryRunner.commitTransaction();
        cancelled++;

        if (locked.user?.phone) {
          try {
            await this.smsService.sendSMS(
              locked.user.phone,
              `Your ${locked.type === RequestTypeEnum.OUTPUT ? "withdrawal" : "deposit"} request ${locked.id} was cancelled because you did not show up before the end of the delivery day.`
            );
          } catch (e) {
            this.logger.warn(`Failed to notify user ${locked.userId} about auto-cancel`);
          }
        }
      } catch (error) {
        await queryRunner.rollbackTransaction();
        this.logger.error(`Failed to auto-cancel request ${request.id}: ${(error as any).message}`);
      } finally {
        await queryRunner.release();
      }
    }

    return cancelled;
  }

  /**
   * Computes the end of the delivery day for an approved request (Asia/Tehran):
   * - end time from the warehouse delivery schedule for that weekday,
   * - otherwise the end of the calendar day (23:59:59).
   * Returns null when no deliveryDate exists.
   */
  private getDeliveryDayEnd(request: WarehouseRequestEntity): Date | null {
    if (!request.deliveryDate) return null;

    const parts = this.tehranParts(request.deliveryDate);
    const weekday = this.tehranWeekdayName(request.deliveryDate);

    let endHour = 23;
    let endMinute = 59;
    let endSecond = 59;

    const schedule = request.warehouse?.deliverySchedule;
    if (schedule && schedule[weekday]?.end) {
      const [h, m] = String(schedule[weekday].end).split(":").map((x) => Number(x));
      if (!Number.isNaN(h)) endHour = h;
      if (!Number.isNaN(m)) endMinute = m;
      endSecond = 0;
    }

    const localMs = Date.UTC(parts.year, parts.month - 1, parts.day, endHour, endMinute, endSecond);
    return new Date(localMs - 3.5 * 3600 * 1000);
  }

  private tehranParts(date: Date): { year: number; month: number; day: number } {
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tehran",
      year: "numeric",
      month: "numeric",
      day: "numeric",
    }).format(date);
    const [m, d, y] = s.split("/").map(Number);
    return { year: y, month: m, day: d };
  }

  private tehranWeekdayName(date: Date): string {
    const s = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Tehran",
      weekday: "long",
    }).format(date);
    return s.toLowerCase();
  }

  async cancelRequest(userId: string, requestId: string): Promise<WarehouseRequestEntity> {
    const request = await this.requestRepository.findOne({
      where: { id: requestId, userId },
      relations: { packet: true },
    });

    if (!request) {
      throw new NotFoundException("Request not found");
    }

    if (request.status !== RequestStatusEnum.PENDING) {
      throw new BadRequestException("Cannot cancel a non-pending request");
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      request.status = RequestStatusEnum.CANCELLED;

      if (request.type === RequestTypeEnum.INPUT) {
        if (request.packet) {
          await queryRunner.manager.softDelete(PacketEntity, request.packet.id);
        }
      } else if (request.type === RequestTypeEnum.OUTPUT) {
        await this.unlockWalletForRejectedWithdraw(queryRunner, request);
        if (request.packet) {
          await this.returnPacketToPool(queryRunner, request, request.packet);
        }
      }

      const saved = await queryRunner.manager.save(request);

      await this.addHistory(queryRunner, {
        requestId: saved.id,
        action: "REQUEST_CANCELLED",
        description: `Request cancelled by user ${userId}`,
        performedBy: userId,
        performedRole: "USER",
      });

      await this.syncLinkedRecord(queryRunner, saved);

      await queryRunner.commitTransaction();
      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async getWalletForUpdate(queryRunner: any, userId: string, symbolId: string): Promise<WalletEntity> {
    let wallet = await queryRunner.manager.findOne(WalletEntity, {
      where: { userId, symbolId },
      lock: { mode: "pessimistic_write" },
    });

    if (!wallet) {
      wallet = queryRunner.manager.create(WalletEntity, {
        userId,
        symbolId,
        freeBalance: 0,
        lockedBalance: 0,
        status: "ACTIVE",
      });
      wallet = await queryRunner.manager.save(wallet);
    }

    wallet.freeBalance = Number(wallet.freeBalance) || 0;
    wallet.lockedBalance = Number(wallet.lockedBalance) || 0;
    wallet.frozenFreeBalance = Number(wallet.frozenFreeBalance) || 0;
    wallet.frozenLockedBalance = Number(wallet.frozenLockedBalance) || 0;

    return wallet;
  }

  private createTransactionRecord(
    wallet: WalletEntity,
    transactionType: TransactionTypeEnum,
    amount: number,
    status: TransactionStatusEnum,
    description: string,
    metadata: any
  ): TransactionEntity {
    const transaction = new TransactionEntity();
    transaction.walletId = wallet.id;
    transaction.wallet = wallet;
    transaction.transactionId = `TXN-${crypto.randomUUID().split("-")[0].toUpperCase()}`;
    transaction.transactionType = transactionType;
    transaction.status = status;
    transaction.amount = amount;
    transaction.fee = 0;
    transaction.description = description;
    transaction.metadata = {
      ...metadata,
      amountPrecise: new Decimal(amount).toString(),
      walletBalanceAfter: {
        free: new Decimal(wallet.freeBalance).toString(),
        locked: new Decimal(wallet.lockedBalance).toString(),
      },
    };
    if (status === TransactionStatusEnum.COMPLETED) {
      transaction.completedAt = new Date();
    }
    return transaction;
  }

  private getDeliveryInfoFromWarehouse(warehouse: WarehouseEntity): { date: Date; time: string | null } {
    if (warehouse.deliverySchedule && Object.keys(warehouse.deliverySchedule).length > 0) {
      const dayNames = Object.keys(warehouse.deliverySchedule);
      const dayName = dayNames[0].toLowerCase();
      const schedule = warehouse.deliverySchedule[dayNames[0]];

      const dayMap: Record<string, number> = {
        sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
      };

      const targetDay = dayMap[dayName];
      if (targetDay !== undefined) {
        const now = new Date();
        const currentDay = now.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7;

        const nextDate = new Date(now);
        nextDate.setDate(now.getDate() + daysUntil);

        return { date: nextDate, time: schedule?.start || null };
      }
    }

    return {
      date: warehouse.deliveryDates?.length ? new Date(warehouse.deliveryDates[0]) : new Date(),
      time: warehouse.timeLimit || null,
    };
  }

  private async addHistory(
    queryRunner: any,
    data: {
      warehouseId?: string;
      packetId?: string;
      requestId?: string;
      action: string;
      description?: string;
      performedBy?: string;
      performedRole?: string;
      metadata?: any;
    }
  ): Promise<void> {
    const repo = queryRunner
      ? queryRunner.manager.getRepository(WarehouseHistoryEntity)
      : this.historyRepository;

    const history = repo.create(data);
    await repo.save(history);
  }
}