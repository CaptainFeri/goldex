import { Column, Entity, Index } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { InboxCategory, InboxSeverity } from "../admin-inbox.enums";

/**
 * One item in the operators' shared inbox.
 *
 * Broadcast rather than addressed: these are things the operations team needs
 * to see, not mail for one person, so there is no `admin_id` here. Who has
 * read what lives in `admin_notification_reads`.
 *
 * Until now these events were only pushed over the websocket. An operator who
 * was not connected missed them entirely and there was no history to catch up
 * on — persisting them is the point of this table.
 */
@Entity("admin_notifications")
export class AdminNotificationEntity extends myBaseEntity {
  /** The domain event that produced this, e.g. `withdraw.created`. */
  @Column({ type: "varchar", length: 80 })
  event: string;

  @Index()
  @Column({ type: "enum", enum: InboxCategory, default: InboxCategory.SYSTEM })
  category: InboxCategory;

  @Index()
  @Column({ type: "enum", enum: InboxSeverity, default: InboxSeverity.INFO })
  severity: InboxSeverity;

  @Column({ type: "varchar", length: 255 })
  title: string;

  @Column({ type: "text" })
  body: string;

  /**
   * Structured payload — ids to link to, and amounts in rial for the client to
   * format. Amounts belong here rather than baked into `body`, which cannot be
   * localised or converted to toman once it is prose.
   */
  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, unknown> | null;

  /**
   * When set, only admins holding this permission key see the item.
   *
   * A warehouse operator does not need withdrawal approvals in their inbox,
   * and an inbox full of things you cannot act on stops being read at all.
   */
  @Column({ name: "required_permission", type: "varchar", length: 60, nullable: true })
  requiredPermission: string | null;
}
