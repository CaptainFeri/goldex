import Decimal from "decimal.js";
import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, Like, Between } from "typeorm";
import { WarehouseEntity } from "../entity/warehouse.entity";
import { WarehouseRequestEntity } from "../entity/warehouse-request.entity";
import { PacketEntity } from "../entity/packet.entity";
import { WarehouseHistoryEntity } from "../entity/warehouse-history.entity";
import { RequestTypeEnum } from "../enum/request-type.enum";
import { RequestStatusEnum } from "../enum/request-status.enum";
import { PacketStatusEnum } from "../enum/packet-status.enum";
import { AdminCreateWarehouseDto } from "../admin/dto/admin-create-warehouse.dto";
import { AdminUpdateWarehouseDto } from "../admin/dto/admin-update-warehouse.dto";
import { AdminWarehouseQueryDto } from "../admin/dto/admin-warehouse-query.dto";
import { WarehouseStatusEnum } from "../enum/warehouse-status.enum";
import { ProviderSettlementEntity, SettlementDirection } from "../../provider-finance/entity/provider-settlement.entity";

Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21,
});

@Injectable()
export class WarehouseService {
  private readonly logger = new Logger(WarehouseService.name);

  constructor(
    @InjectRepository(WarehouseEntity)
    private readonly warehouseRepository: Repository<WarehouseEntity>,
    @InjectRepository(WarehouseHistoryEntity)
    private readonly historyRepository: Repository<WarehouseHistoryEntity>,
    @InjectRepository(WarehouseRequestEntity)
    private readonly requestRepository: Repository<WarehouseRequestEntity>,
    @InjectRepository(PacketEntity)
    private readonly packetRepository: Repository<PacketEntity>,
    @InjectRepository(ProviderSettlementEntity)
    private readonly settlementRepository: Repository<ProviderSettlementEntity>,
    private readonly dataSource: DataSource
  ) {}

  async create(dto: AdminCreateWarehouseDto): Promise<WarehouseEntity> {
    const warehouse = this.warehouseRepository.create({
      name: dto.name,
      description: dto.description,
      location: dto.location,
      capacityTotal: dto.capacityTotal,
      capacityUsed: 0,
      capacityRemaining: dto.capacityTotal,
      deliveryDates: dto.deliveryDates || [],
      deliverySchedule: dto.deliverySchedule || null,
      timeLimit: dto.timeLimit,
      status: dto.status || WarehouseStatusEnum.ACTIVE,
    });

    const saved = await this.warehouseRepository.save(warehouse);

    await this.addHistory({
      warehouseId: saved.id,
      action: "WAREHOUSE_CREATED",
      description: `Warehouse "${saved.name}" created with total capacity ${saved.capacityTotal}`,
    });

    this.logger.log(`Warehouse created: ${saved.id}`);
    return saved;
  }

  async findAll(query: AdminWarehouseQueryDto): Promise<{ warehouses: WarehouseEntity[]; total: number }> {
    const { status, search, limit = "10", offset = "0" } = query;

    const queryBuilder = this.warehouseRepository.createQueryBuilder("warehouse");

    if (status) {
      queryBuilder.andWhere("warehouse.status = :status", { status });
    }

    if (search) {
      queryBuilder.andWhere("(warehouse.name ILIKE :search OR warehouse.description ILIKE :search)", {
        search: `%${search}%`,
      });
    }

    queryBuilder.orderBy("warehouse.created_at", "DESC").skip(Number(offset)).take(Number(limit));

    const [warehouses, total] = await queryBuilder.getManyAndCount();
    return { warehouses, total };
  }

  async findById(id: string): Promise<WarehouseEntity> {
    const warehouse = await this.warehouseRepository.findOne({
      where: { id },
      relations: { packets: true },
    });

    if (!warehouse) {
      throw new NotFoundException("Warehouse not found");
    }

    return warehouse;
  }

  async update(id: string, dto: AdminUpdateWarehouseDto): Promise<WarehouseEntity> {
    const warehouse = await this.findById(id);

    if (dto.name !== undefined) warehouse.name = dto.name;
    if (dto.description !== undefined) warehouse.description = dto.description;
    if (dto.location !== undefined) warehouse.location = dto.location;
    if (dto.timeLimit !== undefined) warehouse.timeLimit = dto.timeLimit;
    if (dto.status !== undefined) warehouse.status = dto.status;
    if (dto.deliveryDates !== undefined) warehouse.deliveryDates = dto.deliveryDates;
    if (dto.deliverySchedule !== undefined) warehouse.deliverySchedule = dto.deliverySchedule;

    if (dto.capacityTotal !== undefined) {
      const newTotal = new Decimal(dto.capacityTotal);
      const usedDec = new Decimal(warehouse.capacityUsed);

      if (usedDec.lessThan(0)) {
        throw new BadRequestException(
          `Warehouse capacityUsed is negative (${warehouse.capacityUsed}). Please contact support to fix data inconsistency.`
        );
      }

      if (newTotal.lessThan(usedDec)) {
        throw new BadRequestException(
          `Cannot set total capacity less than used capacity (${warehouse.capacityUsed})`
        );
      }
      warehouse.capacityTotal = dto.capacityTotal;
      warehouse.capacityRemaining = newTotal.minus(usedDec).toNumber();
    }

    const saved = await this.warehouseRepository.save(warehouse);

    await this.addHistory({
      warehouseId: saved.id,
      action: "WAREHOUSE_UPDATED",
      description: `Warehouse "${saved.name}" updated`,
    });

    return saved;
  }

  async remove(id: string): Promise<void> {
    const warehouse = await this.findById(id);

    if (new Decimal(warehouse.capacityUsed).greaterThan(0)) {
      throw new BadRequestException("Cannot delete warehouse with active packets");
    }

    await this.warehouseRepository.softDelete(id);

    await this.addHistory({
      warehouseId: id,
      action: "WAREHOUSE_DELETED",
      description: `Warehouse "${warehouse.name}" deleted`,
    });

    this.logger.log(`Warehouse deleted: ${id}`);
  }

  async getOverview(): Promise<{
    warehouses: { total: number; active: number; full: number; totalCapacity: number; usedCapacity: number };
    packets: { total: number; inWarehouse: number; pending: number; withdrawn: number; released: number; orphan: number };
    requests: { total: number; pending: number; approved: number; completed: number; rejected: number; cancelled: number };
    depositRequests: { total: number; pending: number };
    withdrawRequests: { total: number; pending: number };
  }> {
    const warehouseStats = await this.warehouseRepository
      .createQueryBuilder("w")
      .select("COUNT(w.id)", "total")
      .addSelect("COALESCE(SUM(CASE WHEN w.status = :active THEN 1 ELSE 0 END), 0)", "active")
      .addSelect("COALESCE(SUM(CASE WHEN w.status = :full THEN 1 ELSE 0 END), 0)", "full")
      .addSelect("COALESCE(SUM(w.capacity_total), 0)", "totalCapacity")
      .addSelect("COALESCE(SUM(w.capacity_used), 0)", "usedCapacity")
      .setParameters({ active: WarehouseStatusEnum.ACTIVE, full: WarehouseStatusEnum.FULL })
      .getRawOne();

    const packetStats = await this.packetRepository
      .createQueryBuilder("p")
      .select("COUNT(p.id)", "total")
      .addSelect("COALESCE(SUM(CASE WHEN p.status = :inWh THEN 1 ELSE 0 END), 0)", "inWarehouse")
      .addSelect("COALESCE(SUM(CASE WHEN p.status = :pending THEN 1 ELSE 0 END), 0)", "pending")
      .addSelect("COALESCE(SUM(CASE WHEN p.status = :withdrawn THEN 1 ELSE 0 END), 0)", "withdrawn")
      .addSelect("COALESCE(SUM(CASE WHEN p.status = :released THEN 1 ELSE 0 END), 0)", "released")
      .addSelect("COALESCE(SUM(CASE WHEN p.is_orphan = true THEN 1 ELSE 0 END), 0)", "orphan")
      .setParameters({
        inWh: PacketStatusEnum.IN_WAREHOUSE,
        pending: PacketStatusEnum.PENDING,
        withdrawn: PacketStatusEnum.WITHDRAWN,
        released: PacketStatusEnum.RELEASED,
      })
      .getRawOne();

    const requestStats = await this.requestRepository
      .createQueryBuilder("r")
      .select("COUNT(r.id)", "total")
      .addSelect("COALESCE(SUM(CASE WHEN r.status = :pending THEN 1 ELSE 0 END), 0)", "pending")
      .addSelect("COALESCE(SUM(CASE WHEN r.status = :approved THEN 1 ELSE 0 END), 0)", "approved")
      .addSelect("COALESCE(SUM(CASE WHEN r.status = :completed THEN 1 ELSE 0 END), 0)", "completed")
      .addSelect("COALESCE(SUM(CASE WHEN r.status = :rejected THEN 1 ELSE 0 END), 0)", "rejected")
      .addSelect("COALESCE(SUM(CASE WHEN r.status = :cancelled THEN 1 ELSE 0 END), 0)", "cancelled")
      .setParameters({
        pending: RequestStatusEnum.PENDING,
        approved: RequestStatusEnum.APPROVED,
        completed: RequestStatusEnum.COMPLETED,
        rejected: RequestStatusEnum.REJECTED,
        cancelled: RequestStatusEnum.CANCELLED,
      })
      .getRawOne();

    const depositStats = await this.requestRepository
      .createQueryBuilder("r")
      .select("COUNT(r.id)", "total")
      .addSelect("COALESCE(SUM(CASE WHEN r.status = :pending THEN 1 ELSE 0 END), 0)", "pending")
      .where("r.type = :type", { type: RequestTypeEnum.INPUT })
      .setParameter("pending", RequestStatusEnum.PENDING)
      .getRawOne();

    const withdrawStats = await this.requestRepository
      .createQueryBuilder("r")
      .select("COUNT(r.id)", "total")
      .addSelect("COALESCE(SUM(CASE WHEN r.status = :pending THEN 1 ELSE 0 END), 0)", "pending")
      .where("r.type = :type", { type: RequestTypeEnum.OUTPUT })
      .setParameter("pending", RequestStatusEnum.PENDING)
      .getRawOne();

    return {
      warehouses: {
        total: Number(warehouseStats.total),
        active: Number(warehouseStats.active),
        full: Number(warehouseStats.full),
        totalCapacity: Number(warehouseStats.totalCapacity),
        usedCapacity: Number(warehouseStats.usedCapacity),
      },
      packets: {
        total: Number(packetStats.total),
        inWarehouse: Number(packetStats.inWarehouse),
        pending: Number(packetStats.pending),
        withdrawn: Number(packetStats.withdrawn),
        released: Number(packetStats.released),
        orphan: Number(packetStats.orphan),
      },
      requests: {
        total: Number(requestStats.total),
        pending: Number(requestStats.pending),
        approved: Number(requestStats.approved),
        completed: Number(requestStats.completed),
        rejected: Number(requestStats.rejected),
        cancelled: Number(requestStats.cancelled),
      },
      depositRequests: {
        total: Number(depositStats.total),
        pending: Number(depositStats.pending),
      },
      withdrawRequests: {
        total: Number(withdrawStats.total),
        pending: Number(withdrawStats.pending),
      },
    };
  }

  async getSettlementMaterialBalance(): Promise<{
    providers: Array<{
      providerKey: string;
      received: number;
      paid: number;
      netBalance: number;
    }>;
    totalReceived: number;
    totalPaid: number;
    netBalance: number;
  }> {
    const settlements = await this.settlementRepository
      .createQueryBuilder("s")
      .select("s.provider_key", "providerKey")
      .addSelect("COALESCE(SUM(CASE WHEN s.direction = :receive THEN s.amount ELSE 0 END), 0)", "received")
      .addSelect("COALESCE(SUM(CASE WHEN s.direction = :pay THEN s.amount ELSE 0 END), 0)", "paid")
      .where("s.symbol = :symbol", { symbol: "XAU" })
      .setParameters({ receive: SettlementDirection.RECEIVE, pay: SettlementDirection.PAY })
      .groupBy("s.provider_key")
      .getRawMany();

    const providers = settlements.map((s: any) => {
      const received = new Decimal(s.received || 0);
      const paid = new Decimal(s.paid || 0);
      return {
        providerKey: s.providerKey,
        received: received.toNumber(),
        paid: paid.toNumber(),
        netBalance: received.minus(paid).toNumber(),
      };
    });

    const totalReceived = providers.reduce((sum, p) => sum.plus(p.received), new Decimal(0));
    const totalPaid = providers.reduce((sum, p) => sum.plus(p.paid), new Decimal(0));

    return {
      providers,
      totalReceived: totalReceived.toNumber(),
      totalPaid: totalPaid.toNumber(),
      netBalance: totalReceived.minus(totalPaid).toNumber(),
    };
  }

  async updateCapacity(
    warehouseId: string,
    weightChange: number,
    queryRunner?: any
  ): Promise<WarehouseEntity> {
    const repo = queryRunner ? queryRunner.manager.getRepository(WarehouseEntity) : this.warehouseRepository;

    const warehouse = await repo.findOne({
      where: { id: warehouseId },
      lock: queryRunner ? { mode: "pessimistic_write" } : undefined,
    });

    if (!warehouse) {
      throw new NotFoundException("Warehouse not found");
    }

    const weightDec = new Decimal(weightChange);
    const capacityUsedDec = new Decimal(warehouse.capacityUsed);
    const capacityTotalDec = new Decimal(warehouse.capacityTotal);

    const newUsed = capacityUsedDec.plus(weightDec);
    const newRemaining = capacityTotalDec.minus(newUsed);

    if (newUsed.lessThan(0)) {
      throw new BadRequestException(
        `Cannot reduce capacity below zero. Current used: ${warehouse.capacityUsed}, change: ${weightChange}`
      );
    }

    if (newRemaining.lessThan(0)) {
      throw new BadRequestException("Insufficient warehouse capacity");
    }

    warehouse.capacityUsed = newUsed.toNumber();
    warehouse.capacityRemaining = newRemaining.toNumber();

    if (newRemaining.equals(0)) {
      warehouse.status = WarehouseStatusEnum.FULL;
    } else if (warehouse.status === WarehouseStatusEnum.FULL && newRemaining.greaterThan(0)) {
      warehouse.status = WarehouseStatusEnum.ACTIVE;
    }

    return repo.save(warehouse);
  }

  async getTodayStats(): Promise<{
    todayPacketsToDeliver: number;
    todayPacketsToDeliverWeight: number;
    todayWithdrawRequests: number;
    todayWithdrawWeight: number;
  }> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const deliverResult = await this.packetRepository
      .createQueryBuilder("p")
      .select("COUNT(p.id)", "count")
      .addSelect("COALESCE(SUM(p.pure_weight), 0)", "totalWeight")
      .where("p.status = :status", { status: PacketStatusEnum.IN_WAREHOUSE })
      .andWhere("p.delivery_time >= :start AND p.delivery_time <= :end", { start: startOfDay, end: endOfDay })
      .getRawOne();

    const withdrawResult = await this.requestRepository
      .createQueryBuilder("r")
      .select("COUNT(r.id)", "count")
      .addSelect("COALESCE(SUM(r.weight), 0)", "totalWeight")
      .where("r.type = :type", { type: RequestTypeEnum.OUTPUT })
      .andWhere("(r.status = :pending OR r.status = :approved)", { pending: RequestStatusEnum.PENDING, approved: RequestStatusEnum.APPROVED })
      .andWhere("r.created_at >= :start AND r.created_at <= :end", { start: startOfDay, end: endOfDay })
      .getRawOne();

    return {
      todayPacketsToDeliver: Number(deliverResult?.count ?? 0),
      todayPacketsToDeliverWeight: Number(deliverResult?.totalWeight ?? 0),
      todayWithdrawRequests: Number(withdrawResult?.count ?? 0),
      todayWithdrawWeight: Number(withdrawResult?.totalWeight ?? 0),
    };
  }

  async getTodayDeliveries(): Promise<PacketEntity[]> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    return this.packetRepository.find({
      where: {
        status: PacketStatusEnum.IN_WAREHOUSE,
        deliveryTime: Between(startOfDay, endOfDay),
      },
      relations: { warehouse: true, user: true },
      order: { deliveryTime: "ASC" },
    });
  }

  async getTodayWithdraws(): Promise<WarehouseRequestEntity[]> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    return this.requestRepository.find({
      where: {
        type: RequestTypeEnum.OUTPUT,
        createAt: Between(startOfDay, endOfDay),
      },
      relations: { user: true, warehouse: true, packet: true },
      order: { createAt: "ASC" },
    });
  }

  async getTodayExportData(): Promise<{ deliveries: any[]; withdraws: any[] }> {
    const [deliveries, withdraws] = await Promise.all([
      this.getTodayDeliveries(),
      this.getTodayWithdraws(),
    ]);

    return {
      deliveries: deliveries.map((p) => ({
        "شناسه بسته": p.idSecure,
        "وزن (گرم)": p.pureWeight,
        "انبار": p.warehouse?.name || "—",
        "کاربر": p.user ? `${p.user.firstName ?? ""} ${p.user.lastName ?? ""}`.trim() || p.userId : p.userId,
        "زمان تحویل": p.deliveryTime?.toISOString() || "—",
        "ANG": p.ang ?? "—",
        "عیار": p.ayar ?? "—",
      })),
      withdraws: withdraws.map((r) => ({
        "شناسه درخواست": r.id?.slice(0, 8),
        "کاربر": r.user ? `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim() || r.userId : r.userId,
        "وزن (گرم)": r.weight,
        "وضعیت": r.status,
        "انبار": r.warehouse?.name || "—",
        "زمان ایجاد": r.createAt?.toISOString() || "—",
        "زمان تحویل": r.deliveryDate?.toISOString() || r.deliveryTime || "—",
      })),
    };
  }

  private async addHistory(data: {
    warehouseId?: string;
    packetId?: string;
    requestId?: string;
    action: string;
    description?: string;
    performedBy?: string;
    performedRole?: string;
    metadata?: any;
  }): Promise<void> {
    const history = this.historyRepository.create(data);
    await this.historyRepository.save(history);
  }
}
