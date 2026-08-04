import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { mkdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { StructuredLogger } from '../../logger/structured-logger';
import { RedisService } from '../../redis/redis.service';
import { TelegramService } from '../telegram.service';
import { ChartImageService } from '../price/chart-image.service';
import type { WalletChartPoint } from '../price/chart-image.service';
import { MITHQALS_PER_KILO } from '../price/price.types';
import type {
  ArbitrageOpportunity,
  MarketOpportunity,
} from '../price/price.types';
import {
  formatWalletStatusReport,
  formatWalletTradeReport,
  kgToMesqal,
} from './wallet-report.formatter';
import type {
  SymbolWallet,
  TradeRecord,
  WalletQuery,
  WalletSnapshot,
} from './wallet.types';

const WALLET_INITIAL_IRR =
  Number(process.env.WALLET_INITIAL_IRR) || 100_000_000_000;
const WALLET_INITIAL_GOLD_KG = Number(process.env.WALLET_INITIAL_GOLD_KG) || 1;
const WALLET_TTL = Number(process.env.WALLET_TTL) || 604800;
const WALLET_STATUS_INTERVAL_SECONDS =
  Number(process.env.WALLET_STATUS_INTERVAL_SECONDS) || 600;
/** How often a daily report file is generated (default: once per day). */
const WALLET_DAILY_REPORT_INTERVAL_SECONDS =
  Number(process.env.WALLET_DAILY_REPORT_INTERVAL_SECONDS) || 86400;
/** Directory (relative to cwd or absolute) for generated report files. */
const WALLET_REPORTS_DIR = process.env.WALLET_REPORTS_DIR || 'reports';
/** Fraction of equity kept as cash — buys may never spend below this floor. */
const WALLET_CASH_RESERVE_RATIO =
  Number(process.env.WALLET_CASH_RESERVE_RATIO) || 0.2;
/** Smallest position (kg) the wallet will open when sizing down a signal. */
const WALLET_MIN_TRADE_KG = Number(process.env.WALLET_MIN_TRADE_KG) || 1;
/** Target share of total assets kept as cash (rest = gold inventory). */
const WALLET_TARGET_CASH_RATIO =
  Number(process.env.WALLET_TARGET_CASH_RATIO) || 0.5;
/** How often the wallet rebalances its assets back to the target split. */
const WALLET_REBALANCE_INTERVAL_SECONDS =
  Number(process.env.WALLET_REBALANCE_INTERVAL_SECONDS) || 300;
/** Deadband (fraction of equity): skip rebalancing when off-target by less. */
const WALLET_REBALANCE_TOLERANCE =
  Number(process.env.WALLET_REBALANCE_TOLERANCE) || 0.05;
/** Keep at most this many asset-history samples for the status chart. */
const WALLET_HISTORY_MAX_POINTS =
  Number(process.env.WALLET_HISTORY_MAX_POINTS) || 1440;

const STATE_KEY = 'wallet:state';
const TRADE_IDS_KEY = 'wallet:trade:ids';

interface PersistedState {
  irrBalance: number;
  totalRealizedProfit: number;
  symbols: SymbolWallet[];
}

@Injectable()
export class WalletService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new StructuredLogger(WalletService.name);

  private readonly symbols = new Map<string, SymbolWallet>();
  private readonly trades: TradeRecord[] = [];
  /** Latest known market price per symbol (Toman per mesqal). */
  private readonly lastPrices = new Map<string, number>();
  /** Asset mix history (mark-to-market) for the status chart. */
  private readonly history: WalletChartPoint[] = [];
  private idCounter = 0;
  private lotIdCounter = 0;

  private irrBalance = WALLET_INITIAL_IRR;
  private totalRealizedProfit = 0;

  private statusTimer: ReturnType<typeof setInterval> | null = null;
  private rebalanceTimer: ReturnType<typeof setInterval> | null = null;
  private dailyReportTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly redis: RedisService,
    private readonly telegram: TelegramService,
    private readonly chartImage: ChartImageService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.load();
    this.startStatusReporting();
    this.startRebalanceReporting();
    this.startDailyReporting();
  }

  onModuleDestroy(): void {
    if (this.statusTimer) {
      clearInterval(this.statusTimer);
      this.statusTimer = null;
    }
    if (this.rebalanceTimer) {
      clearInterval(this.rebalanceTimer);
      this.rebalanceTimer = null;
    }
    if (this.dailyReportTimer) {
      clearInterval(this.dailyReportTimer);
      this.dailyReportTimer = null;
    }
  }

  /**
   * Publishes the overall wallet status (balances + realized P/L) to the
   * report channel at the configured interval.
   */
  private startStatusReporting(): void {
    const intervalMs = WALLET_STATUS_INTERVAL_SECONDS * 1000;
    this.statusTimer = setInterval(() => {
      this.sendStatusReport();
    }, intervalMs);
    this.statusTimer.unref?.();
    this.logger.log(
      `Wallet status report scheduled every ${WALLET_STATUS_INTERVAL_SECONDS}s`,
    );
  }

  /**
   * Periodically brings the wallet back to the target cash/gold split.
   */
  private startRebalanceReporting(): void {
    const intervalMs = WALLET_REBALANCE_INTERVAL_SECONDS * 1000;
    this.rebalanceTimer = setInterval(() => {
      void this.rebalance();
    }, intervalMs);
    this.rebalanceTimer.unref?.();
    this.logger.log(
      `Wallet rebalance scheduled every ${WALLET_REBALANCE_INTERVAL_SECONDS}s ` +
        `(target cash ${Math.round(WALLET_TARGET_CASH_RATIO * 100)}%)`,
    );
  }

  private sendStatusReport(): void {
    const totalGoldKg = Array.from(this.symbols.values()).reduce(
      (sum, s) => sum + s.goldKg,
      0,
    );
    this.logger.logStructured('WALLET_STATUS_TICK', {
      irrBalance: this.irrBalance,
      totalGoldKg,
      symbols: this.symbols.size,
      executedTrades: this.trades.filter((t) => t.executed).length,
      totalRealizedProfit: this.totalRealizedProfit,
      posture: totalGoldKg <= 0 ? 'cash-only' : 'holding',
    });

    this.recordHistoryPoint();
    const text = formatWalletStatusReport(this.getSnapshot());
    void this.sendStatusReportWithChart(text);
  }

  /** Sends the status report with an assets chart, falling back to text. */
  private async sendStatusReportWithChart(text: string): Promise<void> {
    if (this.history.length >= 2) {
      try {
        const image = await this.chartImage.renderWalletChart(
          this.history,
          'Wallet Assets',
        );
        await this.telegram.sendWalletStatusReport(text, image);
        return;
      } catch (error) {
        this.logger.warn(
          `Wallet status chart failed, sending text-only: ${String(error)}`,
        );
      }
    }
    this.telegram
      .sendWalletReport(text)
      .catch((error) =>
        this.logger.error('Failed to send wallet status report', error),
      );
  }

  /** Records one mark-to-market asset sample (cash + gold value) for the chart. */
  private recordHistoryPoint(): void {
    const date = Math.floor(Date.now() / 1000);
    let goldValue = 0;
    for (const [symbol, wallet] of this.symbols) {
      const price = this.lastPrices.get(symbol);
      if (price) goldValue += wallet.goldKg * price * MITHQALS_PER_KILO;
    }
    this.history.push({ date, cash: this.irrBalance, goldValue });
    if (this.history.length > WALLET_HISTORY_MAX_POINTS) {
      this.history.shift();
    }
  }

  /** Symbol wallets are created on first sight of a deliveryType (normal only). */
  private ensureWallet(symbol: string): SymbolWallet {
    let wallet = this.symbols.get(symbol);
    if (!wallet) {
      wallet = {
        symbol,
        goldKg: WALLET_INITIAL_GOLD_KG,
        lots: [
          {
            id: ++this.lotIdCounter,
            pricePerKg: 0,
            qtyKg: WALLET_INITIAL_GOLD_KG,
          },
        ],
      };
      this.symbols.set(symbol, wallet);
      this.logger.log(`Created wallet for symbol "${symbol}"`);
    }
    return wallet;
  }

  @OnEvent('telegram.arbitrage')
  handleArbitrage(opportunity: ArbitrageOpportunity): void {
    if (opportunity.subType !== 'normal') return;
    this.lastPrices.set(
      opportunity.deliveryType,
      Math.round((opportunity.buy.price + opportunity.sell.price) / 2),
    );
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
    this.lastPrices.set(opportunity.deliveryType, opportunity.price);
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
   * خرید, both for the full signal quantity or nothing. The round trip is
   * funded entirely by the IRR pool — the buy leg provides the gold for the
   * sell leg, so no pre-existing inventory is required. This lets a fully
   * liquidated (cash-only) wallet keep hunting arbitrages with cash.
   */
  executeArbitrage(opportunity: ArbitrageOpportunity): TradeRecord[] {
    const symbol = opportunity.deliveryType;
    const wallet = this.ensureWallet(symbol);
    const signalQty = opportunity.quantity;
    const costPerKg = Math.round(kgToMesqal(1) * opportunity.buy.price);
    const qtyKg = this.affordableKg(signalQty, costPerKg);
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
      quantityKg: signalQty,
      ourAction: opportunity.sell.ourAction,
      executed: false,
    };

    let reason: string | undefined;
    if (qtyKg < WALLET_MIN_TRADE_KG) {
      reason = this.insufficientCashReason(costPerKg);
    }

    if (reason) {
      return [
        {
          ...base,
          id: this.nextId(),
          side: 'BUY',
          price: opportunity.buy.price,
          amount: Math.round(kgToMesqal(signalQty) * opportunity.buy.price),
          profit: 0,
          reason,
        },
        {
          ...base,
          id: this.nextId(),
          side: 'SELL',
          price: opportunity.sell.price,
          amount: Math.round(kgToMesqal(signalQty) * opportunity.sell.price),
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
      quantityKg: qtyKg,
      amount: cost,
      profit: 0,
      executed: true,
    };
    const sellTrade: TradeRecord = {
      ...base,
      id: this.nextId(),
      side: 'SELL',
      price: opportunity.sell.price,
      quantityKg: qtyKg,
      amount: proceeds,
      profit,
      executed: true,
    };

    this.recordTrade(buyTrade);
    this.recordTrade(sellTrade);
    void this.persistState();

    this.logger.logStructured(
      wallet.goldKg <= 0
        ? 'WALLET_ARBITRAGE_CASH_FUNDED'
        : 'WALLET_ARBITRAGE_EXECUTED',
      {
        symbol,
        quantityKg: qtyKg,
        buyAt: opportunity.buy.price,
        sellAt: opportunity.sell.price,
        cost,
        proceeds,
        profit,
        goldKg: wallet.goldKg,
      },
    );

    return [buyTrade, sellTrade];
  }

  /**
   * Market maker alert = a single leg. WE_BUY opens a position when the IRR
   * pool can afford it; WE_SELL closes gold FIFO (oldest lots first) when
   * there is enough inventory and the price beats the cost of the oldest lots
   * (never realize a loss). Free seed gold is charged at the sale price, so
   * selling it books no profit — realized P/L only reflects real price moves.
   */
  executeMarketMaker(opportunity: MarketOpportunity): TradeRecord | null {
    const symbol = opportunity.deliveryType;
    const wallet = this.ensureWallet(symbol);
    const signalQty = opportunity.quantity;
    const date = Math.floor(Date.now() / 1000);
    const proceedsPerKg = opportunity.price * MITHQALS_PER_KILO;

    if (opportunity.ourAction === 'WE_BUY') {
      const costPerKg = Math.round(kgToMesqal(1) * opportunity.price);
      const qtyKg = this.affordableKg(signalQty, costPerKg);
      const cost = Math.round(kgToMesqal(qtyKg) * opportunity.price);
      let reason: string | undefined;
      if (qtyKg < WALLET_MIN_TRADE_KG) {
        reason = this.insufficientCashReason(costPerKg);
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
          quantityKg: signalQty,
          amount: Math.round(kgToMesqal(signalQty) * opportunity.price),
          profit: 0,
          executed: false,
          reason,
        };
      }

      const oldGoldKg = wallet.goldKg;
      const newGoldKg = oldGoldKg + qtyKg;
      wallet.lots.push({
        id: ++this.lotIdCounter,
        pricePerKg: Math.round(proceedsPerKg),
        qtyKg,
      });
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
    const qtyKg = signalQty;
    const proceeds = Math.round(kgToMesqal(qtyKg) * opportunity.price);
    const costBasisKg = this.costBasisKg(wallet, qtyKg);

    let reason: string | undefined;
    if (qtyKg > wallet.goldKg) {
      reason = `موجودی طلا کافی نیست (${qtyKg} کیلوگرم لازم است)`;
    } else if (proceedsPerKg <= costBasisKg) {
      reason = 'قیمت کمتر از بهای تمام‌شده است (فروش ضررده مجاز نیست)';
    }

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

    const costBasis = this.consumeLots(wallet, qtyKg, proceedsPerKg);
    const profit = Math.round(proceedsPerKg * qtyKg) - costBasis;
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

  /**
   * Total assets: cash plus the cost basis of every held gold lot. Cost basis
   * is used (not mark-to-market) because the wallet only knows execution
   * prices — a conservative floor for the equity behind the cash reserve.
   */
  private equity(): number {
    let goldCostBasis = 0;
    for (const w of this.symbols.values()) {
      for (const lot of w.lots) {
        goldCostBasis += lot.pricePerKg * lot.qtyKg;
      }
    }
    return this.irrBalance + goldCostBasis;
  }

  /** Cash kept aside (reserveRatio × equity) and never spent on buys. */
  private cashReserve(): number {
    return Math.round(this.equity() * WALLET_CASH_RESERVE_RATIO);
  }

  /** Cash available for buys above the reserve. */
  private buyingPower(): number {
    return Math.max(0, this.irrBalance - this.cashReserve());
  }

  /**
   * Position sizing: the largest whole kilogram quantity the wallet can open
   * for the signal without touching the cash reserve. Returns 0 when even the
   * minimum trade does not fit.
   */
  private affordableKg(signalKg: number, costPerKg: number): number {
    if (costPerKg <= 0) return signalKg;
    const affordable = Math.floor(this.buyingPower() / costPerKg);
    return Math.max(0, Math.min(signalKg, affordable));
  }

  private insufficientCashReason(costPerKg: number): string {
    const needed = Math.round(costPerKg * WALLET_MIN_TRADE_KG);
    return `موجودی ریال کافی نیست (ذخیره نقدی حفظ میشود؛ حداقل ${WALLET_MIN_TRADE_KG} کیلوگرم ≈ ${needed.toLocaleString('en-US')} تومان لازم است)`;
  }

  /**
   * FIFO cost basis per kg of the oldest lots that would satisfy qtyKg.
   * Returns Infinity when there is not enough inventory.
   */
  private costBasisKg(wallet: SymbolWallet, qtyKg: number): number {
    let remaining = qtyKg;
    let basis = 0;
    for (const lot of wallet.lots) {
      if (remaining <= 0) break;
      const take = Math.min(lot.qtyKg, remaining);
      basis += lot.pricePerKg * take;
      remaining -= take;
    }
    if (remaining > 0) return Infinity;
    return basis / qtyKg;
  }

  /**
   * Consumes qtyKg from the oldest lots (FIFO) and returns the cost basis in
   * Toman. Free seed lots (pricePerKg = 0) are charged at the sale price of
   * the material, so selling seed gold never books a profit or a loss — only
   * gold actually bought at a real price contributes to realized P/L.
   */
  private consumeLots(
    wallet: SymbolWallet,
    qtyKg: number,
    sellPricePerKg: number,
  ): number {
    let remaining = qtyKg;
    let costBasis = 0;
    while (remaining > 0 && wallet.lots.length > 0) {
      const lot = wallet.lots[0];
      const take = Math.min(lot.qtyKg, remaining);
      const lotPricePerKg =
        lot.pricePerKg > 0 ? lot.pricePerKg : sellPricePerKg;
      costBasis += lotPricePerKg * take;
      lot.qtyKg -= take;
      remaining -= take;
      if (lot.qtyKg <= 0) {
        wallet.lots.shift();
      }
    }
    wallet.goldKg = wallet.lots.reduce((sum, lot) => sum + lot.qtyKg, 0);
    return Math.round(costBasis);
  }

  /**
   * Mark-to-market equity: cash plus gold valued at the latest observed price
   * per symbol (Toman). Symbols without a price yet contribute zero.
   */
  private marketEquity(): number {
    let goldValue = 0;
    for (const [symbol, wallet] of this.symbols) {
      const price = this.lastPrices.get(symbol);
      if (price) goldValue += wallet.goldKg * price * MITHQALS_PER_KILO;
    }
    return this.irrBalance + goldValue;
  }

  /**
   * Gold value (Toman) of one symbol at the latest known price; 0 when the
   * symbol has no price yet.
   */
  private symbolMarketValueKg(symbol: string): number {
    const wallet = this.symbols.get(symbol);
    const price = this.lastPrices.get(symbol);
    if (!wallet || !price) return 0;
    return wallet.goldKg * price * MITHQALS_PER_KILO;
  }

  /**
   * FIFO quantity that can be sold without realizing a loss at the given
   * price. Seed lots (pricePerKg = 0) are always saleable (they are charged
   * at the sale price, so they book no loss). Paid lots are saleable only
   * while their cost is strictly below the sale price; the first loss-making
   * lot stops the run to keep FIFO intact.
   */
  private saleableKg(wallet: SymbolWallet, pricePerMesqal: number): number {
    const sellPricePerKg = pricePerMesqal * MITHQALS_PER_KILO;
    let kg = 0;
    for (const lot of wallet.lots) {
      if (lot.pricePerKg > 0 && lot.pricePerKg >= sellPricePerKg) break;
      kg += lot.qtyKg;
    }
    return kg;
  }

  /**
   * Brings the wallet back to the target cash/gold split using the latest
   * observed market prices. Never rebalances into the cash reserve, never
   * realizes a loss, and skips when the imbalance is within tolerance or no
   * priced symbol is known yet. Returns the executed rebalance trades.
   */
  private rebalanceTrades(): TradeRecord[] {
    const markEquity = this.marketEquity();
    if (markEquity <= 0) return [];

    const targetCash = Math.max(
      markEquity * WALLET_TARGET_CASH_RATIO,
      markEquity * WALLET_CASH_RESERVE_RATIO,
    );
    const gap = this.irrBalance - targetCash;

    if (Math.abs(gap) <= markEquity * WALLET_REBALANCE_TOLERANCE) {
      this.logger.logStructured('WALLET_REBALANCE_SKIP', {
        gap: Math.round(gap),
        targetCash: Math.round(targetCash),
        markEquity: Math.round(markEquity),
        reason: 'within tolerance',
      });
      return [];
    }

    const pricedSymbols = Array.from(this.symbols.keys()).filter((s) =>
      this.lastPrices.has(s),
    );
    if (pricedSymbols.length === 0) {
      this.logger.logStructured('WALLET_REBALANCE_SKIP', {
        gap: Math.round(gap),
        reason: 'no priced symbols yet',
      });
      return [];
    }

    const date = Math.floor(Date.now() / 1000);
    const trades: TradeRecord[] = [];

    if (gap > 0) {
      // Cash-heavy: buy gold, distributed proportionally to current holdings.
      const totalGoldValue = pricedSymbols.reduce(
        (sum, s) => sum + this.symbolMarketValueKg(s),
        0,
      );
      for (const symbol of pricedSymbols) {
        const price = this.lastPrices.get(symbol)!;
        const share =
          totalGoldValue > 0
            ? gap * (this.symbolMarketValueKg(symbol) / totalGoldValue)
            : gap / pricedSymbols.length;
        const costPerKg = Math.round(kgToMesqal(1) * price);
        const buyKg = Math.floor(share / costPerKg);
        if (buyKg < WALLET_MIN_TRADE_KG) continue;

        const cost = Math.round(kgToMesqal(buyKg) * price);
        const wallet = this.ensureWallet(symbol);
        wallet.lots.push({
          id: ++this.lotIdCounter,
          pricePerKg: Math.round(price * MITHQALS_PER_KILO),
          qtyKg: buyKg,
        });
        wallet.goldKg += buyKg;
        this.irrBalance -= cost;

        const trade: TradeRecord = {
          id: this.nextId(),
          date,
          source: 'REBALANCE',
          symbol,
          subType: 'normal',
          side: 'BUY',
          price,
          quantityKg: buyKg,
          amount: cost,
          profit: 0,
          executed: true,
        };
        this.recordTrade(trade);
        trades.push(trade);
        this.logger.logStructured('WALLET_REBALANCE_BUY', {
          symbol,
          quantityKg: buyKg,
          price,
          cost,
        });
      }
    } else {
      // Gold-heavy: sell gold (FIFO, profitable lots only) to raise cash.
      let shortfall = -gap;
      for (const symbol of pricedSymbols) {
        if (shortfall <= 0) break;
        const wallet = this.symbols.get(symbol);
        if (!wallet || wallet.goldKg <= 0) continue;

        const price = this.lastPrices.get(symbol)!;
        const costPerKg = Math.round(kgToMesqal(1) * price);
        const wantKg = Math.floor(shortfall / costPerKg);
        const sellKg = Math.min(wantKg, this.saleableKg(wallet, price));
        if (sellKg < WALLET_MIN_TRADE_KG) continue;

        const proceedsPerKg = price * MITHQALS_PER_KILO;
        const costBasis = this.consumeLots(wallet, sellKg, proceedsPerKg);
        const proceeds = Math.round(kgToMesqal(sellKg) * price);
        const profit = proceeds - costBasis;
        this.irrBalance += proceeds;
        this.totalRealizedProfit += profit;
        shortfall -= proceeds;

        const trade: TradeRecord = {
          id: this.nextId(),
          date,
          source: 'REBALANCE',
          symbol,
          subType: 'normal',
          side: 'SELL',
          price,
          quantityKg: sellKg,
          amount: proceeds,
          profit,
          executed: true,
        };
        this.recordTrade(trade);
        trades.push(trade);
        this.logger.logStructured('WALLET_REBALANCE_SELL', {
          symbol,
          quantityKg: sellKg,
          price,
          proceeds,
          profit,
        });
      }
    }

    return trades;
  }

  private async rebalance(): Promise<void> {
    try {
      const trades = this.rebalanceTrades();
      if (trades.length > 0) {
        await this.persistState();
        this.report(trades);
      }
    } catch (error) {
      this.logger.error('Wallet rebalance failed', error);
    }
  }

  /**
   * Generates a JSON file with all wallet changes (executed trades, balances
   * and symbol inventory) since the previous run — once per day.
   */
  private startDailyReporting(): void {
    const intervalMs = WALLET_DAILY_REPORT_INTERVAL_SECONDS * 1000;
    this.dailyReportTimer = setInterval(() => {
      void this.generateDailyReport();
    }, intervalMs);
    this.dailyReportTimer.unref?.();
    this.logger.log(
      `Wallet daily report file scheduled every ${WALLET_DAILY_REPORT_INTERVAL_SECONDS}s`,
    );
  }

  /** Writes the day's changes to reports/wallet-YYYY-MM-DD.json. */
  async generateDailyReport(): Promise<void> {
    try {
      const to = Math.floor(Date.now() / 1000);
      const from = to - WALLET_DAILY_REPORT_INTERVAL_SECONDS;
      const trades = this.getTrades({ executed: true, from, to });
      const snapshot = this.getSnapshot();
      const report = {
        generatedAt: to,
        window: { from, to },
        irrBalance: snapshot.irrBalance,
        totalRealizedProfit: snapshot.totalRealizedProfit,
        equity: snapshot.equity,
        cashReserve: snapshot.cashReserve,
        buyingPower: snapshot.buyingPower,
        symbols: snapshot.symbols,
        trades,
      };

      const dir = join(process.cwd(), WALLET_REPORTS_DIR);
      mkdirSync(dir, { recursive: true });
      const date = new Date(to * 1000).toISOString().slice(0, 10);
      const file = join(dir, `wallet-${date}.json`);
      await writeFile(file, JSON.stringify(report, null, 2));

      this.logger.logStructured('WALLET_DAILY_REPORT', {
        file,
        trades: trades.length,
        from,
        to,
      });
    } catch (error) {
      this.logger.error('Failed to generate daily wallet report', error);
    }
  }

  getSnapshot(): WalletSnapshot {
    return {
      symbols: Array.from(this.symbols.values()).map((s) => ({
        ...s,
        lots: s.lots.map((lot) => ({ ...lot })),
      })),
      irrBalance: this.irrBalance,
      totalRealizedProfit: this.totalRealizedProfit,
      equity: this.equity(),
      cashReserve: this.cashReserve(),
      buyingPower: this.buyingPower(),
      trades: [...this.trades],
    };
  }

  getSymbols(): SymbolWallet[] {
    return Array.from(this.symbols.values()).map((s) => ({
      ...s,
      lots: s.lots.map((lot) => ({ ...lot })),
    }));
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

  /**
   * Migrates a persisted wallet that predates lot accounting (avgCostKg-based)
   * into a single legacy lot carrying the old average cost.
   */
  private migrateSymbolWallet(wallet: SymbolWallet): void {
    if (!Array.isArray(wallet.lots) || wallet.lots.length === 0) {
      if (wallet.goldKg <= 0) {
        wallet.lots = [];
        delete (wallet as SymbolWallet & { avgCostKg?: number }).avgCostKg;
        return;
      }
      const legacy = wallet as SymbolWallet & { avgCostKg?: number };
      wallet.lots = [
        {
          id: ++this.lotIdCounter,
          pricePerKg: Math.max(0, Math.round(legacy.avgCostKg ?? 0)),
          qtyKg: wallet.goldKg,
        },
      ];
      delete legacy.avgCostKg;
    }
    for (const lot of wallet.lots) {
      if (lot.id > this.lotIdCounter) {
        this.lotIdCounter = lot.id;
      }
    }
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
          this.migrateSymbolWallet(w);
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
