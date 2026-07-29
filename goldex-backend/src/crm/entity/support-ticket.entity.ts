import { Entity, Column, ManyToOne, JoinColumn, OneToMany } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { AdminEntity } from "../../admin/entity/admin.entity";
import { TicketMessageEntity } from "./ticket-message.entity";
import { TicketPriorityEnum } from "../enum/ticket-priority.enum";
import { TicketStatusEnum } from "../enum/ticket-status.enum";
import { TicketCategoryEnum } from "../enum/ticket-category.enum";
import { TicketSourceEnum } from "../enum/ticket-source.enum";

@Entity("support_tickets")
export class SupportTicketEntity extends myBaseEntity {
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "user_id" })
  userId: string;

  @Column({ type: "varchar", length: 255 })
  subject: string;

  @Column({ type: "text" })
  description: string;

  @Column({ type: "enum", enum: TicketPriorityEnum, default: TicketPriorityEnum.MEDIUM })
  priority: TicketPriorityEnum;

  @Column({ type: "enum", enum: TicketStatusEnum, default: TicketStatusEnum.OPEN })
  status: TicketStatusEnum;

  @Column({ type: "enum", enum: TicketCategoryEnum, default: TicketCategoryEnum.OTHER })
  category: TicketCategoryEnum;

  @ManyToOne(() => AdminEntity, { nullable: true })
  @JoinColumn({ name: "assigned_to" })
  assignedTo: AdminEntity;

  @Column({ name: "assigned_to", nullable: true })
  assignedToId: string;

  @Column({ type: "enum", enum: TicketSourceEnum, default: TicketSourceEnum.USER_PANEL })
  source: TicketSourceEnum;

  @Column({ type: "timestamptz", nullable: true, name: "resolved_at" })
  resolvedAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "closed_at" })
  closedAt: Date;

  @Column({ type: "timestamptz", nullable: true, name: "first_response_at" })
  firstResponseAt: Date;

  @Column({ type: "int", nullable: true, name: "satisfaction_score" })
  satisfactionScore: number;

  @OneToMany(() => TicketMessageEntity, (msg) => msg.ticket)
  messages: TicketMessageEntity[];
}
