import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, SelectQueryBuilder } from "typeorm";
import { AdminEntity } from "../admin/entity/admin.entity";
import { permissionsOf } from "../admin-role/guard/admin-permissions.guard";
import { paginate } from "../shared/dto/paginated.dto";
import { PaginatedDto } from "../shared/dto/paginated.dto";
import { AdminNotificationEntity } from "./entity/admin-notification.entity";
import { AdminNotificationReadEntity } from "./entity/admin-notification-read.entity";
import { InboxCategory, InboxSeverity } from "./admin-inbox.enums";
import {
  InboxItemDto,
  InboxQueryDto,
  InboxStatsDto,
  MarkedReadDto,
  UnreadCountDto,
} from "./dto/admin-inbox.dto";

export interface PublishInboxItem {
  event: string;
  title: string;
  body: string;
  category?: InboxCategory;
  severity?: InboxSeverity;
  metadata?: Record<string, unknown> | null;
  /** Only admins holding this key will see the item. */
  requiredPermission?: string | null;
}

/** Implemented by the websocket gateway; kept structural so the module does not depend on it. */
export interface InboxBroadcaster {
  sendToAdmins(payload: { event: string; title: string; body: string; type?: string; metadata?: unknown }): void;
  connectedAdminCount?(): number;
}

@Injectable()
export class AdminInboxService {
  constructor(
    @InjectRepository(AdminNotificationEntity)
    private readonly notifications: Repository<AdminNotificationEntity>,
    @InjectRepository(AdminNotificationReadEntity)
    private readonly reads: Repository<AdminNotificationReadEntity>,
  ) {}

  // ── Reading ─────────────────────────────────────────────────────────────

  async inbox(admin: AdminEntity, query: InboxQueryDto): Promise<PaginatedDto<InboxItemDto>> {
    const qb = this.visible(admin)
      .leftJoin(
        AdminNotificationReadEntity,
        "r",
        'r."notification_id" = n."id" AND r."admin_id" = :adminId',
        { adminId: admin.id },
      )
      .addSelect('r."read_at"', "read_at");

    if (query.unreadOnly) qb.andWhere('r."id" IS NULL');
    if (query.category) qb.andWhere("n.category = :category", { category: query.category });
    if (query.severity) qb.andWhere("n.severity = :severity", { severity: query.severity });

    // Newest first; an inbox read oldest-first is not an inbox.
    qb.orderBy("n.created_at", "DESC").addOrderBy("n.id", "DESC");

    const total = await qb.getCount();
    // `getRawAndEntities` because the read timestamp comes from the joined
    // table, which `getMany` would drop.
    const { entities, raw } = await qb.skip(query.skip).take(query.take).getRawAndEntities();

    const items = entities.map((n, i) => this.toDto(n, raw[i]?.read_at ?? null));
    return paginate(items, total, query);
  }

  async unreadCount(admin: AdminEntity): Promise<UnreadCountDto> {
    return { unread: await this.unreadQuery(admin).getCount() };
  }

  async stats(admin: AdminEntity, broadcaster?: InboxBroadcaster): Promise<InboxStatsDto> {
    const midnight = new Date();
    midnight.setHours(0, 0, 0, 0);

    const [unread, urgent, today] = await Promise.all([
      this.unreadQuery(admin).getCount(),
      this.unreadQuery(admin).andWhere("n.severity = :s", { s: InboxSeverity.URGENT }).getCount(),
      this.visible(admin).andWhere("n.created_at >= :from", { from: midnight }).getCount(),
    ]);

    const connectedAdmins = broadcaster?.connectedAdminCount?.() ?? 0;
    return {
      unread,
      urgent,
      today,
      // Reported rather than hardcoded true: if the gateway is not up, the
      // panel is polling, and saying so is better than implying live updates.
      realtimeEnabled: !!broadcaster,
      connectedAdmins,
    };
  }

  // ── Writing ─────────────────────────────────────────────────────────────

  async markRead(admin: AdminEntity, id: string): Promise<MarkedReadDto> {
    const item = await this.notifications.findOne({ where: { id } });
    if (!item) throw new NotFoundException("INBOX.NOT_FOUND");
    // An item the caller cannot see is not theirs to mark; answering 404
    // rather than 403 keeps its existence private.
    if (!this.canSee(admin, item)) throw new NotFoundException("INBOX.NOT_FOUND");

    return { marked: await this.insertReads(admin.id, [id]) };
  }

  async markAllRead(admin: AdminEntity): Promise<MarkedReadDto> {
    // Only what the caller can actually see — "read all" must not silently
    // clear items that were never in their inbox.
    const rows = await this.unreadQuery(admin).select("n.id", "id").getRawMany<{ id: string }>();
    if (rows.length === 0) return { marked: 0 };
    return { marked: await this.insertReads(admin.id, rows.map((r) => r.id)) };
  }

  async publish(item: PublishInboxItem, broadcaster?: InboxBroadcaster): Promise<AdminNotificationEntity> {
    const saved = await this.notifications.save(
      this.notifications.create({
        event: item.event,
        title: item.title,
        body: item.body,
        category: item.category ?? InboxCategory.SYSTEM,
        severity: item.severity ?? InboxSeverity.INFO,
        metadata: item.metadata ?? null,
        requiredPermission: item.requiredPermission ?? null,
      }),
    );

    // Persist first, then push. If the push fails the item is still in the
    // inbox, which is the whole reason for storing it.
    try {
      broadcaster?.sendToAdmins({
        event: saved.event,
        title: saved.title,
        body: saved.body,
        type: saved.severity,
        metadata: { ...(saved.metadata ?? {}), notificationId: saved.id, category: saved.category },
      });
    } catch {
      /* a dropped websocket must not fail the operation that raised the event */
    }
    return saved;
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /** Items this admin is allowed to see, by permission. */
  private visible(admin: AdminEntity): SelectQueryBuilder<AdminNotificationEntity> {
    const qb = this.notifications.createQueryBuilder("n");
    const held = permissionsOf(admin);

    if (held.length === 0) {
      // `IN (:...held)` with an empty array is invalid SQL, and TypeORM will
      // happily build it. An admin with no permissions sees only unrestricted
      // items — not an error, and not everything.
      return qb.where('n."required_permission" IS NULL');
    }
    return qb.where('(n."required_permission" IS NULL OR n."required_permission" IN (:...held))', { held });
  }

  private unreadQuery(admin: AdminEntity): SelectQueryBuilder<AdminNotificationEntity> {
    return this.visible(admin)
      .leftJoin(
        AdminNotificationReadEntity,
        "r",
        'r."notification_id" = n."id" AND r."admin_id" = :adminId',
        { adminId: admin.id },
      )
      .andWhere('r."id" IS NULL');
  }

  private canSee(admin: AdminEntity, item: AdminNotificationEntity): boolean {
    if (!item.requiredPermission) return true;
    return permissionsOf(admin).includes(item.requiredPermission);
  }

  /** Idempotent: marking an already-read item again is a no-op, not a duplicate. */
  private async insertReads(adminId: string, notificationIds: string[]): Promise<number> {
    const result = await this.reads
      .createQueryBuilder()
      .insert()
      .into(AdminNotificationReadEntity)
      .values(notificationIds.map((notificationId) => ({ notificationId, adminId })))
      .orIgnore()
      .execute();
    return result.identifiers.filter(Boolean).length;
  }

  private toDto(n: AdminNotificationEntity, readAt: Date | string | null): InboxItemDto {
    return {
      id: n.id,
      event: n.event,
      category: n.category,
      severity: n.severity,
      title: n.title,
      body: n.body,
      metadata: n.metadata ?? null,
      isRead: readAt !== null,
      readAt: readAt ? new Date(readAt) : null,
      createAt: n.createAt as Date,
    };
  }
}
