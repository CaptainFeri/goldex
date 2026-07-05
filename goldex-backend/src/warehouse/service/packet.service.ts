import Decimal from "decimal.js";
import { Readable } from "stream";
import { Injectable, NotFoundException, BadRequestException, Logger, Inject, forwardRef } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, In } from "typeorm";
import { PacketEntity } from "../entity/packet.entity";
import { WarehouseHistoryEntity } from "../entity/warehouse-history.entity";
import { WarehouseEntity } from "../entity/warehouse.entity";
import { WarehouseRequestEntity } from "../entity/warehouse-request.entity";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { TransactionEntity } from "../../wallet/entities/transaction.entity";
import { TransactionTypeEnum } from "../../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../../wallet/enum/transaction.status.enum";
import { MinioService } from "../../minio/minio.service";
import { AdminCreatePacketDto } from "../admin/dto/admin-create-packet.dto";
import { AdminUpdatePacketDto } from "../admin/dto/admin-update-packet.dto";
import { CreateSettlementPacketDto } from "../admin/dto/create-settlement-packet.dto";
import { PacketStatusEnum } from "../enum/packet-status.enum";
import { RequestStatusEnum } from "../enum/request-status.enum";
import { RequestTypeEnum } from "../enum/request-type.enum";
import { WarehouseService } from "./warehouse.service";
import { SmsService } from "../../sms/sms.service";

@Injectable()
export class PacketService {
  private readonly logger = new Logger(PacketService.name);

  constructor(
    @InjectRepository(PacketEntity)
    private readonly packetRepository: Repository<PacketEntity>,
    @InjectRepository(WarehouseHistoryEntity)
    private readonly historyRepository: Repository<WarehouseHistoryEntity>,
    @InjectRepository(WarehouseRequestEntity)
    private readonly requestRepository: Repository<WarehouseRequestEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    private readonly warehouseService: WarehouseService,
    private readonly minioService: MinioService,
    private readonly smsService: SmsService,
    private readonly dataSource: DataSource
  ) {}

  async create(dto: AdminCreatePacketDto, pictureFile?: Express.Multer.File): Promise<PacketEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.warehouseService.updateCapacity(dto.warehouseId, dto.pureWeight, queryRunner);

      let pictureUrl: string | undefined;

      if (pictureFile) {
        const fileInfo = await this.minioService.uploadFile(
          {
            stream: pictureFile.buffer,
            objectName: pictureFile.originalname,
            size: pictureFile.size,
            contentType: pictureFile.mimetype,
          },
          `packet-${dto.idSecure}`
        );
        pictureUrl = fileInfo.url;
      }

      const packet = this.packetRepository.create({
        warehouseId: dto.warehouseId,
        pureWeight: dto.pureWeight,
        idSecure: dto.idSecure,
        dateTime: new Date(),
        status: dto.isOrphan ? PacketStatusEnum.ORPHAN : PacketStatusEnum.IN_WAREHOUSE,
        warehouseIndexPosition: dto.warehouseIndexPosition,
        ang: dto.ang,
        ayar: dto.ayar,
        picture: pictureUrl || dto.picture,
        userId: dto.userId,
        qrCode: dto.qrCode,
        batchNumber: dto.batchNumber,
        isOrphan: dto.isOrphan || false,
      });

      const saved = await queryRunner.manager.save(packet);

      await this.addHistory(queryRunner, {
        warehouseId: dto.warehouseId,
        packetId: saved.id,
        action: "PACKET_CREATED",
        description: `Packet ${saved.idSecure} created in warehouse ${dto.warehouseId}`,
        metadata: { pureWeight: dto.pureWeight, isOrphan: dto.isOrphan },
      });

      if (dto.isOrphan) {
        await this.tryAutoAssignToPendingWithdraw(queryRunner, saved);
      }

      await queryRunner.commitTransaction();
      this.logger.log(`Packet created: ${saved.id} (${saved.idSecure})`);

      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to create packet: ${(error as any).message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createFromSettlement(dto: CreateSettlementPacketDto): Promise<PacketEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.warehouseService.updateCapacity(dto.warehouseId, dto.pureWeight, queryRunner);

      const idSecure = dto.idSecure || `STL-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

      const packet = this.packetRepository.create({
        warehouseId: dto.warehouseId,
        pureWeight: dto.pureWeight,
        idSecure,
        dateTime: new Date(),
        status: PacketStatusEnum.ORPHAN,
        warehouseIndexPosition: dto.warehouseIndexPosition,
        ang: dto.ang,
        ayar: dto.ayar,
        isOrphan: true,
        batchNumber: dto.batchNumber || `STL-${dto.providerKey}-${Date.now()}`,
      });

      const saved = await queryRunner.manager.save(packet);

      await this.addHistory(queryRunner, {
        warehouseId: dto.warehouseId,
        packetId: saved.id,
        action: "SETTLEMENT_PACKET_CREATED",
        description: `Orphan packet ${saved.idSecure} created from settlement with provider ${dto.providerKey}, weight ${dto.pureWeight}`,
        metadata: { providerKey: dto.providerKey, pureWeight: dto.pureWeight },
      });

      await this.tryAutoAssignToPendingWithdraw(queryRunner, saved);

      await queryRunner.commitTransaction();
      this.logger.log(`Settlement packet created: ${saved.id} (${saved.idSecure}) from provider ${dto.providerKey}`);

      return saved;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to create settlement packet: ${(error as any).message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async findAll(query: {
    status?: PacketStatusEnum;
    warehouseId?: string;
    userId?: string;
    limit?: string;
    offset?: string;
  }): Promise<{ packets: PacketEntity[]; total: number }> {
    const { status, warehouseId, userId, limit = "10", offset = "0" } = query;

    const queryBuilder = this.packetRepository
      .createQueryBuilder("packet")
      .leftJoinAndSelect("packet.warehouse", "warehouse")
      .leftJoinAndSelect("packet.user", "user");

    if (status) {
      queryBuilder.andWhere("packet.status = :status", { status });
    }

    if (warehouseId) {
      queryBuilder.andWhere("packet.warehouse_id = :warehouseId", { warehouseId });
    }

    if (userId) {
      queryBuilder.andWhere("packet.user_id = :userId", { userId });
    }

    queryBuilder.orderBy("packet.created_at", "DESC").skip(Number(offset)).take(Number(limit));

    const [packets, total] = await queryBuilder.getManyAndCount();
    return { packets, total };
  }

  async findById(id: string): Promise<PacketEntity> {
    const packet = await this.packetRepository.findOne({
      where: { id },
      relations: { warehouse: true, user: true },
    });

    if (!packet) {
      throw new NotFoundException("Packet not found");
    }

    return packet;
  }

  async update(id: string, dto: AdminUpdatePacketDto): Promise<PacketEntity> {
    const packet = await this.findById(id);

    if (dto.pureWeight !== undefined) packet.pureWeight = dto.pureWeight;
    if (dto.idSecure !== undefined) packet.idSecure = dto.idSecure;
    if (dto.warehouseIndexPosition !== undefined) packet.warehouseIndexPosition = dto.warehouseIndexPosition;
    if (dto.ang !== undefined) packet.ang = dto.ang;
    if (dto.ayar !== undefined) packet.ayar = dto.ayar;
    if (dto.picture !== undefined) packet.picture = dto.picture;
    if (dto.qrCode !== undefined) packet.qrCode = dto.qrCode;
    if (dto.batchNumber !== undefined) packet.batchNumber = dto.batchNumber;
    if (dto.isOrphan !== undefined) packet.isOrphan = dto.isOrphan;

    if (dto.userId !== undefined) {
      packet.userId = dto.userId;
      packet.user = null as any;
    }

    if (dto.status !== undefined) {
      if (dto.status === PacketStatusEnum.RELEASED && !packet.deliveryTime) {
        packet.deliveryTime = new Date();
      }

      if (
        dto.status === PacketStatusEnum.WITHDRAWN &&
        packet.status !== PacketStatusEnum.WITHDRAWN
      ) {
        await this.releaseWarehouseCapacity(packet);
        if (packet.userId) {
          await this.releaseWalletLock(packet);
        }
      }

      if (
        dto.status === PacketStatusEnum.RELEASED &&
        packet.status !== PacketStatusEnum.RELEASED
      ) {
        await this.releaseWarehouseCapacity(packet);
      }

      packet.status = dto.status;
    }

    const saved = await this.packetRepository.save(packet);

    await this.addHistory(null, {
      warehouseId: saved.warehouseId,
      packetId: saved.id,
      action: "PACKET_UPDATED",
      description: `Packet ${saved.idSecure} updated`,
    });

    return saved;
  }

  async remove(id: string): Promise<void> {
    const packet = await this.findById(id);

    if (packet.status === PacketStatusEnum.IN_WAREHOUSE) {
      throw new BadRequestException("Cannot delete a packet that is in warehouse. Release it first.");
    }

    await this.packetRepository.softDelete(id);

    await this.addHistory(null, {
      warehouseId: packet.warehouseId,
      packetId: id,
      action: "PACKET_DELETED",
      description: `Packet ${packet.idSecure} deleted`,
    });
  }

  async findOrphanPackets(warehouseId?: string): Promise<PacketEntity[]> {
    const where: any = { isOrphan: true, status: PacketStatusEnum.ORPHAN };
    if (warehouseId) {
      where.warehouseId = warehouseId;
    }
    return this.packetRepository.find({
      where,
      relations: { warehouse: true },
      order: { dateTime: "ASC" },
    });
  }

  async assignPacketToUser(packetId: string, userId: string): Promise<PacketEntity> {
    const packet = await this.findById(packetId);
    if (!packet.isOrphan || packet.status !== PacketStatusEnum.ORPHAN) {
      throw new BadRequestException("Packet is not an orphan or already assigned");
    }
    packet.userId = userId;
    packet.isOrphan = false;
    packet.status = PacketStatusEnum.IN_WAREHOUSE;
    const saved = await this.packetRepository.save(packet);
    await this.addHistory(null, {
      warehouseId: saved.warehouseId,
      packetId: saved.id,
      action: "PACKET_ASSIGNED_TO_USER",
      description: `Orphan packet ${saved.idSecure} assigned to user ${userId}`,
    });
    return saved;
  }

  async findUserInWarehousePackets(userId: string, warehouseId?: string): Promise<PacketEntity[]> {
    const where: any = {
      userId,
      status: PacketStatusEnum.IN_WAREHOUSE,
      isOrphan: false,
    };
    if (warehouseId) where.warehouseId = warehouseId;
    return this.packetRepository.find({
      where,
      relations: { warehouse: true },
      order: { dateTime: "ASC" },
    });
  }

  async splitPacket(
    packetId: string,
    splitWeight: number,
    queryRunner: any
  ): Promise<{ remainingPacket: PacketEntity | null; outputPacket: PacketEntity }> {
    const packet = await queryRunner.manager.findOne(PacketEntity, {
      where: { id: packetId },
      lock: { mode: "pessimistic_write" },
    });

    if (!packet) throw new NotFoundException("Packet not found");
    if (packet.status !== PacketStatusEnum.IN_WAREHOUSE) {
      throw new BadRequestException("Packet must be IN_WAREHOUSE to split");
    }
    if (packet.isOrphan) {
      throw new BadRequestException("Cannot split an orphan packet");
    }

    const packetWeight = new Decimal(packet.pureWeight);
    const withdrawWeight = new Decimal(splitWeight);

    if (withdrawWeight.greaterThan(packetWeight)) {
      throw new BadRequestException(
        `Packet weight (${packetWeight.toString()}) is less than withdraw amount (${withdrawWeight.toString()})`
      );
    }

    const remainingWeight = packetWeight.minus(withdrawWeight);

    const now = new Date();
    const idGen = () => Math.random().toString(36).substring(2, 8).toUpperCase();

    const outputPacket = queryRunner.manager.create(PacketEntity, {
      warehouseId: packet.warehouseId,
      userId: packet.userId,
      pureWeight: withdrawWeight.toNumber(),
      idSecure: `OUT-${Date.now()}-${idGen()}`,
      dateTime: now,
      status: PacketStatusEnum.WITHDRAWN,
      deliveryTime: now,
      ang: packet.ang,
      ayar: packet.ayar,
      isOrphan: false,
      batchNumber: packet.batchNumber,
      warehouseIndexPosition: packet.warehouseIndexPosition,
    });
    await queryRunner.manager.save(outputPacket);

    let remainingPacket: PacketEntity | null = null;

    if (remainingWeight.greaterThan(0)) {
      remainingPacket = queryRunner.manager.create(PacketEntity, {
        warehouseId: packet.warehouseId,
        userId: packet.userId,
        pureWeight: remainingWeight.toNumber(),
        idSecure: `REM-${Date.now()}-${idGen()}`,
        dateTime: now,
        status: PacketStatusEnum.IN_WAREHOUSE,
        ang: packet.ang,
        ayar: packet.ayar,
        isOrphan: false,
        batchNumber: packet.batchNumber,
        warehouseIndexPosition: packet.warehouseIndexPosition,
      });
      await queryRunner.manager.save(remainingPacket);
    }

    packet.status = PacketStatusEnum.WITHDRAWN;
    packet.deliveryTime = now;
    await queryRunner.manager.save(packet);

    await this.addHistory(queryRunner, {
      warehouseId: packet.warehouseId,
      packetId: packet.id,
      action: "PACKET_SPLIT",
      description: `Packet ${packet.idSecure} split: ${withdrawWeight.toString()} withdrawn, ${remainingWeight.toString()} remaining`,
      metadata: { splitWeight: withdrawWeight.toString(), remainingWeight: remainingWeight.toString(), outputPacketId: outputPacket.id },
    });

    return { remainingPacket, outputPacket };
  }

  private async tryAutoAssignToPendingWithdraw(queryRunner: any, packet: PacketEntity): Promise<void> {
    const pendingRequest = await queryRunner.manager.findOne(WarehouseRequestEntity, {
      where: {
        type: RequestTypeEnum.OUTPUT,
        status: RequestStatusEnum.PENDING,
      },
      order: { createAt: "ASC" },
    });

    if (!pendingRequest) return;

    const warehouse = await queryRunner.manager.findOne(WarehouseEntity, {
      where: { id: packet.warehouseId },
    });
    if (!warehouse) return;

    pendingRequest.packetId = packet.id;
    pendingRequest.packet = packet;
    pendingRequest.warehouseId = packet.warehouseId;
    pendingRequest.status = RequestStatusEnum.APPROVED;
    pendingRequest.deliveryLocation = warehouse.location;

    const deliveryInfo = this.getDeliveryInfoFromWarehouse(warehouse);
    pendingRequest.deliveryDate = deliveryInfo.date;
    pendingRequest.deliveryTime = deliveryInfo.time || warehouse.timeLimit || null;

    await queryRunner.manager.save(pendingRequest);

    packet.userId = pendingRequest.userId;
    packet.isOrphan = false;
    packet.status = PacketStatusEnum.IN_WAREHOUSE;
    await queryRunner.manager.save(packet);

    await this.addHistory(queryRunner, {
      warehouseId: packet.warehouseId,
      packetId: packet.id,
      requestId: pendingRequest.id,
      action: "AUTO_ASSIGNED_TO_WITHDRAW",
      description: `Orphan packet ${packet.idSecure} auto-assigned to pending withdraw request ${pendingRequest.id}`,
    });

    const user = await queryRunner.manager.findOne("user", { where: { id: pendingRequest.userId } });
    if (user && user.phone) {
      try {
        const msg = `Your withdrawal request ${pendingRequest.id} has been approved. Delivery date: ${pendingRequest.deliveryDate?.toISOString()?.split("T")[0]}, Location: ${warehouse.location || "Warehouse"}`;
        await this.smsService.sendSMS(user.phone, msg);
      } catch (e) {
        this.logger.warn(`Failed to notify user ${pendingRequest.userId} about auto-assignment`);
      }
    }
  }

  async uploadPicture(id: string, file: Express.Multer.File): Promise<PacketEntity> {
    const packet = await this.findById(id);

    const fileInfo = await this.minioService.uploadFile(
      {
        stream: file.buffer,
        objectName: file.originalname,
        size: file.size,
        contentType: file.mimetype,
      },
      `packet-${packet.idSecure}`
    );

    packet.picture = fileInfo.url;
    const saved = await this.packetRepository.save(packet);

    await this.addHistory(null, {
      warehouseId: packet.warehouseId,
      packetId: saved.id,
      action: "PACKET_PICTURE_UPLOADED",
      description: `Picture uploaded for packet ${saved.idSecure}`,
    });

    return saved;
  }

  async uploadPictureBuffer(objectName: string, file: Express.Multer.File): Promise<{ url: string; [k: string]: any }> {
    return this.minioService.uploadFile(
      {
        stream: file.buffer,
        objectName: file.originalname,
        size: file.size,
        contentType: file.mimetype,
      },
      objectName
    );
  }

  async getPictureStream(id: string): Promise<Readable> {
    const packet = await this.findById(id);
    if (!packet.picture) {
      throw new NotFoundException("Packet has no picture");
    }
    const objectName = this.extractObjectNameFromUrl(packet.picture);
    return this.minioService.getFileStream(process.env.MINIO_BUCKET, objectName);
  }

  async getPictureStat(id: string): Promise<{ size: number; contentType: string }> {
    const packet = await this.findById(id);
    if (!packet.picture) {
      throw new NotFoundException("Packet has no picture");
    }
    const objectName = this.extractObjectNameFromUrl(packet.picture);
    const stat = await this.minioService.getFileStat(process.env.MINIO_BUCKET, objectName);
    return { size: stat.size, contentType: stat.metadata?.["content-type"] || "application/octet-stream" };
  }

  private extractObjectNameFromUrl(url: string): string {
    try {
      const parsed = new URL(url);
      const pathParts = parsed.pathname.split("/").filter(Boolean);
      return decodeURIComponent(pathParts[pathParts.length - 1]);
    } catch {
      return url;
    }
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

  private async releaseWarehouseCapacity(packet: PacketEntity): Promise<void> {
    if (packet.warehouseId) {
      await this.warehouseService.updateCapacity(
        packet.warehouseId,
        -packet.pureWeight,
        null as any
      );
    }
  }

  private async releaseWalletLock(packet: PacketEntity): Promise<void> {
    try {
      const wallets = await this.walletRepository.find({
        where: { userId: packet.userId },
      });
      if (!wallets.length) return;

      const walletIds = wallets.map((w) => w.id);

      const pendingTx = await this.transactionRepository.findOne({
        where: {
          walletId: In(walletIds),
          transactionType: TransactionTypeEnum.MATERIAL_WITHDRAW,
          status: TransactionStatusEnum.PENDING,
        },
        order: { createAt: "ASC" },
      });

      if (!pendingTx) return;

      const wallet = wallets.find((w) => w.id === pendingTx.walletId);
      if (!wallet) return;

      const amount = new Decimal(pendingTx.amount);
      wallet.lockedBalance = new Decimal(wallet.lockedBalance).minus(amount).toNumber();
      await this.walletRepository.save(wallet);

      pendingTx.status = TransactionStatusEnum.COMPLETED;
      pendingTx.completedAt = new Date();
      pendingTx.metadata = {
        ...(pendingTx.metadata || {}),
        completedVia: "PACKET_STATUS_CHANGE",
        completedAt: new Date().toISOString(),
        packetId: packet.id,
      };
      await this.transactionRepository.save(pendingTx);
    } catch (e) {
      this.logger.warn(`Failed to release wallet lock for packet ${packet.id}: ${(e as Error).message}`);
    }
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
    const repo = queryRunner ? queryRunner.manager.getRepository(WarehouseHistoryEntity) : this.historyRepository;

    const history = repo.create(data);
    await repo.save(history);
  }
}
