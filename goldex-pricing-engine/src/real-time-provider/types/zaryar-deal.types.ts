export interface ZaryarDealDateItem {
  Title: string;
  OrderDateTime: string;
  Date: string;
  GeoDate: string;
  InQueueCount: number;
  DoneCount: number;
  CancelCount: number;
  FinancialCount: number;
  InQueueCountStr: string;
  DoneCountStr: string;
  CancelCountStr: string;
  FinancialCountStr: string;
}

export interface ZaryarDealItem {
  Id: string;
  OrderId: string;
  OrderCode: string;
  FactorCode: number;
  ClientOrderId: string;
  OrderIndex: number;
  IsShopkeeperInDeal: boolean;
  FullName: string;
  OrderCustomerName: string | null;
  CustomerTitle: string | null;
  CustomerNickName: string | null;
  CustomerAccountId: string | null;
  ShopkeeperFullName: string;
  RealCustomerId: string | null;
  Customer: any | null;
  RealShopkeeperId: string;
  CustomerId: string;
  ItemName: string;
  ItemId: number;
  ItemUnit: string;
  ItemType: number;
  Count: number;
  ItemValue: string;
  ItemValueFullPart: string;
  ItemValuePart1: string;
  ItemValuePart2: string;
  ItemValuePart3: string;
  ItemValuePart4: string;
  Unit: string;
  GoldEquivalent: number;
  Mazane: number;
  TotalPrice: number;
  ShortMazane: number;
  ShortTotalPrice: number;
  MazaneStr: string;
  TotalPriceStr: string;
  DealType: number;
  OrderInsertType: number;
  OrderInsertTypeStr: string;
  CompleteOrderInsertTypeStr: string;
  DealTypeStr: string;
  OrderConfirmType: number;
  OrderConfirmTypeStr: string;
  OrderDate: string;
  OrderDateOnly: string;
  OrderDateStr: string;
  OrderDateOnlyStr: string;
  Carat: number;
  Count750: number;
  Count750Str: string;
  Weight750: number;
  ImportantDesc: string | null;
  Description: string;
  DeclineReason: number;
  DeclineDescription: string | null;
  CancelDescription: string | null;
  RemainTime: number;
  OrderRequestStatus: number;
  DealStatus: number;
  OrderStatusStr: string;
  PendingRequests: any[];
  HasPendingRequest: boolean;
  PendingRequestId: string | null;
  PendingRequestButton: string;
  HasPendingOrderDeal: boolean;
  OrderDealStatus: number;
  IsOrderDeal: boolean;
  IsAutoDeal: boolean;
  SubSetOrderIsDeleted: boolean;
  CanEdit: boolean;
  CanDelete: boolean;
  QuickEditOrder: boolean;
  QuickDeleteOrder: boolean;
  ShopUnit: number;
  FinancialOrderStatus: number;
  FinancialOrderStatusDesc: string | null;
  FinancialDesc: string;
  FinancialOrderStatusStr: string;
  FinancialItemId: string | null;
  FinancialWarningStatus: boolean;
  ModifiedUser: string;
  ModifiedUserFullName: string | null;
  ModifiedDate: string;
  ModifiedDateStr: string;
  ExpireDate: string | null;
  CancelDealByCustomerExpireDate: string | null;
  CancelDealByCustomerExpireDateStr: string;
  IsCanceledByCustomer: boolean;
  IsEdited: boolean;
  IsShopReviewed: boolean;
  IsCustomerReviewed: boolean;
  IsReviewed: boolean;
}

export interface ZaryarDealDatesResponse {
  IsSuccess: boolean;
  Message: string | null;
  Messages: string[] | null;
  Data: ZaryarDealDateItem[];
  Page: number;
  Code: number;
  OrderIndex: number | null;
}

export interface ZaryarDealListResponse {
  IsSuccess: boolean;
  Message: string | null;
  Messages: string[] | null;
  Data: ZaryarDealItem[];
  Page: number;
  Code: number;
  OrderIndex: number | null;
}

export interface ZaryarDealsListRequest {
  OrderIndex: number | null;
  PageNumber: number;
  ItemId: number;
  DealFilterStatus: number;
  FromDate: string;
  ToDate: string;
}

export interface ZaryarDealsDateRequest {
  PageNumber: number;
  ToDate: string;
}

export interface ZaryarOrderTime {
  FactorTime: number;
  Time: number;
  TimeStr: string;
  TimeType: number;
}

export interface ZaryarDealViewData {
  Id: number;
  ClientOrderId: string;
  ShopName: string;
  ShopkeeperId: string;
  Name: string;
  Unit: string;
  GoldEquivalent: number;
  Carat: number;
  Image: string | null;
  DiscountPrice: number;
  AllowRange: number;
  OrderHallAllowRange: number;
  ItemType: number;
  ItemGroupId: number;
  ItemGroupName: string | null;
  IBuy: boolean;
  ISell: boolean;
  IsShow: boolean;
  CanDeal: boolean;
  IsOnline: boolean;
  ShowMazaneInCloseShop: boolean;
  GoldInventory: number;
  Description: string;
  ExtraDescription: string | null;
  Discount: number;
  Price: number;
  MaxCount: number;
  MinCount: number;
  RemainCount: number | null;
  CanDoOrderDeal: boolean;
  CanDoDeal: boolean;
  WaitTime: number;
  CancelDealByCustomerWaitTime: number;
  RoundType: number;
  UpdatedTime: string | null;
  OrderIndex: number;
  Credit: string | null;
  CreditStr: string;
  OnlyShowForMazaneChannel: boolean;
  OrderDealAllowRange: number;
  OrderDealFromAllowRange: number;
  OrderDealToAllowRange: number;
  OrderTimes: ZaryarOrderTime[];
  MaxOrderDealExpireTime: number;
  ItemName: string;
  ItemUnit: string;
  ItemId: number;
}

export interface ZaryarSubmitDealRequest {
  Id: number;
  ClientOrderId: string;
  ShopName: string;
  ShopkeeperId: string;
  Name: string;
  Unit: string;
  GoldEquivalent: number;
  Carat: number;
  Image: string | null;
  DiscountPrice: number;
  AllowRange: number;
  OrderHallAllowRange: number;
  ItemType: number;
  ItemGroupId: number;
  ItemGroupName: string | null;
  IBuy: boolean;
  ISell: boolean;
  IsShow: boolean;
  CanDeal: boolean;
  IsOnline: boolean;
  ShowMazaneInCloseShop: boolean;
  GoldInventory: number;
  Description: string;
  ExtraDescription: string | null;
  Discount: number;
  Price: number;
  MaxCount: number;
  MinCount: number;
  RemainCount: number | null;
  CanDoOrderDeal: boolean;
  CanDoDeal: boolean;
  WaitTime: number;
  CancelDealByCustomerWaitTime: number;
  RoundType: number;
  UpdatedTime: string | null;
  OrderIndex: number;
  Credit: string | null;
  CreditStr: string;
  OnlyShowForMazaneChannel: boolean;
  OrderDealAllowRange: number;
  OrderDealFromAllowRange: number;
  OrderDealToAllowRange: number;
  OrderTimes: ZaryarOrderTime[];
  MaxOrderDealExpireTime: number;
  ItemName: string;
  ItemUnit: string;
  ItemId: number;
  Count: number;
  IsOrderDeal: boolean;
  IsRecovery: boolean;
  OrderId: string;
  DealType: number;
  Fee: number;
}

export interface ZaryarSubmitDealResponseData {
  Id: string;
  OrderStatus: number;
  OrderStatusStr: string;
  AutoDeal: boolean;
}

export interface ZaryarSubmitDealResponse {
  IsSuccess: boolean;
  Message: string;
  Messages: string[] | null;
  Data: ZaryarSubmitDealResponseData;
  Page: number;
  Code: number;
  OrderIndex: number | null;
}
