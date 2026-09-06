import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SymbolRefDto } from "../../shared/dto/symbol-ref.dto";
import { UserRefDto } from "../../shared/dto/user-ref.dto";
import { WalletStatusEnum } from "../../wallet/enum/wallet-status.enum";
import { WalletTypeEnum } from "../../wallet/enum/wallet-type.enum";
import { TransactionStatusEnum } from "../../wallet/enum/transaction.status.enum";
import { TransactionTypeEnum } from "../../wallet/enum/transaction.type.enum";

/**
 * A wallet as the admin API returns it.
 *
 * All balances are decimal strings in the wallet's own symbol. The five
 * balance columns are distinct buckets, not views of one number:
 * `availableBalance` is what may be spent, `lockedBalance` is committed to open
 * orders, `creditBalance` is borrowed, and the two `frozen*` columns are held
 * by an admin action.
 */
export class AdminWalletDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  userId: string;

  @ApiPropertyOptional({ type: UserRefDto })
  user?: UserRefDto;

  @ApiProperty({ format: "uuid" })
  symbolId: string;

  @ApiPropertyOptional({ type: SymbolRefDto })
  symbol?: SymbolRefDto;

  @ApiProperty({ enum: WalletTypeEnum, example: WalletTypeEnum.DEPOSIT })
  walletType: WalletTypeEnum;

  @ApiProperty({ example: "1250000000.00000000" })
  freeBalance: string;

  @ApiProperty({ example: "0.00000000", description: "Committed to open orders" })
  lockedBalance: string;

  @ApiProperty({ example: "1250000000.00000000", description: "Spendable right now" })
  availableBalance: string;

  @ApiProperty({ example: "0.00000000", description: "Borrowed against credit" })
  creditBalance: string;

  @ApiProperty({ example: "0.00000000", description: "Held by an admin freeze" })
  frozenFreeBalance: string;

  @ApiProperty({ example: "0.00000000" })
  frozenLockedBalance: string;

  @ApiProperty({ enum: WalletStatusEnum, example: WalletStatusEnum.ACTIVE })
  status: WalletStatusEnum;

  @ApiProperty()
  createAt: Date;

  @ApiProperty()
  updateAt: Date;
}

export class WalletTransactionDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  walletId: string;

  @ApiPropertyOptional({ format: "uuid", nullable: true })
  orderId?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "External reference, where one exists" })
  transactionId?: string | null;

  @ApiProperty({ enum: TransactionTypeEnum, example: TransactionTypeEnum.ADMIN_ADJUSTMENT })
  transactionType: TransactionTypeEnum;

  @ApiProperty({ enum: TransactionStatusEnum, example: TransactionStatusEnum.COMPLETED })
  status: TransactionStatusEnum;

  @ApiProperty({ example: "1250000000.00000000", description: "In the wallet's symbol" })
  amount: string;

  @ApiPropertyOptional({ example: "0.00000000" })
  fee?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: "Unit price where the transaction came from a trade — quoted, not in the wallet's symbol",
  })
  price?: string | null;

  @ApiPropertyOptional({ nullable: true })
  description?: string | null;

  @ApiPropertyOptional({ nullable: true })
  metadata?: Record<string, unknown> | null;

  @ApiProperty()
  createAt: Date;
}

export class AdminWalletLogDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ format: "uuid" })
  adminId: string;

  @ApiProperty({ format: "uuid" })
  walletId: string;

  @ApiProperty({ example: "UPDATE_BALANCE", description: "UPDATE_BALANCE, ADJUST_BALANCE, FREEZE_WALLET, UPDATE_STATUS" })
  action: string;

  @ApiPropertyOptional({ nullable: true, description: "Before/after balances and the reason, per action" })
  metadata?: Record<string, unknown> | null;

  @ApiProperty()
  createAt: Date;
}

/** Balances recomputed at read time; never stored. */
export class WalletCalculatedStatsDto {
  @ApiProperty({ example: 125000000, description: "Lossy — use the precise variant for arithmetic" })
  totalBalance: number;

  @ApiProperty({ example: 125000000 })
  availableBalance: number;

  @ApiProperty({ example: "125000000.00000000" })
  totalBalancePrecise: string;

  @ApiProperty({ example: "125000000.00000000" })
  availableBalancePrecise: string;
}

export class AdminWalletListItemDto extends AdminWalletDto {
  @ApiProperty({ type: WalletCalculatedStatsDto })
  calculatedStats: WalletCalculatedStatsDto;
}

/**
 * The wallet list.
 *
 * Note the field name: rows arrive under `data`, so on the wire the payload is
 * `data.data` once the response envelope is applied. It predates the shared
 * pagination contract — documented as it is rather than reshaped, because the
 * panel's wallet screens read this shape.
 */
export class AdminWalletListDto {
  @ApiProperty({ type: [AdminWalletListItemDto], description: "The rows — nested under `data` inside the envelope's `data`" })
  data: AdminWalletListItemDto[];

  @ApiProperty({ example: 240 })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20, description: "Rows per page — the older name for `pageSize`" })
  limit: number;

  @ApiProperty({ example: 12 })
  totalPages: number;
}

export class WalletPreciseValuesDto {
  @ApiProperty({ example: "125000000.00000000" })
  totalBalance: string;

  @ApiProperty({ example: "125000000.00000000" })
  availableBalance: string;

  @ApiProperty({ example: "125000000.00000000" })
  freeBalance: string;

  @ApiProperty({ example: "0.00000000" })
  lockedBalance: string;
}

export class WalletDetailStatsDto {
  @ApiProperty({ example: 125000000 })
  totalBalance: number;

  @ApiProperty({ example: 125000000 })
  availableBalance: number;

  @ApiProperty({ example: 0 })
  frozenFreeBalance: number;

  @ApiProperty({ example: 0 })
  frozenLockedBalance: number;

  @ApiProperty({ type: WalletPreciseValuesDto, description: "The same figures as strings, safe for arithmetic" })
  preciseValues: WalletPreciseValuesDto;
}

export class AdminWalletDetailsDto {
  @ApiProperty({ type: AdminWalletDto })
  wallet: AdminWalletDto;

  @ApiProperty({ type: WalletDetailStatsDto })
  stats: WalletDetailStatsDto;

  @ApiProperty({ type: [WalletTransactionDto], description: "The 20 most recent" })
  recentTransactions: WalletTransactionDto[];

  @ApiProperty({ type: [AdminWalletLogDto], description: "The 50 most recent admin actions" })
  adminLogs: AdminWalletLogDto[];
}

export class WalletBalanceChangeDto {
  @ApiPropertyOptional({ example: 125000000 })
  free?: number;

  @ApiPropertyOptional({ example: 0 })
  locked?: number;
}

export class WalletMutationDetailsDto {
  @ApiPropertyOptional({ example: 125000000 })
  oldBalance?: number;

  @ApiPropertyOptional({ example: 130000000 })
  newBalance?: number;

  @ApiPropertyOptional({ example: "5000000", description: "Decimal string" })
  amount?: string | number | null;

  @ApiPropertyOptional({ example: "FREEZE", description: "Freeze actions only" })
  action?: string;

  @ApiPropertyOptional({ description: "Freeze actions only" })
  frozenFreeBalance?: string;

  @ApiPropertyOptional({ description: "Freeze actions only" })
  frozenLockedBalance?: string;
}

/**
 * What the four mutating endpoints return.
 *
 * `transaction` is present only where the action wrote one — a status change
 * does not, a balance movement does.
 */
export class AdminWalletMutationDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ type: AdminWalletDto, description: "The wallet after the change" })
  wallet: AdminWalletDto;

  @ApiPropertyOptional({ type: WalletTransactionDto, description: "Only when the action recorded one" })
  transaction?: WalletTransactionDto;

  @ApiProperty({ example: "Balance increased successfully", description: "English; not localised" })
  message: string;

  @ApiPropertyOptional({ type: WalletMutationDetailsDto })
  details?: WalletMutationDetailsDto;
}

/** One balance-affecting admin action, for the history chart. */
export class WalletBalanceHistoryEntryDto {
  @ApiProperty()
  timestamp: Date;

  @ApiProperty({ example: "UPDATE_BALANCE", description: "UPDATE_BALANCE or ADJUST_BALANCE" })
  action: string;

  @ApiPropertyOptional({ type: WalletBalanceChangeDto, nullable: true })
  oldBalance?: WalletBalanceChangeDto | null;

  @ApiPropertyOptional({ type: WalletBalanceChangeDto, nullable: true })
  newBalance?: WalletBalanceChangeDto | null;

  @ApiPropertyOptional({ nullable: true, example: "5000000" })
  amount?: string | null;

  @ApiPropertyOptional({ nullable: true, description: "Reason, falling back to the action's description" })
  reason?: string | null;

  @ApiProperty({ format: "uuid" })
  adminId: string;

  @ApiPropertyOptional({ nullable: true, example: "5000000" })
  preciseAmount?: string | null;
}
