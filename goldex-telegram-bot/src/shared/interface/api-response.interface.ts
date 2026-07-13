export interface BackendApiResponse<T = any> {
  data: T;
}

export interface AuthTokensResponse {
  access_token: string;
  refresh_token: string;
  is2FAEnabled: boolean;
  userId: string;
  requiresRegistration?: boolean;
  temporaryToken?: string;
  loginHistoryList?: any;
  totalItems?: number;
  currentDevice?: any;
}

export interface SendOtpResponse {
  message: string;
  phone: string;
}

export interface WalletSymbol {
  id: string;
  name: string;
  slug: string;
  picPath: string;
  type: string;
}

export interface WalletData {
  id: string;
  status: string;
  symbol: WalletSymbol | null;
  freeBalance: number;
  lockedBalance: number;
  totalBalance: number;
  availableBalance: number;
  updatedAt: Date;
}

export interface ProfileData {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  address?: string;
  avatarImgPath?: string;
  country?: any;
  gender?: number;
  postalCode?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PricePairData {
  id: string;
  baseSymbol?: { id: string; name: string; slug: string };
  quoteSymbol?: { id: string; name: string; slug: string };
  price: number;
  bestBuyPrice: number;
  bestSellPrice: number;
}

export interface QuoteRequestResult {
  request: {
    id: string;
    side: string;
    quantity: number;
    price: number | null;
    status: string;
  };
  matchAlert: boolean;
  matchedBuyOrderId?: string | null;
}

export interface QuoteRequestItem {
  id: string;
  side: string;
  quantity: number;
  price: number | null;
  notes?: string;
  status: string;
  createAt: string;
  totalPrice?: number;
  pricePair: {
    baseSymbol?: { id: string; name: string; slug: string };
    quoteSymbol?: { id: string; name: string; slug: string };
  };
}
