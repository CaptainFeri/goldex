export interface TalaabFinanceAmount {
  gold: {
    balance: string;
    unit: string;
  };
  rial: {
    balance: string;
    unit: string;
  };
}

export interface TalaabTransaction {
  sanad: number;
  date: string;
  time: string;
  title: string;
  type: string;
  description: string;
  affect: TalaabFinanceAmount;
  balance: TalaabFinanceAmount;
}

export interface TalaabTransactionsResponse {
  success: boolean;
  message: string;
  data: {
    data_type: string;
    list: TalaabTransaction[];
    accounting_status: boolean;
    has_more_page: boolean;
    current_page: number;
    date: string | null;
  };
}

export interface TalaabBalanceResponse {
  success: boolean;
  message: string;
  data: {
    rial: {
      balance: string;
      unit: string;
    };
    gold: {
      balance: string;
      unit: string;
    };
    others: any[];
    taraz: number;
    date: string | null;
  };
}

export interface TalaabTradeRequest {
  current_price: string;
  trade_type: string;
  description: string;
  weight: string;
  calculate_type: number;
  trade_id: number;
  price_unit: string;
}

export interface TalaabTradeResponseData {
  request_id: number;
  time_for_cancel: number;
  type_text: string;
  gold_type: number;
  gold_type_title: string;
  mazaneh: number;
  value: number;
  price: number;
  status: number;
}

export interface TalaabTradeResponse {
  success: boolean;
  message: string;
  data: TalaabTradeResponseData;
}

export interface TalaabLatestTrade {
  sanad: string;
  type: string;
  title: string;
  description: string;
  status: number;
  status_text: string;
  date: string;
  time: string;
  status_string: string;
  disapproval_reason: string | null;
  disapproval_reason_string: string | null;
}

export interface TalaabLatestTradesResponse {
  success: boolean;
  message: string;
  data: TalaabLatestTrade[];
}
