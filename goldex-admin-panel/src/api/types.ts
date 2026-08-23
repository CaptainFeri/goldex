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
export interface Wallet {
  id: string;
  userId?: string;
  symbol?: string;
  asset?: string;
  balance?: number;
  free?: number;
  locked?: number;
  status?: string;
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
export interface ProviderSnapshotItem {
  itemId: number;
  name?: string;
  slug?: string;
  buyPrice?: number;
  sellPrice?: number;
  unit?: string;
  [k: string]: any;
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
export type CreditStatus = "PENDING" | "ACTIVE" | "SETTLED" | "EXPIRED" | "CANCELLED";
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
  maxExecutionTradeLevel: number | null;
  executedTradeLevel: number;
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

export type FinanceAction =
  | "CREDIT_CREATED" | "CREDIT_ACTIVATED" | "CREDIT_SETTLED" | "CREDIT_EXPIRED" | "CREDIT_CANCELLED"
  | "WALLET_FROZEN" | "WALLET_UNFROZEN" | "BALANCE_INCREASED" | "BALANCE_FROZEN_FOR_CREDIT"
  | "BALANCE_UNFROZEN_FOR_CREDIT" | "MATERIAL_FREEZE" | "LIQUIDATION" | "ORDER_CANCELLED_MARGIN"
  | "EXPIRY_FREEZE_ALL" | "USER_STATUS_CHANGED" | "ALL_WALLETS_FROZEN" | "REMINDER_SENT";

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
