export type AdminRole = "superAdmin" | "admin" | "finance" | "warehouse";

export interface Admin {
  id: string;
  phone: string | null;
  email: string | null;
  role: AdminRole;
  isSuspended: boolean;
  lastLoginAt: string | null;
  createAt: string;
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
  picture?: string;
  user?: any;
  userId?: string;
  qrCode?: string;
  isOrphan: boolean;
  batchNumber?: string;
  createAt?: string;
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
  source: "PROVIDER" | "CUSTOMER";
}

export interface OrderBookDepth {
  bids: OrderBookDepthLevel[];
  asks: OrderBookDepthLevel[];
  arbitrage?: ArbitrageStatus;
}

export interface ArbitrageStatus {
  arbitrage: boolean;
  bestBid: number;
  bestAsk: number;
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
