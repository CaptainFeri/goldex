export interface PusherConnectionEvent {
  event: 'pusher:connection_established';
  data: string;
}

export interface PusherSubscribeEvent {
  event: 'pusher:subscribe';
  data: { channel: string; auth: string };
}

export interface PusherPingEvent {
  event: 'pusher:ping';
  data: Record<string, never>;
}

export interface TalaabPricingCurrency {
  id: number;
  buy_price: string;
  sell_price: string;
  buy_status: number;
  sell_status: number;
}

export interface TalaabPricingVendor {
  currencies: TalaabPricingCurrency[];
}

export interface TalaabPricingUpdate {
  pricing: TalaabPricingVendor[];
}

export interface TalaabWebSocketMessage {
  event: string;
  data?: string;
}

export interface TalaabFeaturesData {
  molten?: Array<{ id: number; title: string }>;
  coin?: Array<{ id: number; title: string }>;
  silver?: Array<{ id: number; title: string }>;
}
