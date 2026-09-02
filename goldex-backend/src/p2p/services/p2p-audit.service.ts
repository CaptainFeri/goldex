import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { P2pAuditLogEntity } from "../entity/p2p-audit-log.entity";
import { P2pAuditActorEnum } from "../enum/p2p.enums";

export interface AuditContext {
  actorType: P2pAuditActorEnum;
  actorId?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class P2pAuditService {
  private readonly logger = new Logger(P2pAuditService.name);

  constructor(
    @InjectRepository(P2pAuditLogEntity)
    private readonly repo: Repository<P2pAuditLogEntity>,
  ) {}

  /**
   * Never throws: losing an audit row must not roll back the financial change
   * it describes, but it must be visible in the logs when it happens.
   */
  async record(
    ctx: AuditContext,
    action: string,
    entityType: string,
    entityId: string,
    before?: Record<string, any>,
    after?: Record<string, any>,
    manager?: EntityManager,
  ): Promise<void> {
    try {
      const repo = manager ? manager.getRepository(P2pAuditLogEntity) : this.repo;
      await repo.save(
        repo.create({
          actorType: ctx.actorType,
          actorId: ctx.actorId,
          action,
          entityType,
          entityId,
          beforeJson: before,
          afterJson: after,
          ip: ctx.ip,
          userAgent: ctx.userAgent,
        }),
      );
    } catch (err) {
      this.logger.error(
        `Failed to write p2p audit log (${action} on ${entityType}:${entityId}): ${(err as Error).message}`,
      );
    }
  }

  static system(): AuditContext {
    return { actorType: P2pAuditActorEnum.SYSTEM };
  }
}
