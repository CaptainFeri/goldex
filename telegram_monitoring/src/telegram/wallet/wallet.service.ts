import { Injectable, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { StructuredLogger } from '../../logger/structured-logger';
import { RedisService } from '../../redis/redis.service';
import { TelegramService } from '../telegram.service';
import { MITHQALS_PER_KILO } from '../price/price.types';
import type {
  ArbitrageOpportunity,
  MarketOpportunity,
} from '../price/price.types';
import { formatWalletTradeReport, kgToMesqal } from './wallet-report.formatter';
import type {
  SymbolWallet,
  TradeRecord,
  WalletQuery,
  WalletSnapshot,
} from './wallet.types';

const WALLET_INITIAL_IRR =
  Number(process.env.WALLET_INITIAL_IRR) || 20_000_000_000;
const WALLET_INITIAL_GOLD_KG = Number(process.env.WALLET_INITIAL_GOLD_KG) || 1;
const WALLET_TTL = Number(process.env.WALLET_TTL) || 604800;

const STATE_KEY = 'wallet:state';
const TRADE_IDS_KEY = 'wallet:trade:ids';

interface PersistedState {
  irrBalance: number;
  totalRealizedProfit: number;
  symbols: SymbolWallet[];
}

@Injectable()
export class WalletService implements OnModuleInit {
  private readonly logger = new StructuredLogger(WalletService.name);

  private readonly symbols = new Map<string, SymbolWallet>();
  private readonly trades: TradeRecord[] = [];
  private idCounter = 0;

  private irrBalance = WALLET_INITIAL_IRR;
  private totalRealizedProfit = 0;

  constructor(
    private readonly redis: RedisService,
    private readonly telegram: TelegramService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.load();
  }

  /** Symbol wallets are created on first sight of a deliveryType (normal only). */
  private ensureWallet(symbol: string): SymbolWallet {
    let wallet = this.symbols.get(symbol);
    if (!wallet) {
      wallet = {
        symbol,
        goldKg: WALLET_INITIAL_GOLD_KG,
        avgCostKg: 0,
      };
      this.symbols.set(symbol, wallet);
      this.logger.log(`Created wallet for symbol "${symbol}"`);
    }
    return wallet;
  }

  @OnEvent('telegram.arbitrage')
  handleArbitrage(opportunity: ArbitrageOpportunity): void {
    if (opportunity.subType !== 'normal') return;
    const trades = this.executeArbitrage(opportunity);
    if (trades.some((t) => t.executed)) {
      this.report(trades);
    } else {
      this.logger.logStructured('WALLET_ARBITRAGE_SKIPPED', {
        symbol: opportunity.deliveryType,
        reason: trades[0]?.reason,
      });
    }
  }

  @OnEvent('market.opportunity')
  handleMarketOpportunity(opportunity: MarketOpportunity): void {
    if (opportunity.subType !== 'normal') return;
    const trade = this.executeMarketMaker(opportunity);
    if (trade?.executed) {
      this.report([trade]);
    } else if (trade) {
      this.logger.logStructured('WALLET_MM_SKIPPED', {
        symbol: trade.symbol,
        side: trade.side,
        reason: trade.reason,
      });
    }
  }

  /**
   * Arbitrage = a round trip: buy at the lowest فروش and sell at the highest
   * خرید, both for the full signal quantity or nothing. Net gold is unchanged;
   * the IRR pool grows by the spread profit.
   */
  executeArbitrage(opportunity: ArbitrageOpportunity): TradeRecord[] {
    const symbol = opportunity.deliveryType;
    const wallet = this.ensureWallet(symbol);
    const qtyKg = opportunity.quantity;
    const cost = Math.round(kgToMesqal(qtyKg) * opportunity.buy.price);
    const proceeds = Math.round(kgToMesqal(qtyKg) * opportunity.sell.price);
    const date = Math.floor(Date.now() / 1000);
    const base: Omit<
      TradeRecord,
      'id' | 'side' | 'price' | 'amount' | 'profit'
    > = {
      date,
      source: 'ARBITRAGE',
      symbol,
      subType: 'normal',
      quantityKg: qtyKg,
      ourAction: opportunity.sell.ourAction,
      executed: false,
    };

    let reason: string | undefined;
    if (cost > this.irrBalance) {
      reason = `موجودی ریال کافی نیست (${cost.toLocaleString('en-US')} تومان لازم است)`;
    } else if (qtyKg > wallet.goldKg) {
      reason = `موجودی طلا کافی نیست (${qtyKg} کیلوگرم لازم است)`;
    }

    if (reason) {
      return [
        {
          ...base,
          id: this.nextId(),
          side: 'BUY',
          price: opportunity.buy.price,
          amount: cost,
          profit: 0,
          reason,
        },
        {
          ...base,
          id: this.nextId(),
          side: 'SELL',
          price: opportunity.sell.price,
          amount: proceeds,
          profit: 0,
          reason,
        },
      ];
    }

    const profit = proceeds - cost;
    this.irrBalance += profit;
    this.totalRealizedProfit += profit;

    const buyTrade: TradeRecord = {
      ...base,
      id: this.nextId(),
      side: 'BUY',
      price: opportunity.buy.price,
      amount: cost,
      profit: 0,
      executed: true,
    };
    const sellTrade: TradeRecord = {
      ...base,
      id: this.nextId(),
      side: 'SELL',
      price: opportunity.sell.price,
      amount: proceeds,
      profit,
      executed: true,
    };

    this.recordTrade(buyTrade);
    this.recordTrade(sellTrade);
    void this.persistState();

    this.logger.logStructured('WALLET_ARBITRAGE_EXECUTED', {
      symbol,
      quantityKg: qtyKg,
      buyAt: opportunity.buy.price,
      sellAt: opportunity.sell.price,
      cost,
      proceeds,
      profit,
    });

    return [buyTrade, sellTrade];
  }

  /**
   * Market maker alert = a single leg. WE_BUY opens a position when the IRR
   * pool can afford it; WE_SELL closes gold when there is enough inventory and
   * the price beats the average cost (never realize a loss).
   */
  executeMarketMaker(opportunity: MarketOpportunity): TradeRecord | null {
    const symbol = opportunity.deliveryType;
    const wallet = this.ensureWallet(symbol);
    const qtyKg = opportunity.quantity;
    const date = Math.floor(Date.now() / 1000);
    const proceedsPerKg = opportunity.price * MITHQALS_PER_KILO;

    if (opportunity.ourAction === 'WE_BUY') {
      const cost = Math.round(kgToMesqal(qtyKg) * opportunity.price);
      let reason: string | undefined;
      if (cost > this.irrBalance) {
        reason = `موجودی ریال کافی نیست (${cost.toLocaleString('en-US')} تومان لازم است)`;
      }

      if (reason) {
        return {
          id: this.nextId(),
          date,
          source: 'MARKET_MAKER',
          symbol,
          subType: 'normal',
          side: 'BUY',
          ourAction: 'WE_BUY',
          price: opportunity.price,
          quantityKg: qtyKg,
          amount: cost,
          profit: 0,
          executed: false,
          reason,
        };
      }

      const oldGoldKg = wallet.goldKg;
      const newGoldKg = oldGoldKg + qtyKg;
      wallet.avgCostKg =
        wallet.avgCostKg > 0
          ? Math.round(
              (wallet.avgCostKg * oldGoldKg + proceedsPerKg * qtyKg) /
                newGoldKg,
            )
          : Math.round(proceedsPerKg);
      wallet.goldKg = newGoldKg;
      this.irrBalance -= cost;

      const trade: TradeRecord = {
        id: this.nextId(),
        date,
        source: 'MARKET_MAKER',
        symbol,
        subType: 'normal',
        side: 'BUY',
        ourAction: 'WE_BUY',
        price: opportunity.price,
        quantityKg: qtyKg,
        amount: cost,
        profit: 0,
        executed: true,
      };
      this.recordTrade(trade);
      void this.persistState();

      this.logger.logStructured('WALLET_MM_BUY_EXECUTED', {
        symbol,
        quantityKg: qtyKg,
        price: opportunity.price,
        cost,
      });
      return trade;
    }

    // WE_SELL
    let reason: string | undefined;
    if (qtyKg > wallet.goldKg) {
      reason = `موجودی طلا کافی نیست (${qtyKg} کیلوگرم لازم است)`;
    } else if (wallet.avgCostKg > 0 && proceedsPerKg <= wallet.avgCostKg) {
      reason = 'قیمت کمتر از میانگین بهای تمام‌شده است (فروش ضررده مجاز نیست)';
    }

    const proceeds = Math.round(kgToMesqal(qtyKg) * opportunity.price);

    if (reason) {
      return {
        id: this.nextId(),
        date,
        source: 'MARKET_MAKER',
        symbol,
        subType: 'normal',
        side: 'SELL',
        ourAction: 'WE_SELL',
        price: opportunity.price,
        quantityKg: qtyKg,
        amount: proceeds,
        profit: 0,
        executed: false,
        reason,
      };
    }

    const profit = Math.round((proceedsPerKg - wallet.avgCostKg) * qtyKg);
    wallet.goldKg -= qtyKg;
    this.irrBalance += proceeds;
    this.totalRealizedProfit += profit;

    const trade: TradeRecord = {
      id: this.nextId(),
      date,
      source: 'MARKET_MAKER',
      symbol,
      subType: 'normal',
      side: 'SELL',
      ourAction: 'WE_SELL',
      price: opportunity.price,
      quantityKg: qtyKg,
      amount: proceeds,
      profit,
      executed: true,
    };
    this.recordTrade(trade);
    void this.persistState();

    this.logger.logStructured('WALLET_MM_SELL_EXECUTED', {
      symbol,
      quantityKg: qtyKg,
      price: opportunity.price,
      proceeds,
      profit,
    });
    return trade;
  }

  getSnapshot(): WalletSnapshot {
    return {
      symbols: Array.from(this.symbols.values()).map((s) => ({ ...s })),
      irrBalance: this.irrBalance,
      totalRealizedProfit: this.totalRealizedProfit,
      trades: [...this.trades],
    };
  }

  getSymbols(): SymbolWallet[] {
    return Array.from(this.symbols.values()).map((s) => ({ ...s }));
  }

  getTrades(query: WalletQuery = {}): TradeRecord[] {
    return this.trades.filter(
      (t) =>
        (!query.source || t.source === query.source) &&
        (!query.symbol || t.symbol === query.symbol) &&
        (query.executed === undefined || t.executed === query.executed) &&
        (query.from === undefined || t.date >= query.from) &&
        (query.to === undefined || t.date <= query.to),
    );
  }

  private report(trades: TradeRecord[]): void {
    const text = formatWalletTradeReport(trades, this.getSnapshot());
    this.telegram
      .sendWalletReport(text)
      .catch((error) =>
        this.logger.error('Failed to send wallet report', error),
      );
  }

  private recordTrade(trade: TradeRecord): void {
    this.trades.push(trade);
    this.persistTrade(trade).catch((error) =>
      this.logger.error('Failed to persist wallet trade', error),
    );
  }

  private nextId(): number {
    return ++this.idCounter;
  }

  private async persistState(): Promise<void> {
    try {
      const client = this.redis.getClient();
      const state: PersistedState = {
        irrBalance: this.irrBalance,
        totalRealizedProfit: this.totalRealizedProfit,
        symbols: Array.from(this.symbols.values()),
      };
      await client.set(STATE_KEY, JSON.stringify(state));
    } catch (error) {
      this.logger.error('Failed to persist wallet state', error);
    }
  }

  private async persistTrade(trade: TradeRecord): Promise<void> {
    const client = this.redis.getClient();
    await Promise.all([
      client.setex(
        `wallet:trade:${trade.id}`,
        WALLET_TTL,
        JSON.stringify(trade),
      ),
      client.zadd(TRADE_IDS_KEY, trade.date, String(trade.id)),
    ]);
  }

  private async load(): Promise<void> {
    try {
      const client = this.redis.getClient();
      const rawState = await client.get(STATE_KEY);
      if (rawState) {
        const state = JSON.parse(rawState) as PersistedState;
        this.irrBalance = state.irrBalance;
        this.totalRealizedProfit = state.totalRealizedProfit;
        for (const w of state.symbols ?? []) {
          this.symbols.set(w.symbol, w);
        }
      }

      const ids = await client.zrange(TRADE_IDS_KEY, 0, -1);
      if (ids.length === 0) return;

      this.idCounter = Math.max(this.idCounter, ...ids.map(Number));
      const raw = await client.mget(...ids.map((id) => `wallet:trade:${id}`));
      for (const json of raw) {
        if (!json) continue;
        try {
          this.trades.push(JSON.parse(json) as TradeRecord);
        } catch {
          // skip corrupt entry
        }
      }
      this.logger.log(
        `Loaded ${this.trades.length} wallet trades and ${this.symbols.size} symbol wallets from Redis`,
      );
    } catch (error) {
      this.logger.error('Failed to load wallet state from Redis', error);
    }
  }
}
