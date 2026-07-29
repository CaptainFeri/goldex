import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { AdminEntity } from "../../admin/entity/admin.entity";
import { CommunicationChannelEnum } from "../enum/communication-channel.enum";
import { CommunicationDirectionEnum } from "../enum/communication-direction.enum";

export enum CommunicationStatusEnum {
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
  BOUNCED = "BOUNCED",
}

@Entity("communication_logs")
export class CommunicationLogEntity extends myBaseEntity {
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "user_id" })
  userId: string;

  @Column({ type: "enum", enum: CommunicationChannelEnum })
  channel: CommunicationChannelEnum;

  @Column({ type: "enum", enum: CommunicationDirectionEnum })
  direction: CommunicationDirectionEnum;

  @Column({ type: "varchar", length: 255, nullable: true })
  subject: string;

  @Column({ type: "text", nullable: true })
  body: string;

  @Column({ type: "varchar", length: 100, nullable: true, name: "template_slug" })
  templateSlug: string;

  @Column({ type: "enum", enum: CommunicationStatusEnum, default: CommunicationStatusEnum.SENT })
  status: CommunicationStatusEnum;

  @Column({ type: "varchar", length: 255, nullable: true, name: "external_id" })
  externalId: string;

  @ManyToOne(() => AdminEntity, { nullable: true })
  @JoinColumn({ name: "admin_id" })
  admin: AdminEntity;

  @Column({ name: "admin_id", nullable: true })
  adminId: string;

  @Column({ type: "timestamptz", default: () => "CURRENT_TIMESTAMP", name: "sent_at" })
  sentAt: Date;
}
