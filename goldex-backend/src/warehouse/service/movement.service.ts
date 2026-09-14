import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Between, Repository } from "typeorm";
import Decimal from "decimal.js";
import { WarehouseMovementEntity } from "../entity/warehouse-movement.entity";
import {
  MovementDirectionEnum,
  MovementPartyEnum,
  MovementSourceEnum,
} from "../enum/movement.enum";

/** What a caller knows about a crossing it is recording. */
export interface RecordMovementInput {
  warehouseId: string;
  direction: MovementDirectionEnum;
  source: MovementSourceEnum;
  /** Net weight (750). Positive magnitude — direction carries the sign. */
  netWeight: Decimal | number | string;
  symbolId?: string | null;
  partyType: MovementPartyEnum;
  partyUserId?: string | null;
  providerKey?: string | null;
  packetIds?: string[];
  requestId?: string | null;
  settlementId?: string | null;
  voucherId?: string | null;
  adminId?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}

export interface MovementQuery {
  warehouseId?: string;
  direction?: MovementDirectionEnum;
  source?: MovementSourceEnum;
  partyType?: MovementPartyEnum;
  userId?: string;
  providerKey?: string;
  startDate?: string;
  endDate?: string;
  limit?: string;
  offset?: string;
}

@Injectable()
export class MovementService {
  private readonly logger = new Logger(MovementService.name);

  constructor(
    @InjectRepository(WarehouseMovementEntity)
    private readonly movementRepository: Repository<WarehouseMovementEntity>
  ) {}

  /**
   * Writes one row for metal crossing the door.
   *
   * Runs on the caller's query runner so the ledger entry commits with the
   * movement it describes — a deposit that rolls back must not leave a row
   * claiming gold arrived.
   *
   * A zero-weight crossing is not a crossing, and recording one would put a
   * row in the ledger that no reconciliation can explain.
   */
  async record(queryRunner: any, input: RecordMovementInput): Promise<WarehouseMovementEntity | null> {
    const weight = new Decimal(input.netWeight ?? 0);

    if (weight.lessThanOrEqualTo(0)) {
      this.logger.warn(
        `Skipping ${input.direction} movement for warehouse ${input.warehouseId}: weight is ${weight.toString()}`
      );
      return null;
    }

    const repo = queryRunner
      ? queryRunner.manager.getRepository(WarehouseMovementEntity)
      : this.movementRepository;

    return repo.save(
      repo.create({
        warehouseId: input.warehouseId,
        direction: input.direction,
        source: input.source,
        netWeight: weight.toNumber(),
        symbolId: input.symbolId ?? null,
        partyType: input.partyType,
        partyUserId: input.partyUserId ?? null,
        providerKey: input.providerKey ?? null,
        packetIds: input.packetIds?.length ? input.packetIds : null,
        requestId: input.requestId ?? null,
        settlementId: input.settlementId ?? null,
        voucherId: input.voucherId ?? null,
        adminId: input.adminId ?? null,
        notes: input.notes ?? null,
        metadata: input.metadata ?? null,
      })
    );
  }

  async findAll(query: MovementQuery): Promise<{ movements: WarehouseMovementEntity[]; total: number }> {
    const { limit = "25", offset = "0" } = query;

    const qb = this.movementRepository
      .createQueryBuilder("m")
      .leftJoinAndSelect("m.warehouse", "warehouse")
      .leftJoinAndSelect("m.partyUser", "partyUser");

    if (query.warehouseId) qb.andWhere("m.warehouse_id = :warehouseId", { warehouseId: query.warehouseId });
    if (query.direction) qb.andWhere("m.direction = :direction", { direction: query.direction });
    if (query.source) qb.andWhere("m.source = :source", { source: query.source });
    if (query.partyType) qb.andWhere("m.party_type = :partyType", { partyType: query.partyType });
    if (query.userId) qb.andWhere("m.party_user_id = :userId", { userId: query.userId });
    if (query.providerKey) qb.andWhere("m.provider_key = :providerKey", { providerKey: query.providerKey });

    if (query.startDate) qb.andWhere("m.created_at >= :startDate", { startDate: new Date(query.startDate) });
    if (query.endDate) qb.andWhere("m.created_at <= :endDate", { endDate: new Date(query.endDate) });

    qb.orderBy("m.created_at", "DESC").skip(Number(offset)).take(Number(limit));

    const [movements, total] = await qb.getManyAndCount();
    return { movements, total };
  }

  /**
   * In and out totals for a day, per warehouse or across all of them.
   *
   * Summed from the ledger rather than from packet status, because a package
   * that came in and went out again is two crossings and one row.
   */
  async dailyTotals(params: { warehouseId?: string; day?: Date }): Promise<{
    inboundWeight: number;
    outboundWeight: number;
    inboundCount: number;
    outboundCount: number;
    netWeight: number;
  }> {
    const day = params.day ?? new Date();
    const start = new Date(day);
    start.setHours(0, 0, 0, 0);
    const end = new Date(day);
    end.setHours(23, 59, 59, 999);

    const qb = this.movementRepository
      .createQueryBuilder("m")
      .select("m.direction", "direction")
      .addSelect("COALESCE(SUM(m.net_weight), 0)", "weight")
      .addSelect("COUNT(m.id)", "count")
      .where({ createAt: Between(start, end) } as any)
      .groupBy("m.direction");

    if (params.warehouseId) qb.andWhere("m.warehouse_id = :warehouseId", { warehouseId: params.warehouseId });

    const rows = await qb.getRawMany();
    const pick = (direction: MovementDirectionEnum) => rows.find((r: any) => r.direction === direction);

    const inbound = pick(MovementDirectionEnum.IN);
    const outbound = pick(MovementDirectionEnum.OUT);

    const inboundWeight = new Decimal(inbound?.weight ?? 0);
    const outboundWeight = new Decimal(outbound?.weight ?? 0);

    return {
      inboundWeight: inboundWeight.toNumber(),
      outboundWeight: outboundWeight.toNumber(),
      inboundCount: Number(inbound?.count ?? 0),
      outboundCount: Number(outbound?.count ?? 0),
      netWeight: inboundWeight.minus(outboundWeight).toNumber(),
    };
  }

  /**
   * Rejects a counterparty that does not match the party type.
   *
   * A movement whose party type says USER but carries a provider key — or
   * neither — is unattributable, and an unattributable crossing is the one
   * thing this ledger exists to make impossible.
   */
  assertPartyResolved(input: {
    partyType: MovementPartyEnum;
    partyUserId?: string | null;
    providerKey?: string | null;
  }): void {
    if (input.partyType === MovementPartyEnum.USER && !input.partyUserId) {
      throw new BadRequestException("SELECT_USER: a user movement must name the user");
    }
    if (input.partyType === MovementPartyEnum.PROVIDER && !input.providerKey) {
      throw new BadRequestException("SELECT_PROVIDER: a provider movement must name the provider");
    }
  }
}
