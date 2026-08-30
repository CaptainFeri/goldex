import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { SupportTicketEntity } from "./support-ticket.entity";

@Entity("ticket_messages")
export class TicketMessageEntity extends myBaseEntity {
  @ManyToOne(() => SupportTicketEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "ticket_id" })
  ticket: SupportTicketEntity;

  @Column({ name: "ticket_id" })
  ticketId: string;

  @Column({ name: "sender_id" })
  senderId: string;

  @Column({ type: "enum", enum: ["USER", "ADMIN"], name: "sender_type" })
  senderType: "USER" | "ADMIN";

  @Column({ type: "text" })
  message: string;

  @Column({ type: "jsonb", nullable: true })
  attachments: { fileName: string; fileUrl: string; mimeType: string }[];

  @Column({ type: "boolean", default: false, name: "is_internal" })
  isInternal: boolean;
}
