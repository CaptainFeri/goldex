export type AdminRole = "superAdmin" | "admin" | "finance" | "warehouse";

export interface ScheduleEntry {
  id?: string;
  adminId?: string;
  dayOfWeek: number;
  dayLabel: string;
  startTime: string;
  endTime: string;
}

export interface Admin {
  id: string;
  phone: string | null;
  email: string | null;
  role: AdminRole;
  isSuspended: boolean;
  lastLoginAt: string | null;
  createAt: string;
  schedules?: ScheduleEntry[];
}

export interface VerifyOtpResult {
  access_token: string;
  admin: Pick<Admin, "id" | "phone" | "email" | "role">;
}

// ---- Financial / dashboard ----
export interface AssetBalance {
  asset?: string;
  symbol?: string;
  customerFree?: number;
  customerLocked?: number;
  customerTotal?: number;
  systemProfit?: number;
  [k: string]: any;
}
export interface FinancialSummary {
  assets?: AssetBalance[];
  [k: string]: any;
}
export interface ProfitBucket {
  bucket: string;
  asset?: string;
  symbol?: string;
  profit: number;
  [k: string]: any;
}

// ---- KYC ----
export interface KycStats {
  pending?: number;
  approved?: number;
  rejected?: number;
  total?: number;
  [k: string]: any;
}
export interface KycRecord {
  id: string;
  userId?: string;
  status?: string | number;
  level?: number;
  firstName?: string;
  lastName?: string;
  nationalCode?: string;
  createAt?: string;
  [k: string]: any;
}

// ---- Wallet ----
export type WalletType = "DEPOSIT" | "CREDIT" | "COLLATERAL";

export interface Wallet {
  id: string;
  userId?: string;
  walletType?: WalletType;
  symbolId?: string;
  symbol?: SymbolItem | string;
  status?: string;
  freeBalance?: number;
  lockedBalance?: number;
  // Capacity issued to a CREDIT wallet (the credit line/leverage limit), not
  // a real fund balance — freeBalance is drawn down against it as the user
  // trades. Never negative at the wallet-row level; see the credit
  // settlement engine's signed `netXau` positions for the real exposure.
  creditBalance?: number;
  availableBalance?: number;
  frozenFreeBalance?: number;
  frozenLockedBalance?: number;
  frozenAt?: string | null;
  adminNote?: string | null;
  totalBalance?: number;
  calculatedStats?: {
    totalBalance?: number;
    availableBalance?: number;
    totalBalancePrecise?: string;
    availableBalancePrecise?: string;
  };
  updatedAt?: string;
  createAt?: string;
  // Legacy/loose aliases some endpoints still return.
  asset?: string;
  balance?: number;
  free?: number;
  locked?: number;
  [k: string]: any;
}

export interface WalletHistoryPoint {
  timestamp: string | number;
  free?: number;
  locked?: number;
  total?: number;
  [k: string]: any;
}

// ---- Symbol / Pair / Mapping ----
export interface SymbolItem {
  id: string;
  name?: string;
  slug?: string;
  type?: string;
  marketType?: string;
  isActive?: boolean;
  depositTypes?: string[];
  withdrawTypes?: string[];
  [k: string]: any;
}
export interface PricePair {
  id: string;
  baseCode?: string;
  quoteCode?: string;
  baseSymbol?: string;
  quoteSymbol?: string;
  isValid?: boolean;
  buyPrice?: number;
  sellPrice?: number;
  buyWarnHours?: number | null;
  buyExpireHours?: number | null;
  buyGraceHours?: number | null;
  sellWarnHours?: number | null;
  sellExpireHours?: number | null;
  sellGraceHours?: number | null;
  excludedDays?: number[] | null;
  [k: string]: any;
}
export interface PairMapping {
  id: string;
  pairId: string;
  providerKey: string;
  providerItemId: number;
  useBuyPrice: boolean;
  useSellPrice: boolean;
  [k: string]: any;
}

// ---- Provider snapshot (for the available-items dropdown) ----
/** A price pair a provider item feeds. */
export interface MappedPairRef {
  pairId: string;
  pairLabel: string;
  baseSlug: string | null;
  quoteSlug: string | null;
  useBuyPrice: boolean;
  useSellPrice: boolean;
}

export interface ProviderSnapshotItem {
  itemId: number;
  /** The provider's own item name. */
  name: string | null;
  unit: string | null;
  groupId: number | null;
  groupName: string | null;
  buyPrice: number | null;
  sellPrice: number | null;
  buyPricePerGram: number | null;
  sellPricePerGram: number | null;
  canBuy: boolean;
  canSell: boolean;
  spread: number | null;
  spreadPercent: number | null;
  timestamp: string | null;
  stale: boolean;
  /** Goldex pairs this item feeds; empty when unmapped. */
  mappedPairs: MappedPairRef[];
}

export interface ProviderSnapshot {
  providerKey: string;
  items: ProviderSnapshotItem[];
  lastUpdate: string | null;
  totalItems: number;
  pricedItems: number;
  mappedItems: number;
}

// ---- Warehouse ----
export interface Warehouse {
  id: string;
  name: string;
  description?: string;
  location?: string;
  capacityTotal: number;
  capacityUsed: number;
  capacityRemaining: number;
  deliveryDates?: string[];
  deliverySchedule?: Record<string, { start: string; end: string }>;
  timeLimit?: string;
  status: string;
  packets?: Packet[];
  createAt?: string;
  [k: string]: any;
}

export interface Packet {
  id: string;
  warehouseId?: string;
  warehouse?: Warehouse;
  pureWeight: number;
  idSecure: string;
  dateTime?: string;
  deliveryTime?: string;
  status: string;
  warehouseIndexPosition?: string;
  ang?: number;
  ayar?: number;
  apparentWeight?: number;
  wastage?: number;
  picture?: string;
  user?: any;
  userId?: string;
  qrCode?: string;
  isOrphan: boolean;
  batchNumber?: string;
  createAt?: string;
  [k: string]: any;
}

export interface AllocationOption {
  kind: "own-exact" | "own-fit" | "orphan-exact" | "orphan-fit" | "combination";
  optionKey: string;
  title: string;
  packetIds: string[];
  deliveredWeight: number;
  refundWeight: number;
  splitsUserPacket: boolean;
  description: string;
  [k: string]: any;
}

export interface WarehouseRequest {
  id: string;
  type: "INPUT" | "OUTPUT";
  status: string;
  user?: any;
  userId?: string;
  packet?: Packet;
  packetId?: string;
  warehouse?: Warehouse;
  warehouseId?: string;
  admin?: Admin;
  adminId?: string;
  weight: number;
  symbolId?: string;
  deliveryDate?: string;
  deliveryTime?: string;
  deliveryLocation?: string;
  notes?: string;
  processedAt?: string;
  metadata?: any;
  createAt?: string;
  [k: string]: any;
}

// ---- Order Book ----
export interface OrderBookDepthLevel {
  price: number;
  size: number;
  orderCount: number;
}

export interface OrderBookDepth {
  bids: OrderBookDepthLevel[];
  asks: OrderBookDepthLevel[];
}

// ---- Monitoring / charts ----
export interface ComparePoint {
  timestamp: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
}
export interface CompareSeries {
  providerKey: string;
  providerItemId: number;
  useBuyPrice: boolean;
  useSellPrice: boolean;
  points: ComparePoint[];
}
export interface CompareResponse {
  pairId: string;
  series: CompareSeries[];
}

export interface HistoryPoint {
  timestamp: string;
  buyPrice: number;
  sellPrice: number;
  spread: number;
}
export interface HistoryResponse {
  provider: string;
  itemId: number;
  points: HistoryPoint[];
}

export interface CurrentSnapshot {
  [k: string]: any;
}
/**
 * An item as returned by /admin/pair-mappings/available-items — a narrower
 * shape than the monitoring snapshot, with no group or mapping info.
 */
export interface ProviderAvailableItem {
  itemId: number;
  name: string;
  unit: string;
  buyPrice: number;
  sellPrice: number;
}

/** @deprecated superseded by ProviderSnapshot, which the endpoint now returns. */
export interface CurrentProviderResponse {
  provider: string;
  items: ProviderSnapshotItem[];
}

// ---- Discounts / Coupons ----
export interface DiscountCoupon {
  id: number;
  code: string;
  couponType: string;
  discountAmount: number;
  discountPercentage: number;
  maxDiscount: number;
  usageCount: number;
  usageLimit: number;
  isActive: boolean;
  expiredAt: string;
  adminInfo?: { id: string; phone?: string; email?: string; role?: string };
  createdAt?: string;
  updatedAt?: string;
  [k: string]: any;
}

export interface DiscountOverview {
  id: number;
  code: string;
  couponType: string;
  usageCount: number;
  usageLimit: number;
  isActive: boolean;
  expiresAt: string;
  createdAt: string;
  [k: string]: any;
}

export interface DiscountList {
  discountCouponOverviewList: DiscountOverview[];
  totalItems: number;
}

// ---- Credit ----
export type CreditStatus = "PENDING" | "ACTIVE" | "SUSPENDED" | "SETTLED" | "EXPIRED" | "CANCELLED";
export type SettlementState = "GREEN" | "YELLOW" | "RED" | "ADMIN_REVIEW" | "AUTO_LIQUIDATION" | "SETTLED";
export type RiskState = "NORMAL" | "WARNING" | "MARGIN_CALL" | "REDUCING" | "LIQUIDATING" | "LIQUIDATED" | "SETTLED" | "DEFAULT";

export interface Credit {
  id: string;
  userId: string;
  adminId: string | null;
  creditCode: string;
  amount: number;
  status: CreditStatus;
  hasCallMargin: boolean;
  callMarginPercent: number | null;
  reminderTimerHours: number;
  reminderLastSentAt: string | null;
  expireAt: string;
  activatedAt: string | null;
  settledAt: string | null;
  notes: string | null;
  settleImagePath: string | null;
  settlementState: SettlementState;
  riskState: RiskState;
  greenDurationHours: number;
  yellowDurationHours: number;
  redDurationHours: number;
  settlementYellowAt: string | null;
  settlementRedAt: string | null;
  settlementAdminReviewAt: string | null;
  riskWarningAt: string | null;
  riskMarginCallAt: string | null;
  outstandingShortfall: number;
  isInDefault: boolean;
  metadata: any;
  leverage?: number | null;
  creditLimit?: number;
  usedCredit?: number;
  availableCredit?: number;
  collateralSymbolId?: string | null;
  collateralAmount?: number;
  initialCollateralValue?: number;
  currentCollateralValue?: number;
  drawdownPercent?: number | null;
  lastDrawdownPercent?: number;
  creditBaseSymbolId?: string | null;
  enforceOnDrawdown?: "ENFORCE" | "ALERT" | null;
  enforceOnExpiry?: "ENFORCE" | "ALERT" | null;
  enforceRequestDeadline?: boolean | null;
  user?: { id: string; firstName?: string; lastName?: string; phone?: string; email?: string };
  creditOrders?: any[];
  createAt: string;
  [k: string]: any;
}

// ---- Credit cash-out (pay off one purchase, facility stays open) ----
export type CashoutSource = "DEPOSIT" | "COLLATERAL";

export interface CreditCashout {
  id: string;
  creditId: string;
  creditOrderId: string;
  orderId: string | null;
  source: CashoutSource;
  /** Credit repaid (credit currency). */
  amount: number;
  feePercent: number;
  feeAmount: number;
  /** Conversion commission booked in collateral units. */
  spreadProfit: number;
  /** Total platform profit, valued in the credit currency. */
  systemProfitValue: number;
  assetSymbolId: string | null;
  assetAmount: number;
  collateralConsumed: number;
  markPrice: number;
  creditLimitReduction: number;
  sellCapacityReduction: number;
  requestedBy: string | null;
  adminId: string | null;
  notes: string | null;
  metadata: any;
  createAt: string;
}

export interface CashoutTotals {
  count: number;
  volume: number;
  fees: number;
  spreadProfit: number;
  systemProfit: number;
  collateralConsumed: number;
  creditLimitReduction: number;
}

export interface CashoutTradeOption {
  creditOrderId: string;
  orderId: string;
  orderCode: string;
  pairKey: string;
  executedQuantity: number;
  price: number;
  executedAt: string | null;
  amount: number;
  feePercent: number;
  feeAmount: number;
  totalDue: number;
  systemProfitValue: number;
  assetSymbolId: string | null;
  assetSymbolSlug: string;
  assetAmount: number;
  assetHeld: number;
  eligible: boolean;
  reason: string | null;
  deposit: { required: number; available: number; sufficient: boolean };
  collateral: {
    requiredUnits: number;
    available: number;
    sufficient: boolean;
    blockedReason: string | null;
    creditLimitReduction: number;
    sellCapacityReduction: number;
    spreadProfit: number;
  };
}

export interface CashoutOptions {
  supported: boolean;
  reason: string | null;
  creditId: string;
  creditCode: string;
  markPrice: number;
  creditBaseSymbolId: string | null;
  collateralSymbolId: string | null;
  depositBalance: number;
  collateralAvailable: number;
  feePercent: number;
  collateralConversionPercent: number;
  trades: CashoutTradeOption[];
}

// ---- Credit settlement (delivery-based workflow, handoff §7/§13) ----
export type SettlementWorkflowStatus =
  | "SETTLEMENT_REQUESTED" | "PENDING_ADMIN_REVIEW" | "APPROVED" | "VALUATED" | "METHOD_SELECTED"
  | "FUNDING_REQUIRED" | "READY" | "ASSET_RECEIVED" | "ASSET_VERIFIED" | "LIABILITY_CLEARED"
  | "ASSET_SETTLED" | "COLLATERAL_RELEASED" | "CLOSED" | "REJECTED" | "FAILED";
export type SettlementMethod = "FULL" | "NET" | "TOPUP";
export type SettlementValuationState = "EXPOSURE_LT_COLLATERAL" | "EXPOSURE_GT_COLLATERAL" | "EXPOSURE_EQ_COLLATERAL";

export interface CreditSettlement {
  id: string;
  creditId: string;
  creditOrderId: string | null;
  requiredAssetSymbolId: string | null;
  requiredAmount: number;
  receivedAmount: number;
  status: SettlementWorkflowStatus;
  requestedBy: string | null;
  requestedAt: string | null;
  receivedAt: string | null;
  verifiedAt: string | null;
  liabilityClearedAt: string | null;
  assetSettledAt: string | null;
  collateralReleasedAt: string | null;
  closedAt: string | null;
  notes: string | null;
  settlementMethod: SettlementMethod | null;
  valuationState: SettlementValuationState | null;
  collateralValue: number;
  exposureValue: number;
  shortfall: number;
  requiredTopUp: number;
  fundedAmount: number;
  releaseAmount: number;
  realizedPnL: number;
  finalCollateralState: any;
  approvedBy: string | null;
  approvedAt: string | null;
  approvalReason: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  createAt: string;
  [k: string]: any;
}

// ---- Credit settlement engine (mark-to-market valuation) ----
export interface BaseSymbolPosition {
  symbolId: string;
  baseSymbolSlug: string;
  // Signed net position in the base symbol at the credit's mark price.
  // Negative = short/owed (e.g. sold this asset on credit) — the "negative
  // used balance" the credit wallets model as drawn-down capacity.
  netXau: number;
  markPrice: number;
}

export interface SettlementEligibility {
  // Whether the facility could complete a voluntary settlement right now —
  // i.e. whether it nets to zero or positive after collateral, with no
  // outstanding shortfall.
  eligible: boolean;
  legacy: boolean;
  markPrice: number | null;
  positions: BaseSymbolPosition[];
  netEquity: number;
  deficit: number;
  shortfall: number;
  collateralValue: number;
}

export type FinanceAction =
  | "CREDIT_CREATED" | "CREDIT_ACTIVATED" | "CREDIT_SETTLED" | "CREDIT_EXPIRED" | "CREDIT_CANCELLED"
  | "WALLET_FROZEN" | "WALLET_UNFROZEN" | "BALANCE_INCREASED" | "BALANCE_FROZEN_FOR_CREDIT"
  | "BALANCE_UNFROZEN_FOR_CREDIT" | "MATERIAL_FREEZE" | "LIQUIDATION" | "ORDER_CANCELLED_MARGIN"
  | "EXPIRY_FREEZE_ALL" | "USER_STATUS_CHANGED" | "ALL_WALLETS_FROZEN" | "REMINDER_SENT"
  | "CREDIT_SUSPENDED" | "CREDIT_REACTIVATED" | "CREDIT_EXTENDED" | "CREDIT_LIMIT_ADJUSTED"
  | "CREDIT_FORCE_LIQUIDATED";

export interface FinanceLog {
  id: string;
  adminId: string | null;
  userId: string | null;
  creditId: string | null;
  walletId: string | null;
  orderId: string | null;
  actionType: FinanceAction;
  description: string | null;
  metadata: any;
  actionTime: string;
  admin?: { id: string; phone?: string; email?: string; role?: string };
  createAt: string;
  [k: string]: any;
}

// ---- Provider finance ----
export interface SettlementRecord {
  id: string;
  providerKey: string;
  symbol: string;
  direction: "RECEIVE" | "PAY";
  amount: number;
  note?: string;
  createdAt: string;
  [k: string]: any;
}

// ---- Customer with balances (financial/customers) ----
export interface CustomerWithBalance {
  id: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  balances?: { symbol: string; free: number; locked: number }[];
  [k: string]: any;
}

// ---- Deposit & Withdraw ----
export interface DepositRequest {
  id: string;
  userId: string;
  user?: { id: string; firstName?: string; lastName?: string; phone?: string; email?: string };
  symbolId: string;
  symbol?: { id: string; name?: string; slug?: string };
  type: string;
  amount: number;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  adminId: string | null;
  notes: string | null;
  picturePath: string | null;
  gatewayCode?: string | null;
  metadata: any;
  completedAt: string | null;
  createAt: string;
  [k: string]: any;
}

export interface WithdrawRequest {
  id: string;
  userId: string;
  user?: { id: string; firstName?: string; lastName?: string; phone?: string; email?: string };
  symbolId: string;
  symbol?: { id: string; name?: string; slug?: string };
  type: string;
  amount: number;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED";
  adminId: string | null;
  notes: string | null;
  picturePath: string | null;
  metadata: any;
  completedAt: string | null;
  createAt: string;
  [k: string]: any;
}

// ---- Telegram monitoring / market maker ----
export interface TelegramMarketState {
  deliveryType: string;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  lastPrice: number;
  lastAction: string;
  priceChange: number;
  priceChangePercent: number;
  direction: 'UP' | 'DOWN' | 'FLAT';
  volume: number;
  lastUpdate: number;
}

export type TelegramOpportunityType = 'PRICE_MOVEMENT' | 'BEST_PRICE';

export interface TelegramOpportunityRecord {
  id: number;
  date: number;
  type: TelegramOpportunityType;
  deliveryType: string;
  direction: 'UP' | 'DOWN' | 'FLAT';
  price: number;
  previousPrice: number;
  changePercent: number;
  messageId: number;
  quantity: number;
  description?: string;
}

export interface TelegramPricePoint {
  date: number;
  messageId: number;
  price: number;
  side: string;
  ourAction: string;
  subType: string;
  deliveryType: string;
  quantity: number;
  description?: string;
}

export interface TelegramPriceFilters {
  subTypes: { value: string; label: string }[];
  deliveryTypes: string[];
}

// ---- Order detail ----
export interface AdminOrder {
  id: string;
  orderCode?: string;
  userId?: string;
  user?: any;
  pricePair?: PricePair;
  base?: string;
  quote?: string;
  side: "BUY" | "SELL" | string;
  orderType: "MARKET" | "LIMIT" | "QUOTE" | string;
  quantity: number;
  price?: number;
  averagePrice?: number;
  executedQuantity?: number;
  totalValue?: number;
  commission?: number;
  status: string;
  /** CREDIT = drawn on a credit line, WALLET = spent from a deposited balance. */
  fundingSource?: "CREDIT" | "WALLET";
  isCreditLinked?: boolean;
  credit?: {
    creditId: string;
    creditCode: string | null;
    creditOrderStatus: string;
    priceAtOrderTime: number | null;
  } | null;
  notes?: string;
  providerOrderId?: string;
  metadata?: any;
  createdAt?: string;
  createAt?: string;
  updatedAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  [k: string]: any;
}

// ---- Company bank accounts (admin-managed) ----
export type BankAccountStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export interface AdminBankAccount {
  id: string;
  title: string;
  bankName: string;
  ownerName: string;
  accountNumber?: string | null;
  cardNumber?: string | null;
  iban?: string | null;
  symbolId: string;
  symbol?: SymbolItem | any;
  /** The two direction flags. Either, both, or neither may be on. */
  useForDeposit: boolean;
  useForWithdraw: boolean;
  priority: number;
  depositDailyLimit?: number | null;
  depositPerTxLimit?: number | null;
  withdrawDailyLimit?: number | null;
  withdrawPerTxLimit?: number | null;
  depositUsedToday?: number;
  withdrawUsedToday?: number;
  activeFromHour?: number | null;
  activeToHour?: number | null;
  status: BankAccountStatus;
  notes?: string | null;
  createAt?: string;
  updateAt?: string;
}

// ---- P2P matching / settlement ----
export type P2pEscalationReason =
  | "WITHDRAWER_REJECT"
  | "WITHDRAWER_NO_RESPONSE"
  | "SETTLEMENT_TIMEOUT"
  | "RECEIPT_MISMATCH"
  | "DUPLICATE_PAYMENT"
  | "ADMIN_ACCOUNT_UNAVAILABLE";

export type P2pResolutionType =
  | "CONFIRM_PAYMENT"
  | "REJECT_PAYMENT"
  | "REQUEST_MORE_EVIDENCE"
  | "SETTLE_FROM_ADMIN"
  | "REOPEN_MATCHING"
  | "CANCEL_REQUEST";

export interface P2pPaymentProof {
  id: string;
  amount: number;
  sourceAccount?: string;
  destinationAccount?: string;
  trackingCode?: string;
  paidAt?: string;
  receiptUrl?: string;
  ocrMismatch?: boolean;
  ocrResultJson?: any;
  submittedAt?: string;
}

export interface P2pMatch {
  id: string;
  depositIntentId: string;
  withdrawPartId: string;
  amount: number;
  score?: number;
  scoreBreakdownJson?: Record<string, number>;
  source: "CUSTOMER" | "ADMIN";
  adminAccountId?: string | null;
  status: string;
  reservedAt?: string;
  reservationExpiresAt?: string;
  responseDeadlineAt?: string;
  settlementDeadlineAt?: string;
  destinationSnapshotJson?: any;
  paymentProof?: P2pPaymentProof | null;
  depositor?: any;
  withdrawer?: any;
  createAt?: string;
}

export interface P2pEscalation {
  id: string;
  matchId: string;
  match?: P2pMatch;
  reason: P2pEscalationReason;
  priority: number;
  status: "OPEN" | "ASSIGNED" | "RESOLVED" | "VOID";
  deadlineAt?: string;
  assignedAdminId?: string | null;
  resolutionType?: P2pResolutionType | null;
  resolutionNote?: string | null;
  resolvedByAdminId?: string | null;
  resolvedAt?: string | null;
  checkerAdminId?: string | null;
  checkedAt?: string | null;
  timeline?: { at: string; actor: string; action: string; note?: string }[];
  createAt?: string;
}

export interface P2pSettings {
  settlementTimeoutMinutes: number;
  withdrawerResponseTimeoutMinutes: number;
  reservationTtlMinutes: number;
  sourcePriority: { deposit: "CUSTOMER_FIRST" | "ADMIN_FIRST"; withdrawal: "CUSTOMER_FIRST" | "ADMIN_FIRST" };
  matchingWeights: { amountFit: number; partsFit: number; constraints: number; age: number; priority: number; risk: number };
  matchingMaxRetry: number;
  escalation: { notifyAdminOnReject: boolean; notifyAdminOnNoResponse: boolean; requireAdminResolution: boolean };
  twoPersonApprovalThreshold: number;
  allowOverUnderSplit: boolean;
  requestExpiryHours: number;
}

export interface P2pDashboard {
  pendingWithdrawals: number;
  unmatchedDeposits: number;
  waitingConfirmation: number;
  escalated: number;
  timeoutRisk: number;
  adminLiquidity: number;
  /** Spendable company balance per rial symbol, behind the headline figure. */
  adminLiquidityBySymbol?: { symbolId: string; slug?: string; balance: number }[];
  todayCompletedCount: number;
  todayCompletedAmount: number;
}

// ---- Arbitrage ----
export interface ArbitrageLeg {
  providerKey: string;
  itemId: number;
  /** `buy` = we buy from this provider (their sell side); `sell` = we sell to them. */
  action: "buy" | "sell";
  price: number;
  priceStr: string;
  timestamp: string;
}

export interface ArbitrageSignal {
  id: string;
  /** Stable identity: `<itemId>:<buyProvider>-><sellProvider>`. */
  key: string;
  itemId: number;
  itemName: string;
  groupId: number;
  groupName: string;
  unit: string;
  buyLeg: ArbitrageLeg;
  sellLeg: ArbitrageLeg;
  legs: ArbitrageLeg[];
  profitRial: number;
  profitPercent: number;
  /** Profit expressed in grams of gold, using `goldPriceRef`. */
  profitGold: number;
  goldPriceRef: number;
  deadline: string;
  detectedAt: string;
}

/** Which source answered, and how fresh it is. */
export interface ArbitrageStatus {
  source: "bus" | "pricing-redis" | "none";
  scannedAt: string | null;
  ageSeconds: number | null;
  staleAfterSeconds: number;
  stale: boolean;
  trigger: string | null;
  opportunityCount: number;
  totalProviders: number;
  totalItems: number;
  bestProfitRial: number;
  engineRedisReachable: boolean;
  message?: string;
}

export interface ArbitrageConfig {
  minProfitRial: number;
  minProfitPercent: number;
  maxSignals: number;
  quoteFreshnessMs: number;
  signalTtlMs: number;
  scanIntervalMs: number;
  recomputeDebounceMs: number;
}

export interface ArbitrageConfigResponse {
  config: ArbitrageConfig | null;
  running: boolean | null;
  reportedAt: string | null;
}

// ---- Order book status ----
export interface OrderBookStatus {
  pairId: string;
  baseSlug: string | null;
  quoteSlug: string | null;
  pairLabel: string;
  isValid: boolean;
  hasBook: boolean;
  bidLevels: number;
  askLevels: number;
  restingOrders: number;
  dbPendingOrders: number;
  inSync: boolean;
  totalBidSize: number;
  totalAskSize: number;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  spreadPercent: number | null;
  crossed: boolean;
  limitPoolStatus: "OPEN" | "CLOSED" | null;
  limitPoolOverridden: boolean;
}

export interface OrderBookOverview {
  pairs: OrderBookStatus[];
  summary: {
    totalPairs: number;
    validPairs: number;
    withBook: number;
    openPools: number;
    withRestingOrders: number;
    totalRestingOrders: number;
    emptyWhileOpen: number;
    outOfSync: number;
    crossed: number;
    missingBook: number;
  };
}

// ---- Market status ----
export type MarketPoolType = "MARKET" | "LIMIT" | "QUOTE";
export type MarketStatusValue = "OPEN" | "CLOSED";
export type MarketStatusReason =
  | "price-fresh"
  | "stale-price"
  | "no-price"
  | "bridge-price"
  | "pool-default-open"
  | "admin-override";

export interface PairPoolStatusView {
  pairId: string;
  pairLabel: string;
  baseSlug: string | null;
  quoteSlug: string | null;
  isValid: boolean;
  lastPriceAt: string | null;
  poolType: MarketPoolType;
  derivedStatus: MarketStatusValue;
  adminOverride: MarketStatusValue | null;
  effectiveStatus: MarketStatusValue;
  reason: MarketStatusReason;
  /** Bridge symbol carrying the price, when the reason is `bridge-price`. */
  bridgeSlug: string | null;
  /** False when the row was derived on the fly and no sweep has written it yet. */
  persisted: boolean;
  updatedAt: string | null;
}

export interface MarketStatusSummary {
  totalPairs: number;
  openPairs: number;
  fullyClosedPairs: number;
  overriddenPools: number;
  stalePricePairs: number;
  bridgedPairs: number;
  byPool: Record<MarketPoolType, { open: number; closed: number; overridden: number }>;
}

// ---- Symbol capabilities ----
export interface GatewayOption {
  code: string;
  name: string;
  /** rial | fiat | crypto | material */
  category: string;
  /** formal | informal */
  kind: string;
  /** up | down | not_configured | unknown — absent when cbp did not answer. */
  status?: string;
  statusMessage?: string;
}

export interface TransferTypeOption {
  value: string;
  /** Selecting this type requires at least one gateway for that direction. */
  gatewayBound: boolean;
}

export interface SymbolTypeCapability {
  symbolType: string;
  depositTypes: TransferTypeOption[];
  withdrawTypes: TransferTypeOption[];
  defaultDepositTypes: string[];
  defaultWithdrawTypes: string[];
  eligibleGatewayCategories: string[];
  eligibleGateways: string[];
  defaultDepositGateways: string[];
  defaultWithdrawGateways: string[];
}

export interface SymbolCapabilities {
  symbolTypes: SymbolTypeCapability[];
  gateways: GatewayOption[];
  gatewayRegistryAvailable: boolean;
  gatewayRegistryError?: string;
}

// ---- Price routing ----
export type RoutingMode = "AUTO" | "DIRECT" | "BRIDGE" | "BEST";
export type RouteKind = "DIRECT" | "BRIDGE";

export interface RouteLeg {
  pairId: string;
  baseSlug: string;
  quoteSlug: string;
  /** True when the stored pair is quote/base and its price was inverted. */
  inverted: boolean;
  price: number;
  provider: string | null;
  lastUpdated: string | null;
  stale: boolean;
}

export interface RouteCandidate {
  kind: RouteKind;
  side: "BUY" | "SELL";
  bridgeSlug: string | null;
  bridgeSymbolId: string | null;
  legs: RouteLeg[];
  price: number | null;
  usable: boolean;
  rejection: string | null;
  note: string | null;
  deviationPercent: number | null;
}

export interface PriceRoute {
  pairId: string;
  pairLabel: string;
  side: "BUY" | "SELL";
  routingMode: RoutingMode;
  selected: RouteCandidate | null;
  direct: RouteCandidate | null;
  bridges: RouteCandidate[];
  deviationBlocked: boolean;
}

export interface PairRoutes {
  pairId: string;
  pairLabel: string;
  routingMode: RoutingMode;
  configuredBridgeSlug: string | null;
  bridgeMaxDeviationPercent: number | null;
  buy: PriceRoute;
  sell: PriceRoute;
  usesBridge: boolean;
  unpriceable: boolean;
}
