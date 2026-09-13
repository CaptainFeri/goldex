import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import Decimal from "decimal.js";
import { WarehouseRequestEntity } from "../entity/warehouse-request.entity";
import { WarehouseHistoryEntity } from "../entity/warehouse-history.entity";
import { PacketEntity } from "../entity/packet.entity";
import { WarehouseEntity } from "../entity/warehouse.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { WalletTypeEnum } from "../../wallet/enum/wallet-type.enum";
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
import { WarehouseVoucherService } from "./warehouse-voucher.service";
import { ConfirmMaterialDto, ConfirmMaterialPartDto } from "../admin/dto/confirm-material.dto";
import { TOLERANCE_GRAMS, computeNetWeight } from "../constants/warehouse.constants";

Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21,
});

/** One package as the admin described it on the confirm-material call. */
export type ConfirmMaterialPart = ConfirmMaterialPartDto;

/** The confirm-material payload, whether it names one package or several. */
export type ConfirmMaterialInput = ConfirmMaterialDto;

/** A part once its net weight has been settled from the scale readings. */
interface IntakePart extends ConfirmMaterialPart {
  netWeight: Decimal;
  apparentWeight: number;
}

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
    private readonly voucherService: WarehouseVoucherService,
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
      // What the user says they are bringing. What is credited is what the
      // admin confirms on the scale, which lands in `actualWeight`.
      declaredWeight: dto.weight,
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

  /**
   * Takes the delivery in: weighs it, shelves it as one or more packages, and
   * credits the depositor.
   *
   * The amount credited is the net weight the admin confirmed on the scale,
   * never the weight the user declared when they raised the request. A user
   * may ask to deposit 100g and the metal come to 96g net once its fineness is
   * known — 96 is what enters the vault, so 96 is what the wallet and the
   * ledger get. The declared figure is kept beside it only so the variance
   * stays auditable.
   *
   * A delivery may be shelved as several packages (`parts`). That changes how
   * the metal is stored and nothing about what the depositor receives: the
   * credit is the sum of the parts' confirmed net weights.
   *
   * The packages join the system pool rather than staying under the depositor.
   * A package in the vault is a fungible unit — the one this user handed in
   * may be released to someone else on their withdrawal — because the user's
   * holding lives in their wallet, not in a particular piece of metal. Who
   * handed it in and which admin took delivery are recorded on the row so the
   * audit chain survives that.
   */
  async confirmDepositMaterial(
    requestId: string,
    adminId: string,
    materialData?: ConfirmMaterialInput
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
        throw new BadRequestException(
          `Cannot confirm material for request with status: ${request.status}. Must be APPROVED first`
        );
      }

      const placeholder = request.packetId
        ? await queryRunner.manager.findOne(PacketEntity, {
            where: { id: request.packetId },
            lock: { mode: "pessimistic_write" },
          })
        : null;

      if (!placeholder) {
        throw new BadRequestException("No packet associated with this deposit request");
      }

      if (placeholder.status !== PacketStatusEnum.PENDING) {
        throw new BadRequestException("Packet already processed");
      }

      const declared = new Decimal(request.declaredWeight ?? request.weight);
      const parts = this.resolveIntakeParts(materialData, declared);
      const wastage = new Decimal(materialData?.wastage ?? 0);

      this.assertIntakeMassConserved(materialData, parts, wastage);

      const confirmed = parts.reduce((sum, part) => sum.plus(part.netWeight), new Decimal(0));

      if (confirmed.lessThanOrEqualTo(0)) {
        throw new BadRequestException("Confirmed net weight must be greater than zero");
      }

      // The first part reuses the package created at approval so the request
      // keeps pointing at a row that exists; the rest are shelved beside it.
      const packets = await this.shelveIntakeParts(queryRunner, request, placeholder, parts, wastage, adminId);

      await this.warehouseService.updateCapacity(request.warehouseId, confirmed.toNumber(), queryRunner);

      request.status = RequestStatusEnum.COMPLETED;
      request.adminId = adminId;
      request.processedAt = new Date();
      request.declaredWeight = declared.toNumber();
      request.actualWeight = confirmed.toNumber();
      request.packet = packets[0];

      const wallet = await this.getWalletForUpdate(queryRunner, request.userId, request.symbolId);
      const variance = confirmed.minus(declared);

      if (!variance.isZero()) {
        await this.addHistory(queryRunner, {
          warehouseId: request.warehouseId,
          packetId: packets[0].id,
          requestId: request.id,
          action: "DEPOSIT_WEIGHT_VARIANCE",
          description:
            `Declared ${declared.toString()}g, confirmed ${confirmed.toString()}g ` +
            `(${variance.greaterThan(0) ? "+" : ""}${variance.toString()}g). The confirmed weight is credited.`,
          performedBy: adminId,
          performedRole: "ADMIN",
          metadata: {
            declaredWeight: declared.toString(),
            confirmedWeight: confirmed.toString(),
            variance: variance.toString(),
            wastage: wastage.toString(),
            parts: parts.map((part) => part.netWeight.toString()),
          },
        });
      }

      wallet.freeBalance = new Decimal(wallet.freeBalance).plus(confirmed).toNumber();
      await queryRunner.manager.save(wallet);

      const completedTx = this.createTransactionRecord(
        wallet,
        TransactionTypeEnum.MATERIAL_DEPOSIT,
        confirmed.toNumber(),
        TransactionStatusEnum.COMPLETED,
        `Deposit request ${request.id} completed: material received, ${confirmed.toString()} credited`,
        {
          requestId: request.id,
          packetIds: packets.map((packet) => packet.id),
          declaredWeight: declared.toString(),
          confirmedWeight: confirmed.toString(),
          confirmedBy: adminId,
        }
      );
      await queryRunner.manager.save(completedTx);

      // Booked inside the transaction: a deposit that fails after this point
      // must not leave an entry behind claiming the gold arrived.
      request.voucherId = await this.voucherService.issueForDeposit(queryRunner, request, confirmed, adminId);

      await queryRunner.manager.save(request);

      await this.addHistory(queryRunner, {
        requestId: request.id,
        packetId: packets[0].id,
        warehouseId: request.warehouseId,
        action: "DEPOSIT_MATERIAL_CONFIRMED",
        description:
          `Material confirmed for request ${request.id} as ${packets.length} package(s), ` +
          `${confirmed.toString()}g credited`,
        performedBy: adminId,
        performedRole: "ADMIN",
        metadata: {
          packetIds: packets.map((packet) => packet.id),
          confirmedWeight: confirmed.toString(),
          wastage: wastage.toString(),
          voucherId: request.voucherId,
        },
      });

      await queryRunner.commitTransaction();
      this.logger.log(
        `Deposit ${requestId} confirmed by admin ${adminId}: ${packets.length} package(s), ${confirmed.toString()}g credited`
      );

      return request;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to confirm material for request ${requestId}: ${(error as any).message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Works out the net weight of each package the delivery is shelved as.
   *
   * Net weight is always re-derived as `(apparent x fineness) / 750` when both
   * were measured, whatever weight anyone declared — that is the whole point of
   * putting the metal on a scale. A part that carries neither falls back to the
   * net weight the admin typed, and a delivery with no `parts` at all is one
   * package whose figures come from the envelope.
   */
  private resolveIntakeParts(materialData: ConfirmMaterialInput | undefined, declared: Decimal): IntakePart[] {
    const source: ConfirmMaterialPart[] = materialData?.parts?.length
      ? materialData.parts
      : [
          {
            apparentWeight: materialData?.apparentWeight,
            ayar: materialData?.ayar,
            ang: materialData?.ang,
            warehouseIndexPosition: materialData?.warehouseIndexPosition,
            picture: materialData?.picture,
          },
        ];

    return source.map((part, index) => {
      const apparent = Number(part.apparentWeight ?? 0);
      const ayar = Number(part.ayar ?? 0);

      const netWeight =
        apparent > 0 && ayar > 0
          ? new Decimal(computeNetWeight(apparent, ayar))
          : new Decimal(part.pureWeight ?? (materialData?.parts?.length ? 0 : declared.toNumber()));

      if (netWeight.lessThanOrEqualTo(0)) {
        throw new BadRequestException(
          `Package ${index + 1} has no usable weight: give either apparent weight and fineness, or a net weight`
        );
      }

      return { ...part, netWeight, apparentWeight: apparent > 0 ? apparent : netWeight.toNumber() };
    });
  }

  /**
   * Mass conservation, checked only when there is something to conserve
   * against (roadmap §4): the packages plus the wastage must come to the net
   * weight of the material as a whole.
   *
   * Without a whole-consignment weighing there is no parent figure and nothing
   * to compare to, so the admin's per-package numbers stand on their own.
   */
  private assertIntakeMassConserved(
    materialData: ConfirmMaterialInput | undefined,
    parts: IntakePart[],
    wastage: Decimal
  ): void {
    const apparent = Number(materialData?.apparentWeight ?? 0);
    const ayar = Number(materialData?.ayar ?? 0);
    if (!materialData?.parts?.length || apparent <= 0 || ayar <= 0) return;

    const whole = new Decimal(computeNetWeight(apparent, ayar));
    const accounted = parts.reduce((sum, part) => sum.plus(part.netWeight), new Decimal(0)).plus(wastage);

    if (accounted.minus(whole).absoluteValue().greaterThan(TOLERANCE_GRAMS)) {
      throw new BadRequestException(
        `Net weights do not add up: packages (${accounted.minus(wastage).toString()}g) + wastage ` +
          `(${wastage.toString()}g) != consignment (${whole.toString()}g)`
      );
    }
  }

  /**
   * Writes the packages to the shelf.
   *
   * They join the system pool — orphan, holderless — because a package in the
   * vault is fungible and may be released to any user. `senderUserId` and
   * `receivedByAdminId` record who handed it in and who took delivery, and are
   * never rewritten afterwards; `userId` is the field that moves.
   */
  private async shelveIntakeParts(
    queryRunner: any,
    request: WarehouseRequestEntity,
    placeholder: PacketEntity,
    parts: IntakePart[],
    wastage: Decimal,
    adminId: string
  ): Promise<PacketEntity[]> {
    const now = new Date();
    const batchNumber = `DEP-${request.id.split("-")[0].toUpperCase()}`;
    const idGen = () => Math.random().toString(36).substring(2, 8).toUpperCase();
    const packets: PacketEntity[] = [];

    for (const [index, part] of parts.entries()) {
      const packet =
        index === 0
          ? placeholder
          : queryRunner.manager.create(PacketEntity, {
              idSecure: `${placeholder.idSecure}-${index + 1}-${idGen()}`,
              dateTime: now,
            });

      packet.warehouseId = request.warehouseId;
      packet.symbolId = request.symbolId;
      packet.pureWeight = part.netWeight.toNumber();
      packet.apparentWeight = part.apparentWeight;
      packet.status = PacketStatusEnum.ORPHAN;
      packet.deliveryTime = now;
      packet.batchNumber = batchNumber;
      packet.sourceRequestId = request.id;
      packet.senderUserId = request.userId;
      packet.receivedByAdminId = adminId;
      // Fungible from here on: the holder is the pool, not the depositor.
      packet.userId = null;
      packet.isOrphan = true;

      if (part.ang !== undefined) packet.ang = part.ang;
      if (part.ayar !== undefined) packet.ayar = part.ayar;
      if (part.warehouseIndexPosition !== undefined) packet.warehouseIndexPosition = part.warehouseIndexPosition;
      if (part.picture !== undefined) packet.picture = part.picture;
      // The whole consignment's wastage belongs to the delivery, not to any one
      // package, so it is recorded once on the package the request points at.
      if (index === 0 && wastage.greaterThan(0)) packet.wastage = wastage.toNumber();

      packets.push(await queryRunner.manager.save(packet));
    }

    await this.addHistory(queryRunner, {
      requestId: request.id,
      packetId: packets[0].id,
      warehouseId: request.warehouseId,
      action: parts.length > 1 ? "DEPOSIT_SPLIT_INTO_PACKETS" : "PACKET_STORED_FROM_DEPOSIT",
      description:
        `Deposit ${request.id} shelved as ${packets.length} system package(s) ` +
        `[${packets.map((packet) => `${packet.idSecure}(${packet.pureWeight}g)`).join(", ")}]` +
        (wastage.greaterThan(0) ? ` with ${wastage.toString()}g wastage` : ""),
      performedBy: adminId,
      performedRole: "ADMIN",
      metadata: {
        packetIds: packets.map((packet) => packet.id),
        senderUserId: request.userId,
        receivedByAdminId: adminId,
        wastage: wastage.toString(),
      },
    });

    return packets;
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
          await this.processInputCompletion();
        } else if (request.type === RequestTypeEnum.OUTPUT) {
          await this.processOutputCompletion(queryRunner, request);
        }
      }

      if (dto.status === RequestStatusEnum.REJECTED) {
        if (request.type === RequestTypeEnum.OUTPUT) {
          // Unconditionally, and before anything else: the balance was locked
          // the moment the user raised the request, so it has to come back
          // whether or not a package was ever picked for them. This used to sit
          // behind a `request.packet` check, which is only ever satisfied after
          // an admin reserves one — so rejecting a request while it was still
          // pending, the common case, left the user's gold locked with nothing
          // left to release it.
          await this.unlockWalletForRejectedWithdraw(queryRunner, request);
          await this.returnPacketToPool(queryRunner, request);
        } else if (request.type === RequestTypeEnum.INPUT) {
          if (prevStatus === RequestStatusEnum.APPROVED) {
            await this.unlockWalletForRejectedDeposit(queryRunner, request);
          }
          // The placeholder written at approval, for material that never came.
          if (request.packet) {
            await queryRunner.manager.softDelete(PacketEntity, request.packet.id);
          }
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

    // A placeholder until the metal is on the scale: it holds the declared
    // weight, belongs to nobody, and is not on a shelf. confirm-material is
    // what turns it into a stored package with a confirmed weight.
    const packet = queryRunner.manager.create(PacketEntity, {
      warehouseId: request.warehouseId,
      symbolId: request.symbolId,
      pureWeight: request.weight,
      idSecure: `DEP-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      dateTime: new Date(),
      status: PacketStatusEnum.PENDING,
      sourceRequestId: request.id,
      senderUserId: request.userId,
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

  /**
   * Completing a deposit is not a status change.
   *
   * This used to credit `request.weight` — the figure the user typed when they
   * raised the request — while the confirm-material route credited what the
   * admin actually weighed. The same deposit was therefore worth 100g or 96g
   * depending on which button the admin pressed, and the warehouse capacity
   * moved by whichever number came with it.
   *
   * There is only one credit basis now: the confirmed weight. A deposit cannot
   * be completed without weighing the metal, because until it is weighed there
   * is no figure to credit.
   */
  private async processInputCompletion(): Promise<void> {
    throw new BadRequestException(
      "CONFIRM_MATERIAL_REQUIRED: complete a deposit through requests/:id/confirm-material, " +
        "which credits the weight the admin confirms on the scale"
    );
  }

  /**
   * Re-validates a withdrawal on its way from APPROVED to delivery.
   *
   * The packages were reserved when the request was approved; this confirms
   * they still are and that they still belong to this request, then settles
   * the delivery details.
   */
  private async processOutputApproval(
    queryRunner: any,
    request: WarehouseRequestEntity,
    dto: AdminProcessRequestDto
  ): Promise<void> {
    const packets = await this.reservedPacketsFor(queryRunner, request);

    if (!packets.length) throw new BadRequestException("SELECT_PACKET");

    const warehouse =
      packets[0].warehouse ||
      (await queryRunner.manager.findOne(WarehouseEntity, { where: { id: packets[0].warehouseId } }));

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
    await this.notifyWithdrawReady(request, warehouse);
  }

  /**
   * The packages a request is holding.
   *
   * Read off `reservedForRequestId` rather than the request's own metadata:
   * the packet row is where a reservation actually lives, so this cannot drift
   * from it, and a combination ties several packages to one request while
   * `warehouse_request.packet_id` can only name one.
   */
  private async reservedPacketsFor(queryRunner: any, request: WarehouseRequestEntity): Promise<PacketEntity[]> {
    return queryRunner.manager.find(PacketEntity, {
      where: { reservedForRequestId: request.id, status: PacketStatusEnum.RESERVED },
      lock: { mode: "pessimistic_write" },
      relations: { warehouse: true },
    });
  }

  /**
   * Puts reserved packages back on the shelf when a withdrawal does not happen.
   *
   * Straight back to ORPHAN with the reservation cleared. There is no longer a
   * question of where a package came from — the pool is where every package
   * belongs, and the depositor's own claim lives in their wallet.
   */
  private async returnPacketToPool(queryRunner: any, request: WarehouseRequestEntity): Promise<void> {
    const packets = await this.reservedPacketsFor(queryRunner, request);
    if (!packets.length) return;

    for (const packet of packets) {
      packet.status = PacketStatusEnum.ORPHAN;
      packet.isOrphan = true;
      packet.userId = null;
      packet.reservedForRequestId = null;
      packet.deliveryTime = null;
      await queryRunner.manager.save(packet);
    }

    await this.addHistory(queryRunner, {
      requestId: request.id,
      packetId: packets[0].id,
      warehouseId: packets[0].warehouseId,
      action: "PACKETS_RETURNED_TO_POOL",
      description:
        `${packets.length} package(s) released back to the pool after request ${request.id} ` +
        `[${packets.map((packet) => packet.idSecure).join(", ")}]`,
      metadata: { packetIds: packets.map((packet) => packet.id) },
    });
  }

  /**
   * Hands the metal over and settles the wallet.
   *
   * The packages leave whole. Whatever the handover falls short of the request
   * comes back to the wallet digitally — the roadmap's 50g asked for, 48g
   * delivered, 2g refunded — with differences under the tolerance threshold
   * treated as zero.
   *
   * `deliveredToUserId` and `deliveredByAdminId` are written here and never
   * again: together with the sender pair recorded at intake they are the whole
   * chain of custody for that piece of metal.
   */
  private async processOutputCompletion(queryRunner: any, request: WarehouseRequestEntity): Promise<void> {
    const requested = new Decimal(request.weight);
    const packets = await this.reservedPacketsFor(queryRunner, request);

    if (!packets.length) {
      throw new BadRequestException("No reserved packages found for this withdrawal request");
    }

    const now = new Date();
    let exitedWeight = new Decimal(0);

    for (const packet of packets) {
      packet.status = PacketStatusEnum.WITHDRAWN;
      packet.deliveryTime = now;
      packet.reservedForRequestId = null;
      packet.deliveredToUserId = request.userId;
      packet.deliveredByAdminId = request.adminId;
      await queryRunner.manager.save(packet);
      exitedWeight = exitedWeight.plus(new Decimal(packet.pureWeight));
    }

    if (exitedWeight.minus(requested).greaterThan(TOLERANCE_GRAMS)) {
      throw new BadRequestException(
        `Delivered package weight (${exitedWeight.toString()}) exceeds the requested amount (${requested.toString()})`
      );
    }

    // Tolerance threshold (roadmap §4): differences at or under 0.05g are zero.
    const rawRefund = requested.minus(exitedWeight);
    const refundedWeight = rawRefund.absoluteValue().lessThanOrEqualTo(TOLERANCE_GRAMS)
      ? new Decimal(0)
      : rawRefund;

    await this.warehouseService.updateCapacity(request.warehouseId, -exitedWeight.toNumber(), queryRunner);

    const wallet = await this.getWalletForUpdate(queryRunner, request.userId, request.symbolId);

    wallet.lockedBalance = new Decimal(wallet.lockedBalance).minus(requested).toNumber();
    if (refundedWeight.greaterThan(0)) {
      wallet.freeBalance = new Decimal(wallet.freeBalance).plus(refundedWeight).toNumber();
    }
    await queryRunner.manager.save(wallet);

    request.actualWeight = exitedWeight.toNumber();
    request.declaredWeight = request.declaredWeight ?? requested.toNumber();

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
      pendingTx.completedAt = now;
      pendingTx.metadata = {
        ...pendingTx.metadata,
        completedAt: now.toISOString(),
        completedBy: request.adminId,
        exitedWeight: exitedWeight.toString(),
        refundedWeight: refundedWeight.toString(),
      };
      await queryRunner.manager.save(pendingTx);
    }

    // The ledger records what physically left, not what was asked for — same
    // rule as a deposit, where the confirmed weight is the one that counts.
    request.voucherId = await this.voucherService.issueForWithdraw(
      queryRunner,
      request,
      exitedWeight,
      request.adminId
    );

    await this.addHistory(queryRunner, {
      requestId: request.id,
      packetId: packets[0].id,
      warehouseId: request.warehouseId,
      action: "WITHDRAW_DELIVERED",
      description:
        `${packets.length} package(s) totalling ${exitedWeight.toString()}g delivered to user ${request.userId} ` +
        `by admin ${request.adminId}` +
        (refundedWeight.greaterThan(0) ? `, ${refundedWeight.toString()}g refunded to the wallet` : ""),
      performedBy: request.adminId,
      performedRole: "ADMIN",
      metadata: {
        packetIds: packets.map((packet) => packet.id),
        deliveredToUserId: request.userId,
        deliveredByAdminId: request.adminId,
        exitedWeight: exitedWeight.toString(),
        refundedWeight: refundedWeight.toString(),
        voucherId: request.voucherId,
      },
    });
  }

  /**
   * Reverses a rejected deposit.
   *
   * A deposit credits nothing until the metal is on the scale and confirmed,
   * and locks nothing while it is pending, so a rejection has no balance to
   * undo — only a stray pending transaction to close out.
   *
   * This used to subtract the amount from `lockedBalance` **and** from
   * `freeBalance`, taking twice the deposit off a user whose deposit was
   * turned away. It never fired in practice because the warehouse writes no
   * pending MATERIAL_DEPOSIT row, which is the only reason it was survivable.
   */
  private async unlockWalletForRejectedDeposit(queryRunner: any, request: WarehouseRequestEntity): Promise<void> {
    const wallet = await this.getWalletForUpdate(queryRunner, request.userId, request.symbolId);

    const pendingTx = await queryRunner.manager.findOne(TransactionEntity, {
      where: {
        walletId: wallet.id,
        transactionType: TransactionTypeEnum.MATERIAL_DEPOSIT,
        status: TransactionStatusEnum.PENDING,
      },
      order: { createAt: "DESC" },
      lock: { mode: "pessimistic_write" },
    });

    if (!pendingTx) return;

    pendingTx.status = TransactionStatusEnum.REFUNDED;
    pendingTx.completedAt = new Date();
    pendingTx.metadata = {
      ...pendingTx.metadata,
      rejectedAt: new Date().toISOString(),
      rejectedBy: request.adminId,
    };
    await queryRunner.manager.save(pendingTx);
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
   * Applies one of the options `suggestForRequest` offered (roadmap §3).
   *
   * Every strategy reduces to the same act — hold these packages for this
   * request — because the vault is one pool of fungible packages. The old
   * "the user's own packet, split to size" branch is gone with the ownership
   * it depended on.
   */
  async applyAllocationOption(
    requestId: string,
    adminId: string,
    optionKey: string
  ): Promise<WarehouseRequestEntity> {
    const { kind, packetIds } = this.allocationService.parseOptionKey(optionKey);
    if (!kind) throw new BadRequestException("Missing allocation strategy");

    if (kind !== "exact" && kind !== "fit" && kind !== "combination") {
      throw new BadRequestException(`Unknown allocation strategy: ${kind}`);
    }
    if (!packetIds.length) throw new BadRequestException("Allocation option names no packages");
    if (kind !== "combination" && packetIds.length !== 1) {
      throw new BadRequestException("This strategy expects exactly one package");
    }

    return this.reservePacketsForRequest(requestId, adminId, packetIds);
  }

  /** Holds one named package for a withdrawal request. */
  async assignPacketToRequest(requestId: string, packetId: string, adminId: string): Promise<WarehouseRequestEntity> {
    return this.reservePacketsForRequest(requestId, adminId, [packetId]);
  }

  /**
   * Approves a withdrawal against an explicitly chosen package, letting the
   * admin record what they saw on the scale as they pull it off the shelf.
   *
   * No splitting: a package is handed over whole, and the difference between
   * it and the request comes back to the wallet digitally. Splitting used to
   * exist to carve an exact amount out of a package the user owned, and the
   * user owns no packages now.
   */
  async approveWithdrawForOutput(
    requestId: string,
    adminId: string,
    dto: ApproveWithdrawOutputDto
  ): Promise<WarehouseRequestEntity> {
    if (!dto.packetId) throw new BadRequestException("SELECT_PACKET");

    return this.reservePacketsForRequest(requestId, adminId, [dto.packetId], {
      ang: dto.ang1,
      ayar: dto.ayar1,
      position: dto.position1,
      picture: dto.picture1,
      deliveryDate: dto.deliveryDate,
      deliveryTime: dto.deliveryTime,
      deliveryLocation: dto.deliveryLocation,
    });
  }

  /**
   * Holds the chosen packages for a withdrawal request and approves it.
   *
   * The packages move to RESERVED rather than to the requester's name. They
   * are still the system's — a reservation is "nobody else may take this
   * while an admin is working on it", not a transfer — and ownership only
   * ever shows up as `deliveredToUserId` at the moment the metal leaves.
   * Assignment used to mark a package IN_WAREHOUSE under the requesting user,
   * which is indistinguishable from a package simply sitting on the shelf, so
   * two withdrawals could be approved against the same metal.
   *
   * Everything is taken under a row lock and re-checked after: a package that
   * was free when the options were listed may have been taken in the meantime.
   */
  private async reservePacketsForRequest(
    requestId: string,
    adminId: string,
    packetIds: string[],
    qc?: {
      ang?: number;
      ayar?: number;
      position?: string;
      picture?: string;
      deliveryDate?: string;
      deliveryTime?: string;
      deliveryLocation?: string;
    }
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

      const requested = new Decimal(request.weight);
      const packets: PacketEntity[] = [];
      let totalWeight = new Decimal(0);

      for (const packetId of packetIds) {
        const packet = await queryRunner.manager.findOne(PacketEntity, {
          where: { id: packetId },
          lock: { mode: "pessimistic_write" },
          relations: { warehouse: true },
        });

        if (!packet) throw new NotFoundException(`Packet not found: ${packetId}`);

        // Re-checked under the lock: the shelf may have moved since the admin
        // was shown the options.
        if (packet.status !== PacketStatusEnum.ORPHAN) {
          throw new BadRequestException(
            `Packet ${packet.idSecure} is no longer available (status: ${packet.status})`
          );
        }
        if (request.warehouseId && packet.warehouseId !== request.warehouseId) {
          throw new BadRequestException(
            `Packet ${packet.idSecure} is in another warehouse than the request names`
          );
        }
        if (request.symbolId && packet.symbolId && packet.symbolId !== request.symbolId) {
          throw new BadRequestException(`Packet ${packet.idSecure} holds a different material than requested`);
        }

        packets.push(packet);
        totalWeight = totalWeight.plus(new Decimal(packet.pureWeight));
      }

      // Handing over more than was asked for would give away metal the user
      // has not paid for, and there is nothing to charge the excess against.
      if (totalWeight.minus(requested).greaterThan(TOLERANCE_GRAMS)) {
        throw new BadRequestException(
          `Selected packages (${totalWeight.toString()}g) exceed the requested amount (${requested.toString()}g)`
        );
      }

      for (const [index, packet] of packets.entries()) {
        packet.status = PacketStatusEnum.RESERVED;
        packet.reservedForRequestId = request.id;
        // The QC readings the admin took describe the package they picked up,
        // which is the first one when several make up the handover.
        if (index === 0 && qc) {
          if (qc.ang !== undefined) packet.ang = qc.ang;
          if (qc.ayar !== undefined) packet.ayar = qc.ayar;
          if (qc.position !== undefined) packet.warehouseIndexPosition = qc.position;
          if (qc.picture) packet.picture = qc.picture;
        }
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
          strategy: packets.length > 1 ? "combination" : "single",
          packetIds: packets.map((packet) => packet.id),
          totalWeight: totalWeight.toNumber(),
          refundWeight: Decimal.max(0, requested.minus(totalWeight)).toNumber(),
        },
      };

      const warehouse = packets[0].warehouse || null;

      if (qc?.deliveryDate) request.deliveryDate = new Date(qc.deliveryDate);
      if (qc?.deliveryTime) request.deliveryTime = qc.deliveryTime;
      if (qc?.deliveryLocation) request.deliveryLocation = qc.deliveryLocation;

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
        action: packets.length > 1 ? "PACKET_COMBINATION_RESERVED" : "PACKET_RESERVED",
        description:
          `${packets.length} package(s) totalling ${totalWeight.toString()}g reserved for withdraw request ` +
          `${request.id} by admin ${adminId} ` +
          `[${packets.map((packet) => `${packet.idSecure}(${packet.pureWeight}g)`).join(", ")}]`,
        performedBy: adminId,
        performedRole: "ADMIN",
        metadata: {
          packetIds: packets.map((packet) => packet.id),
          totalWeight: totalWeight.toString(),
          refundWeight: Decimal.max(0, requested.minus(totalWeight)).toString(),
        },
      });

      await this.syncLinkedRecord(queryRunner, request);
      await queryRunner.commitTransaction();
      this.logger.log(
        `Withdraw request ${requestId} approved by admin ${adminId} against ${packets.length} package(s)`
      );

      await this.notifyWithdrawReady(request, warehouse);

      return this.getRequestById(request.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Tells the user their metal is ready.
   *
   * Outside the transaction, and never able to fail it: an SMS that does not
   * send is not a reason to un-reserve gold that is sitting on the counter.
   */
  private async notifyWithdrawReady(request: WarehouseRequestEntity, warehouse: WarehouseEntity | null): Promise<void> {
    try {
      const user = await this.dataSource.manager.findOne(UserEntity, { where: { id: request.userId } });
      if (!user?.phone) return;

      const details = [
        request.deliveryDate ? `date: ${request.deliveryDate.toISOString().split("T")[0]}` : null,
        request.deliveryTime ? `time: ${request.deliveryTime}` : null,
        request.deliveryLocation || warehouse?.location ? `location: ${request.deliveryLocation || warehouse?.location}` : null,
      ].filter(Boolean);

      await this.smsService.sendSMS(
        user.phone,
        `Your gold withdrawal request ${request.id} is ready for pickup. ` +
          (details.length ? details.join(", ") : "Please check the warehouse for details.")
      );
    } catch (error) {
      this.logger.warn(
        `Failed to notify user ${request.userId} about withdrawal ${request.id}: ${(error as any).message}`
      );
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
          await this.returnPacketToPool(queryRunner, locked);
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
        await this.returnPacketToPool(queryRunner, request);
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
      where: { userId, symbolId, walletType: WalletTypeEnum.DEPOSIT },
      lock: { mode: "pessimistic_write" },
    });

    if (!wallet) {
      wallet = queryRunner.manager.create(WalletEntity, {
        userId,
        symbolId,
        walletType: WalletTypeEnum.DEPOSIT,
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