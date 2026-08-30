export interface NegotiateResponse {
  ConnectionToken: string;
  ConnectionId: string;
}

export interface SignalRMessage {
  C?: string;
  M?: Array<{ H: string; M: string; A: any[] }>;
}

export interface MazaneItem {
  ItemId: number;
  FeeBuy: number;
  FeeSell: number;
  FeeBuyStr: string;
  FeeSellStr: string;
  BuyCanDeal: boolean;
  SellCanDeal: boolean;
  BuyRange: number;
  SellRange: number;
  MaxBuyCount: number;
  MaxSellCount: number;
  UpdatedTimeStr: string;
  IBuy?: boolean;
  ISell?: boolean;
  IsShow?: boolean;
}

export interface ZaryarDealViewResponse {
  Id: number;
  Name: string;
  Price: number;
  DiscountPrice: number;
  MinCount: number;
  MaxCount: number;
  WaitTime: number;
  CanDoDeal: boolean;
}

export interface ShopkeeperItemsResponse {
  Data?: Array<{
    GroupName: string;
    GroupId?: number;
    Items: Array<{
      Id: number;
      Name: string;
      FeeBuy: number;
      FeeSell: number;
      FeeBuyStr: string;
      FeeSellStr: string;
      BuyCanDeal: boolean;
      SellCanDeal: boolean;
      BuyRange: number;
      SellRange: number;
      MaxBuyCount: number;
      MaxSellCount: number;
      UpdatedTimeStr: string;
      IBuy?: boolean;
      ISell?: boolean;
      IsShow?: boolean;
    }>;
  }>;
}
