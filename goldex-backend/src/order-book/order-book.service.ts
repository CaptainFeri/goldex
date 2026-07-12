import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { OrderBook, Side } from "nodejs-order-book";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { OrderEntity } from "../order/order.entity";
import { OrderStatusEnum } from "../order/enum/order.status.enum";
import { OrderTypeEnum } from "../order/enum/order.type.enum";
import { OrderSource, DepthLevel, MatchedOrder } from "./interfaces/order-book.types";
import { MESQAL_TO_GRAM } from "../common/constants";

const PROVIDER_LOT_SIZE = 100;
const PROVIDER_TOTAL_LOTS = 10;


@Injectable()
export class OrderBookService implements OnModuleInit {
  private readonly logger = new Logger(OrderBookService.name);

  private providerBooks = new Map<string, OrderBook>();
  private customerBooks = new Map<string, OrderBook>();

  constructor(
    @InjectRepository(PricePairEntity)
    private readonly pricePairRepo: Repository<PricePairEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log("Initialising order books…");
    const pairs = await this.pricePairRepo.find({
      where: { isValid: true },
      relations: { baseSymbol: true, quoteSymbol: true },
    });

    for (const pair of pairs) {
      this.seedPairBooks(pair);
    }

    this.logger.log(`Seeded ${pairs.length} pair(s) with provider liquidity`);
    await this.loadExistingCustomerOrders();
    this.logger.log("Customer limit orders loaded into books");
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Process a MARKET order – filled exclusively from provider liquidity.
   * Returns the matched provider orders and the actual filled quantity.
   */
  processMarketOrder(
    pairId: string,
    side: Side,
    size: number,
  ): {
    matchedProviderOrders: Array<{ orderId: string; price: number; size: number }>;
    filledSize: number;
    remainingSize: number;
  } {
    const book = this.providerBooks.get(pairId);
    if (!book) {
      throw new Error(`No provider order book for pair ${pairId}`);
    }

    const result = book.market({ side, size });

    const matched: Array<{ orderId: string; price: number; size: number }> = [];
    for (const done of result.done) {
      const price = (done as any).price ?? 0;
      matched.push({ orderId: done.id, price, size: done.size });
      this.replenishProviderOrder(pairId, done.id);
    }

    if (result.partial) {
      const partialFilled = result.partialQuantityProcessed;
      if (partialFilled > 0) {
        matched.push({
          orderId: result.partial.id,
          price: result.partial.price,
          size: partialFilled,
        });
      }
    }

    return {
      matchedProviderOrders: matched,
      filledSize: size - result.quantityLeft,
      remainingSize: result.quantityLeft,
    };
  }

  /**
   * Process a MARKET order with P2P matching against the customer book first,
   * then the provider book. Unlike limit orders, nothing is rested in the
   * customer book — any unfilled remainder is returned as remainingSize.
   *
   * P2P matching only fills against customer orders whose price is at or
   * better than the provider's current best price (the "updated price of
   * market").  This ensures that the market taker never gets a worse price
   * than what the provider could offer.
   *
   * For market orders the taker fills at the maker's price (takerPrice =
   * makerPrice), so the spread profit is 0; only commission generates revenue.
   */
  processMarketOrderWithP2P(
    pairId: string,
    side: Side,
    size: number,
    orderId: string,
  ): { matchedOrders: MatchedOrder[]; remainingSize: number } {
    const customerBook = this.customerBooks.get(pairId);
    const providerBook = this.providerBooks.get(pairId);
    if (!customerBook || !providerBook) {
      throw new Error(`No order books for pair ${pairId}`);
    }

    // Provider book depth: [asks, bids]
    //   asks = providers SELL → platform BUYS   (bestBuy price)
    //   bids = providers BUY  → platform SELLS  (bestSell price)
    const [pAsks, pBids] = providerBook.depth();
    const providerMarketPrice =
      side === Side.BUY
        ? (pAsks.length > 0 ? pAsks[0][0] : 0)    // cheapest provider ask
        : (pBids.length > 0 ? pBids[0][0] : 0);    // best provider bid

    const matched: MatchedOrder[] = [];
    let remaining = size;

    // ── Phase 1: match against customer book at provider price ─────────────
    if (remaining > 0 && providerMarketPrice > 0) {
      // Use limit() so that we only cross customer orders whose price is
      // at or better than the provider's price (the user's implicit limit).
      const custResult = customerBook.limit({ side, size: remaining, price: providerMarketPrice, id: orderId });

      for (const done of custResult.done) {
        if (done.id === orderId) continue;
        const makerP = (done as any).price ?? 0;
        const s = done.size;
        matched.push({
          makerOrderId: done.id,
          makerSide: done.side,
          makerPrice: makerP,
          makerSource: OrderSource.CUSTOMER,
          size: s,
          takerPrice: makerP,
          profit: 0,
        });
      }

      if (custResult.partial && custResult.partial.id !== orderId) {
        const partialSize = custResult.partialQuantityProcessed;
        if (partialSize > 0) {
          matched.push({
            makerOrderId: custResult.partial.id,
            makerSide: custResult.partial.side,
            makerPrice: custResult.partial.price,
            makerSource: OrderSource.CUSTOMER,
            size: partialSize,
            takerPrice: custResult.partial.price,
            profit: 0,
          });
        }
      }

      remaining = custResult.quantityLeft;

      // Remove any resting portion (market orders never stay in the book).
      customerBook.cancel(orderId);
    }

    // ── Phase 2: match remaining against provider book ─────────────────────
    if (remaining > 0) {
      const provResult = providerBook.market({ side, size: remaining });

      for (const done of provResult.done) {
        const makerP = (done as any).price ?? 0;
        matched.push({
          makerOrderId: done.id,
          makerSide: done.side,
          makerPrice: makerP,
          makerSource: OrderSource.PROVIDER,
          size: done.size,
          takerPrice: makerP,
          profit: 0,
        });
        this.replenishProviderOrder(pairId, done.id);
      }

      if (provResult.partial) {
        const partialSize = provResult.partialQuantityProcessed;
        if (partialSize > 0) {
          matched.push({
            makerOrderId: provResult.partial.id,
            makerSide: provResult.partial.side,
            makerPrice: provResult.partial.price,
            makerSource: OrderSource.PROVIDER,
            size: partialSize,
            takerPrice: provResult.partial.price,
            profit: 0,
          });
        }
      }

      remaining = provResult.quantityLeft;
    }

    return { matchedOrders: matched, remainingSize: remaining };
  }

  /**
   * Process a LIMIT order using dual-price matching:
   *  – Each party trades at their own limit price.
   *  – The platform captures the spread (takerPrice − makerPrice) as profit.
   *
   * 1) Match against customer book, 2) match against provider book,
   * 3) rest any remaining in the customer book.
   */
  processLimitOrder(
    pairId: string,
    side: Side,
    size: number,
    price: number,
    orderId: string,
  ): { matchedOrders: MatchedOrder[]; restingSize: number } {
    const customerBook = this.customerBooks.get(pairId);
    const providerBook = this.providerBooks.get(pairId);
    if (!customerBook || !providerBook) {
      throw new Error(`No order books for pair ${pairId}`);
    }

    const matched: MatchedOrder[] = [];
    let remaining = size;
    const isBuy = side === Side.BUY;

    // ── Phase 1: match against customer book ───────────────────────────────
    const custResult = customerBook.limit({ side, size: remaining, price, id: orderId });

    for (const done of custResult.done) {
      // The library may push a taker summary order into `done` when the
      // taker is fully matched — skip it to avoid settling against self.
      if (done.id === orderId) continue;
      const s = done.size;
      const makerP = (done as any).price ?? 0;
      const profit = Number((s * (isBuy ? price - makerP : makerP - price)).toFixed(4));
      matched.push({
        makerOrderId: done.id,
        makerSide: done.side,
        makerPrice: makerP,
        makerSource: OrderSource.CUSTOMER,
        size: s,
        takerPrice: price,
        profit: Math.max(0, profit),
      });
    }

    // `partial` may be a *maker* residual (taker fully matched and the last
    // maker was partially filled) — correct — **or** the taker's own resting
    // order (taker partially matched, library overwrote `partial` with the
    // remaining taker size).  Only process it when it refers to a maker.
    if (custResult.partial && custResult.partial.id !== orderId) {
      const partialSize = custResult.partialQuantityProcessed;
      if (partialSize > 0) {
        const makerP = custResult.partial.price;
        const profit = Number((partialSize * (isBuy ? price - makerP : makerP - price)).toFixed(4));
        matched.push({
          makerOrderId: custResult.partial.id,
          makerSide: custResult.partial.side,
          makerPrice: makerP,
          makerSource: OrderSource.CUSTOMER,
          size: partialSize,
          takerPrice: price,
          profit: Math.max(0, profit),
        });
      }
    }

    remaining = custResult.quantityLeft;

    // ── Phase 2: match against provider book ───────────────────────────────
    if (remaining > 0) {
      const fillable = this.calculateProviderFillable(pairId, side, price);
      if (fillable > 0) {
        customerBook.cancel(orderId);
        const fillSize = Math.min(remaining, fillable);
        const provResult = providerBook.market({ side, size: fillSize });

        for (const done of provResult.done) {
          const makerP = (done as any).price ?? 0;
          const profit = Number((done.size * (isBuy ? price - makerP : makerP - price)).toFixed(4));
          matched.push({
            makerOrderId: done.id,
            makerSide: done.side,
            makerPrice: makerP,
            makerSource: OrderSource.PROVIDER,
            size: done.size,
            takerPrice: price,
            profit: Math.max(0, profit),
          });
          this.replenishProviderOrder(pairId, done.id);
        }

        if (provResult.partial) {
          const makerP = provResult.partial.price;
          const partialSize = provResult.partialQuantityProcessed;
          const profit = Number((partialSize * (isBuy ? price - makerP : makerP - price)).toFixed(4));
          matched.push({
            makerOrderId: provResult.partial.id,
            makerSide: provResult.partial.side,
            makerPrice: makerP,
            makerSource: OrderSource.PROVIDER,
            size: partialSize,
            takerPrice: price,
            profit: Math.max(0, profit),
          });
        }

        const filledFromProviders = fillSize - provResult.quantityLeft;
        remaining -= filledFromProviders;
      }

      // ── Phase 3: rest remaining in customer book ─────────────────────────
      if (remaining > 0) {
        if (customerBook.order(orderId)) {
          customerBook.cancel(orderId);
        }
        customerBook.limit({ side, size: remaining, price, id: orderId });
      }
    }

    // ── Arbitrage detection ─────────────────────────────────────────────────
    this.checkArbitrage(pairId);

    return { matchedOrders: matched, restingSize: remaining };
  }

  /**
   * Cancel a customer limit order from the book.
   */
  cancelCustomerOrder(pairId: string, orderId: string): boolean {
    const book = this.customerBooks.get(pairId);
    if (!book) return false;
    const result = book.cancel(orderId);
    return !!result;
  }

  /**
   * Get combined depth from both books.
   */
  getDepth(pairId: string): { bids: DepthLevel[]; asks: DepthLevel[] } {
    const providerBook = this.providerBooks.get(pairId);
    const customerBook = this.customerBooks.get(pairId);

    const bids: DepthLevel[] = [];
    const asks: DepthLevel[] = [];

    const toDisplay = (price: number) => Number((price * MESQAL_TO_GRAM).toFixed(4));

    if (providerBook) {
      const [pAsks, pBids] = providerBook.depth();
      for (const [price, size] of pBids) {
        if (size > 0) bids.push({ price: toDisplay(price), size, orderCount: 0, source: OrderSource.PROVIDER });
      }
      for (const [price, size] of pAsks) {
        if (size > 0) asks.push({ price: toDisplay(price), size, orderCount: 0, source: OrderSource.PROVIDER });
      }
    }

    if (customerBook) {
      const [cAsks, cBids] = customerBook.depth();
      for (const [price, size] of cBids) {
        if (size > 0) bids.push({ price: toDisplay(price), size, orderCount: 0, source: OrderSource.CUSTOMER });
      }
      for (const [price, size] of cAsks) {
        if (size > 0) asks.push({ price: toDisplay(price), size, orderCount: 0, source: OrderSource.CUSTOMER });
      }
    }

    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);

    return { bids, asks };
  }

  /**
   * Update provider prices for a pair — re-seed the provider book.
   */
  updateProviderPrices(pairId: string, bestBuyPrice: number, bestSellPrice: number): void {
    const pair = this.pricePairRepo.create({ id: pairId });
    this.seedProviderBook(pairId, bestBuyPrice, bestSellPrice);
    this.logger.log(`Provider book re-seeded for pair ${pairId}: buy=${bestBuyPrice} sell=${bestSellPrice}`);
  }

  /**
   * Check whether a provider book exists for a given pair.
   */
  hasProviderBook(pairId: string): boolean {
    return this.providerBooks.has(pairId);
  }

  /**
   * Check whether a customer book exists for a given pair.
   */
  hasCustomerBook(pairId: string): boolean {
    return this.customerBooks.has(pairId);
  }

  /**
   * Check for arbitrage – when the best provider bid ≥ best provider ask
   * (i.e. the provider book has overlapping bid/ask prices).
   */
  checkArbitrage(pairId: string): boolean {
    const book = this.providerBooks.get(pairId);
    if (!book) return false;
    const [pAsks, pBids] = book.depth();
    const bestBid = pBids.length > 0 ? pBids[0][0] : 0;
    const bestAsk = pAsks.length > 0 ? pAsks[0][0] : 0;
    if (bestBid > 0 && bestAsk > 0 && bestBid >= bestAsk) {
      this.logger.warn(
        `ARBITRAGE pair=${pairId} provider bid=${bestBid} (${(bestBid * MESQAL_TO_GRAM).toFixed(2)} mesghal) >= ask=${bestAsk} (${(bestAsk * MESQAL_TO_GRAM).toFixed(2)} mesghal)`,
      );
      return true;
    }
    return false;
  }

  /**
   * Return current arbitrage status for a pair (provider bid ≥ provider ask).
   */
  getArbitrageStatus(pairId: string): { arbitrage: boolean; bestBid: number; bestAsk: number } | null {
    const book = this.providerBooks.get(pairId);
    if (!book) return null;
    const [pAsks, pBids] = book.depth();
    const bestBid = pBids.length > 0 ? pBids[0][0] : 0;
    const bestAsk = pAsks.length > 0 ? pAsks[0][0] : 0;
    return {
      arbitrage: bestBid > 0 && bestAsk > 0 && bestBid >= bestAsk,
      bestBid,
      bestAsk,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private seedPairBooks(pair: PricePairEntity): void {
    const bestBuy = Number(pair.bestBuyPrice) || 0;
    const bestSell = Number(pair.bestSellPrice) || 0;
    this.seedProviderBook(pair.id, bestBuy, bestSell);
    this.customerBooks.set(pair.id, new OrderBook());
  }

  private seedProviderBook(pairId: string, bestBuyPrice: number, bestSellPrice: number): void {
    const book = new OrderBook();
    this.providerBooks.set(pairId, book);

    const buyGram = bestBuyPrice / MESQAL_TO_GRAM;
    const sellGram = bestSellPrice / MESQAL_TO_GRAM;

    // bestBuyPrice = cheapest price at which platform can BUY from providers
    // This means providers SELL at that price → ASK side of the book
    if (buyGram > 0) {
      for (let i = 0; i < PROVIDER_TOTAL_LOTS; i++) {
        book.limit({
          id: `provider:${pairId}:ask:${i}`,
          side: Side.SELL,
          size: PROVIDER_LOT_SIZE,
          price: buyGram,

        });
      }
    }

    // bestSellPrice = best price at which platform can SELL to providers
    // This means providers BUY at that price → BID side of the book
    if (sellGram > 0) {
      for (let i = 0; i < PROVIDER_TOTAL_LOTS; i++) {
        book.limit({
          id: `provider:${pairId}:bid:${i}`,
          side: Side.BUY,
          size: PROVIDER_LOT_SIZE,
          price: sellGram,

        });
      }
    }
  }

  private replenishProviderOrder(pairId: string, orderId: string): void {
    if (!orderId.startsWith("provider:")) return;
    const parts = orderId.split(":");
    if (parts.length < 4) return;
    const label = parts[2]; // "bid" | "ask"
    const side = label === "ask" ? Side.SELL : Side.BUY;
    const index = parseInt(parts[3], 10);

    const book = this.providerBooks.get(pairId);
    if (!book) return;

    const fullId = `provider:${pairId}:${label}:${index}`;
    const price = book.order(fullId)?.price;
    if (!price) return;

    book.limit({
      id: fullId,
      side,
      size: PROVIDER_LOT_SIZE,
      price,

    });
  }

  /**
   * Calculate how much the provider book can fill for a given limit order.
   * For a BUY order we look at provider asks (sellers) with price <= limit price.
   * For a SELL order we look at provider bids (buyers) with price >= limit price.
   * Library depth() returns [asks, bids].
   */
  private calculateProviderFillable(pairId: string, side: Side, limitPrice: number): number {
    const book = this.providerBooks.get(pairId);
    if (!book) return 0;

    const [pAsks, pBids] = book.depth();

    let fillable = 0;

    if (side === Side.BUY) {
      for (const [price, size] of pAsks) {
        if (price <= limitPrice) fillable += size;
        else break;
      }
    } else {
      for (const [price, size] of pBids) {
        if (price >= limitPrice) fillable += size;
        else break;
      }
    }

    return fillable;
  }

  private async loadExistingCustomerOrders(): Promise<void> {
    const pendingOrders = await this.orderRepo.find({
      where: {
        orderType: OrderTypeEnum.LIMIT,
        status: In([OrderStatusEnum.PENDING, OrderStatusEnum.PARTIALLY_COMPLETED]),
      },
    });

    for (const order of pendingOrders) {
      const book = this.customerBooks.get(order.pricePairId);
      if (!book) continue;

      const remaining = order.quantity - order.executedQuantity;
      if (remaining <= 0) continue;

      const side = order.side === "BUY" ? Side.BUY : Side.SELL;
      book.limit({
        id: order.id,
        side,
        size: remaining,
        price: Number(order.price) || 0,
  
      });
    }
  }
}
