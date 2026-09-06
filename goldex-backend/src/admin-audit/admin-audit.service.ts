import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AdminAuditLogEntity } from "./entity/admin-audit-log.entity";
import { AuditQueryDto } from "./dto/admin-audit.dto";
import { paginate } from "../shared/dto/paginated.dto";
import { PaginatedDto } from "../shared/dto/paginated.dto";

export interface AuditRecord {
  adminId: string | null;
  adminLabel: string | null;
  permission: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  before?: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  otpChallengeId: string | null;
  statusCode: number | null;
  errorMessage?: string | null;
  ip: string | null;
  userAgent: string | null;
  durationMs: number | null;
}

@Injectable()
export class AdminAuditService {
  private readonly logger = new Logger(AdminAuditService.name);

  constructor(
    @InjectRepository(AdminAuditLogEntity)
    private readonly logs: Repository<AdminAuditLogEntity>,
  ) {}

  /**
   * Never throws.
   *
   * A failure to record must not fail the operation being recorded — an
   * operator retrying a refused transfer because the audit insert timed out is
   * worse than a gap in the log, and the gap is visible in the log itself.
   */
  async record(record: AuditRecord): Promise<void> {
    try {
      await this.logs.insert(this.logs.create(record));
    } catch (e) {
      this.logger.error(`failed to write audit entry for ${record.action}: ${(e as Error).message}`);
    }
  }

  /**
   * Attach a "before" snapshot to a mutation in flight.
   *
   * The interceptor cannot know what a row looked like beforehand without
   * fetching it, and a guessed "before" in the record that settles a dispute is
   * worse than an absent one. Handlers that care call this.
   */
  captureBefore(request: { auditBefore?: Record<string, unknown> }, before: Record<string, unknown>): void {
    request.auditBefore = before;
  }

  async list(query: AuditQueryDto): Promise<PaginatedDto<AdminAuditLogEntity>> {
    const qb = this.logs.createQueryBuilder("l");

    if (query.adminId) qb.andWhere("l.admin_id = :adminId", { adminId: query.adminId });
    if (query.entity) qb.andWhere("l.entity = :entity", { entity: query.entity });
    if (query.entityId) qb.andWhere("l.entity_id = :entityId", { entityId: query.entityId });
    if (query.action) qb.andWhere("l.action ILIKE :action", { action: `%${query.action}%` });
    if (query.from) qb.andWhere("l.created_at >= :from", { from: query.from });
    if (query.to) qb.andWhere("l.created_at <= :to", { to: query.to });
    if (query.failedOnly) qb.andWhere("(l.status_code >= 400 OR l.error_message IS NOT NULL)");

    qb.orderBy("l.created_at", "DESC").addOrderBy("l.id", "DESC");

    const [items, total] = await qb.skip(query.skip).take(query.take).getManyAndCount();
    return paginate(items, total, query);
  }

  /** Everything recorded against one record, for the "who touched this" view. */
  async forEntity(entity: string, entityId: string): Promise<AdminAuditLogEntity[]> {
    return this.logs.find({ where: { entity, entityId }, order: { createAt: "DESC" } });
  }
}
