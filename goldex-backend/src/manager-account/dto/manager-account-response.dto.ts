import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  ManagerAccountStatusEnum,
  ManagerFundingDirectionEnum,
  ManagerFundingStatusEnum,
  ManagerLedgerTypeEnum,
} from "../enum/manager-account.enums";

export class ManagerAccountAdminRefDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiPropertyOptional({ nullable: true, example: "09123456789" })
  phone?: string;

  @ApiPropertyOptional({ nullable: true })
  email?: string;

  @ApiPropertyOptional({ nullable: true })
  role?: string;
}

export class ManagerAccountSymbolRefDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ example: "XAU" })
  slug: string;
}

export class ManagerAccountDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  adminId: string;

  @ApiProperty({ type: ManagerAccountAdminRefDto, nullable: true })
  admin: ManagerAccountAdminRefDto | null;

  @ApiProperty({ format: "uuid" })
  symbolId: string;

  @ApiProperty({ type: ManagerAccountSymbolRefDto, nullable: true })
  symbol: ManagerAccountSymbolRefDto | null;

  @ApiProperty({ description: "Free to allocate to a bot or to be withdrawn" })
  availableBalance: number;

  @ApiProperty({ description: "Frozen into running bots as their risk budget" })
  allocatedBalance: number;

  @ApiProperty({ description: "available + allocated" })
  totalBalance: number;

  @ApiProperty({ enum: ManagerAccountStatusEnum })
  status: ManagerAccountStatusEnum;

  @ApiProperty({ nullable: true })
  note: string | null;

  @ApiProperty({ format: "date-time", nullable: true })
  createdAt: Date | null;

  @ApiProperty({ format: "date-time", nullable: true })
  updatedAt: Date | null;
}

export class ManagerAccountFundingDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  accountId: string;

  @ApiProperty({ format: "uuid", description: "The manager whose account this charges" })
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

  @ApiProperty({
    format: "uuid",
    nullable: true,
    description: "The senior admin who decided; never the requester",
  })
  reviewedByAdminId: string | null;

  @ApiProperty({ format: "date-time", nullable: true })
  reviewedAt: Date | null;

  @ApiProperty({ nullable: true })
  reason: string | null;

  @ApiProperty({ nullable: true, description: "Shown back to the requesting manager" })
  reviewNote: string | null;
}

/** One movement on a manager account, as the ledger records it. */
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

  @ApiProperty({ format: "uuid", nullable: true })
  botId: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  fundingId: string | null;

  @ApiProperty({ format: "uuid", nullable: true })
  actorAdminId: string | null;

  @ApiProperty({ nullable: true })
  description: string | null;
}
