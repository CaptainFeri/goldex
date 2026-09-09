import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ManagerAccountStatusEnum,
  ManagerFundingDirectionEnum,
  ManagerFundingStatusEnum,
  ManagerLedgerTypeEnum,
} from "../enum/manager-account.enums";

/** The admin a manager account belongs to, as embedded in account responses. */
export class ManagerAccountAdminDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional({ nullable: true })
  phone?: string | null;

  @ApiPropertyOptional({ nullable: true })
  email?: string | null;

  @ApiPropertyOptional({ nullable: true })
  role?: string | null;
}

/** The asset a manager account is denominated in. */
export class ManagerAccountSymbolDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "ریال" })
  name: string;

  @ApiProperty({ example: "IRR" })
  slug: string;
}

/**
 * A manager's trading account: what is free, what is frozen into bots, and the
 * two added together.
 */
export class ManagerAccountDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  adminId: string;

  @ApiPropertyOptional({ type: ManagerAccountAdminDto, nullable: true })
  admin?: ManagerAccountAdminDto | null;

  @ApiProperty({ format: "uuid" })
  symbolId: string;

  @ApiPropertyOptional({ type: ManagerAccountSymbolDto, nullable: true })
  symbol?: ManagerAccountSymbolDto | null;

  @ApiProperty({ description: "Free to allocate to a bot or to be withdrawn" })
  availableBalance: number;

  @ApiProperty({ description: "Frozen into running bots as their risk budget" })
  allocatedBalance: number;

  @ApiProperty({ description: "availableBalance + allocatedBalance" })
  totalBalance: number;

  @ApiProperty({ enum: ManagerAccountStatusEnum })
  status: ManagerAccountStatusEnum;

  @ApiPropertyOptional({ nullable: true })
  note?: string | null;

  @ApiProperty({ format: "date-time" })
  createdAt: Date;

  @ApiProperty({ format: "date-time" })
  updatedAt: Date;
}

/**
 * A request to charge or unwind a manager's account. Nothing moves until a
 * senior admin — never the requester — approves it.
 */
export class ManagerFundingRequestDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  accountId: string;

  @ApiProperty({ format: "uuid", description: "The manager the charge is for" })
  adminId: string;

  @ApiProperty({ format: "uuid" })
  symbolId: string;

  @ApiProperty()
  amount: number;

  @ApiProperty({ enum: ManagerFundingDirectionEnum })
  direction: ManagerFundingDirectionEnum;

  @ApiProperty({ enum: ManagerFundingStatusEnum })
  status: ManagerFundingStatusEnum;

  @ApiProperty({ format: "uuid" })
  requestedByAdminId: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  reviewedByAdminId?: string | null;

  @ApiPropertyOptional({ format: "date-time", nullable: true })
  reviewedAt?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  reason?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Why a senior admin rejected it" })
  reviewNote?: string | null;

  @ApiProperty({ format: "date-time" })
  createAt: Date;
}

/** One movement on a manager account — the record that explains a balance. */
export class ManagerAccountLedgerEntryDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  accountId: string;

  @ApiProperty({ enum: ManagerLedgerTypeEnum })
  type: ManagerLedgerTypeEnum;

  @ApiProperty({ description: "Signed change to the available balance" })
  availableDelta: number;

  @ApiProperty({ description: "Signed change to the allocated (frozen) balance" })
  allocatedDelta: number;

  @ApiProperty()
  availableAfter: number;

  @ApiProperty()
  allocatedAfter: number;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  botId?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  fundingId?: string | null;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  actorAdminId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiProperty({ format: "date-time" })
  createAt: Date;
}

/** A page of ledger entries, newest first, with the unpaged total. */
export class ManagerAccountLedgerPageDto {
  @ApiProperty({ type: [ManagerAccountLedgerEntryDto] })
  items: ManagerAccountLedgerEntryDto[];

  @ApiProperty({ description: "Total entries on the account, ignoring the page" })
  total: number;
}
