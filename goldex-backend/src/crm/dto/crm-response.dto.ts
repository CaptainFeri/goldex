import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { TicketCategoryEnum } from "../enum/ticket-category.enum";
import { TicketPriorityEnum } from "../enum/ticket-priority.enum";
import { TicketSourceEnum } from "../enum/ticket-source.enum";
import { TicketStatusEnum } from "../enum/ticket-status.enum";
import { CommunicationChannelEnum } from "../enum/communication-channel.enum";
import { CommunicationDirectionEnum } from "../enum/communication-direction.enum";
import { UserRefDto } from "../../shared/dto/user-ref.dto";

/** A note an operator left on a customer. */
export class CustomerNoteDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "The admin who wrote it" })
  adminId?: string | null;

  @ApiProperty({ example: "Called about a delayed withdrawal; promised a callback." })
  content: string;

  @ApiPropertyOptional({ nullable: true, description: "Free-form grouping" })
  category?: string | null;

  @ApiProperty({ example: false, description: "Pinned notes sort to the top of the customer view" })
  isPinned: boolean;

  @ApiProperty()
  createAt: Date;

  @ApiProperty()
  updateAt: Date;
}

export class CustomerTagDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "VIP" })
  name: string;

  @ApiPropertyOptional({ example: "#d4af37", description: "Hex colour for the chip" })
  color?: string;

  @ApiPropertyOptional()
  createAt?: Date;
}

/**
 * A customer segment.
 *
 * A dynamic segment recomputes its membership from `criteria` when synced; a
 * static one holds whatever was assigned by hand. `lastSyncedAt` only means
 * anything for the dynamic kind.
 */
export class CustomerSegmentDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "طلایی‌ها" })
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: "Rules the membership is computed from, for a dynamic segment",
  })
  criteria?: Record<string, unknown> | null;

  @ApiProperty({ example: true, description: "Dynamic segments recompute on sync; static ones are assigned by hand" })
  isDynamic: boolean;

  @ApiPropertyOptional({ nullable: true, description: "Meaningful only for dynamic segments" })
  lastSyncedAt?: Date | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  createdById?: string | null;

  @ApiPropertyOptional()
  createAt?: Date;

  @ApiPropertyOptional()
  updateAt?: Date;
}

/** Several segments combined with a set operator. */
export class CustomerSegmentCombinationDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "VIP و فعال" })
  name: string;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiProperty({ type: [String], description: "Ids of the segments being combined" })
  segmentIds: string[];

  @ApiProperty({ example: "AND", description: "How the segments combine: AND, OR or NOT" })
  operator: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  createdById?: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastSyncedAt?: Date | null;

  @ApiPropertyOptional()
  createAt?: Date;
}

export class SupportTicketDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiPropertyOptional({ type: UserRefDto })
  user?: UserRefDto;

  @ApiProperty({ example: "برداشت انجام نشد" })
  subject: string;

  @ApiProperty()
  description: string;

  @ApiProperty({ enum: TicketPriorityEnum, example: TicketPriorityEnum.MEDIUM })
  priority: TicketPriorityEnum;

  @ApiProperty({ enum: TicketStatusEnum, example: TicketStatusEnum.OPEN })
  status: TicketStatusEnum;

  @ApiProperty({ enum: TicketCategoryEnum, example: TicketCategoryEnum.WITHDRAWAL })
  category: TicketCategoryEnum;

  @ApiPropertyOptional({ format: "uuid", nullable: true, description: "The admin it is assigned to" })
  assignedToId?: string | null;

  @ApiProperty({ enum: TicketSourceEnum, description: "Where the ticket came from" })
  source: TicketSourceEnum;

  @ApiPropertyOptional({ nullable: true, description: "When an operator first replied — the SLA clock" })
  firstResponseAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  resolvedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  closedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true, example: 5, description: "1–5, set by the customer after closing" })
  satisfactionScore?: number | null;

  @ApiProperty()
  createAt: Date;

  @ApiProperty()
  updateAt: Date;
}

/**
 * One message on a ticket.
 *
 * `isInternal` marks an operator-only note: it must not be shown to the
 * customer, and the user panel never receives it.
 */
export class TicketMessageDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  ticketId: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  senderId?: string | null;

  @ApiProperty({ example: "ADMIN", description: "Whether the sender was the customer or an operator" })
  senderType: string;

  @ApiProperty()
  message: string;

  @ApiProperty({ example: false, description: "Operator-only; never shown to the customer" })
  isInternal: boolean;

  @ApiProperty()
  createAt: Date;
}

/** A ticket with its thread. */
export class SupportTicketDetailDto extends SupportTicketDto {
  @ApiProperty({ type: [TicketMessageDto], description: "Oldest first; includes internal notes" })
  messages: TicketMessageDto[];
}

/** One outbound or inbound contact with a customer. */
export class CommunicationLogDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiProperty({ enum: CommunicationChannelEnum, example: CommunicationChannelEnum.SMS })
  channel: CommunicationChannelEnum;

  @ApiProperty({ enum: CommunicationDirectionEnum, example: CommunicationDirectionEnum.OUTBOUND })
  direction: CommunicationDirectionEnum;

  @ApiPropertyOptional({ nullable: true })
  subject?: string | null;

  @ApiPropertyOptional({ nullable: true })
  body?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Notification template used, when it was templated" })
  templateSlug?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Delivery state reported by the channel" })
  status?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "The provider's own id, for reconciliation" })
  externalId?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  adminId?: string | null;

  @ApiProperty()
  createAt: Date;
}

/** Membership count after a segment sync. */
export class SegmentSyncResultDto {
  @ApiProperty({ example: 1240, description: "Members after the sync" })
  memberCount: number;
}

export class SegmentMembersDto {
  @ApiProperty({ type: [Object], description: "Member rows; the shape follows the segment's own projection" })
  data: Record<string, unknown>[];

  @ApiProperty({ example: 1240 })
  total: number;
}

export class TicketStatsDto {
  @ApiProperty({ example: 420 })
  total: number;

  @ApiProperty({ example: 18 })
  open: number;

  @ApiProperty({ example: 7 })
  inProgress: number;

  @ApiProperty({ example: 310 })
  resolved: number;

  @ApiProperty({ example: 85 })
  closed: number;

  @ApiProperty({ example: 4.3, description: "Mean satisfaction score; 0 when nobody has rated" })
  avgSatisfaction: number;

  @ApiProperty({
    example: { WITHDRAWAL: 120, KYC: 64 },
    additionalProperties: { type: "number" },
    description: "Ticket counts by category",
  })
  byCategory: Record<string, number>;
}

/** A paginated list, as the CRM endpoints return one. */
export class CrmTicketPageDto {
  @ApiProperty({ type: [SupportTicketDto] })
  data: SupportTicketDto[];

  @ApiProperty({ example: 420 })
  total: number;
}

export class CrmCommunicationPageDto {
  @ApiProperty({ type: [CommunicationLogDto] })
  data: CommunicationLogDto[];

  @ApiProperty({ example: 96 })
  total: number;
}

export class Customer360UserDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional()
  firstName?: string;

  @ApiPropertyOptional()
  lastName?: string;

  @ApiPropertyOptional()
  email?: string;

  @ApiPropertyOptional()
  phone?: string;

  @ApiProperty({ example: 0, description: "Numeric: 0 CUSTOMER, 1 ADMIN, 2 NEW_USER, 3 PARTNER" })
  role: number;

  @ApiPropertyOptional({ nullable: true })
  registeredAt?: Date | null;

  @ApiPropertyOptional({ nullable: true, description: "Non-null means blocked" })
  blockedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  activeUntil?: Date | null;

  @ApiProperty()
  createdAt: Date;
}

export class Customer360KycDto {
  @ApiProperty({ example: 2 })
  level: number;

  @ApiProperty({ example: 1 })
  status: number;

  @ApiPropertyOptional({ nullable: true })
  nationalId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  verifiedAt?: Date | null;
}

export class Customer360LevelDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional()
  name?: string;

  @ApiPropertyOptional()
  slug?: string;
}

/**
 * Everything the operator needs about one customer, in a single call.
 *
 * `kyc` and `level` are null when the customer has neither. `tickets` and
 * `communications` are the recent pages only — `statistics` carries the true
 * totals, so do not count the arrays.
 */
export class Customer360Dto {
  @ApiProperty({ type: Customer360UserDto })
  user: Customer360UserDto;

  @ApiPropertyOptional({ type: Customer360KycDto, nullable: true, description: "Null when the customer has no KYC record" })
  kyc?: Customer360KycDto | null;

  @ApiPropertyOptional({ type: Customer360LevelDto, nullable: true })
  level?: Customer360LevelDto | null;

  @ApiProperty({ type: [Object], description: "Balance summary per wallet" })
  wallets: Record<string, unknown>[];

  @ApiProperty({ description: "Open credit exposure for this customer" })
  creditExposure: Record<string, unknown>;

  @ApiProperty({ type: [CustomerTagDto] })
  tags: CustomerTagDto[];

  @ApiProperty({ type: [CustomerSegmentDto] })
  segments: CustomerSegmentDto[];

  @ApiProperty({ type: [CustomerNoteDto] })
  notes: CustomerNoteDto[];

  @ApiProperty({ type: [SupportTicketDto], description: "Recent tickets only; see `statistics` for the total" })
  tickets: SupportTicketDto[];

  @ApiProperty({ type: [CommunicationLogDto], description: "Recent contacts only; see `statistics` for the total" })
  communications: CommunicationLogDto[];

  @ApiProperty({ description: "True totals, which the arrays above do not carry" })
  statistics: { totalTickets: number; totalCommunications: number };
}
