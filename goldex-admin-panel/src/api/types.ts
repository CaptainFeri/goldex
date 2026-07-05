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

// ---- Symbol / Pair / Mapping ----
export interface SymbolItem {
  id: string;
  name?: string;
  slug?: string;
  type?: string;
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
