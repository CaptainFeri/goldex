export interface ArbitrageLeg {
  providerKey: string;
  itemId: number;
  action: 'buy' | 'sell';
  price: number;
  priceStr: string;
  timestamp: string;
}

export interface ArbitrageSignal {
  id: string;
  key: string;
  itemId: number;
  itemName: string;
  groupId: number;
  groupName: string;
  unit: string;
  buyLeg: ArbitrageLeg;
  sellLeg: ArbitrageLeg;
  legs: ArbitrageLeg[];
  profitToman: number;
  profitPercent: number;
  profitGold: number;
  goldPriceRef: number;
  deadline: string;
  detectedAt: string;
}

export interface ArbitrageScanResult {
  signals: ArbitrageSignal[];
  scannedAt: string;
  trigger: 'startup' | 'realtime' | 'interval' | 'manual';
  totalProviders: number;
  totalItems: number;
  opportunityCount: number;
  bestProfitToman: number;
}
