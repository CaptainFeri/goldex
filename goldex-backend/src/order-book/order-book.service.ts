import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, In } from "typeorm";
import { OrderBook, Side } from "nodejs-order-book";
import type { OrderBookOptions } from "nodejs-order-book";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { OrderEntity } from "../order/order.entity";
import { OrderStatusEnum } from "../order/enum/order.status.enum";
import { OrderTypeEnum } from "../order/enum/order.type.enum";
import { OrderSource, DepthLevel, MatchedOrder } from "./interfaces/order-book.types";
import { MESQAL_TO_GRAM } from "../common/constants";

/**
 * Limit Market order books — one real customer-to-customer book per valid pair.
 *
 * The Limit Market is 100% P2P: the book only contains orders actually placed
 * by users and they match each other at crossing prices. No synthetic or
 * supplier liquidity is ever injected here. The Market (supplier) market is
 * handled separately by the provider deal pipeline, and the Custom (Telegram)
 * market has its own quote-request matching flow.
 */
@Injectable()
export class OrderBookService implements OnModuleInit {
  private readonly logger = new Logger(OrderBookService.name);

  private readonly limitBooks = new Map<string, OrderBook>();

  constructor(
    @InjectRepository(PricePairEntity)
    private readonly pricePairRepo: Repository<PricePairEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.logger.log("Initialising Limit Market order books…");
    const pairs = await this.pricePairRepo.find({
      where: { isValid: true },
      relations: { baseSymbol: true, quoteSymbol: true },
    });

    const pendingByPair = await this.loadPendingLimitOrders();

    for (const pair of pairs) {
      const snapshot = this.buildRestoreSnapshot(pendingByPair.get(pair.id) ?? []);
      this.limitBooks.set(pair.id, new OrderBook({ snapshot }));
      const restored = this.countSnapshotOrders(snapshot);
      if (restored > 0) {
        this.logger.log(
          `Restored ${restored} resting LIMIT order(s) into the ${pair.id} book`,
        );
      }
    }

    this.logger.log(`Limit Market ready for ${pairs.length} pair(s) — real customer orders only`);
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Process a LIMIT order against the Limit Market book (pure P2P):
   *   1) cross resting customer orders at or better than the limit price,
   *   2) rest the remainder in the book.
   * Orders settle at their own prices — the platform captures the spread.
   */
  processLimitOrder(
    pairId: string,
    side: Side,
    size: number,
    price: number,
    orderId: string,
  ): { matchedOrders: MatchedOrder[]; restingSize: number } {
    const book = this.limitBooks.get(pairId);
    if (!book) {
      throw new Error(`No Limit Market book for pair ${pairId}`);
    }

    const matched: MatchedOrder[] = [];
    let remaining = size;
    const isBuy = side === Side.BUY;

    // ── Phase 1: cross resting customer orders at or better than the limit ──
    const [cAsks, cBids] = book.depth();

    let crossingAvailable = 0;
    if (isBuy) {
      for (const [p, s] of cAsks) {
        if (p <= price) crossingAvailable += s;
        else break;
      }
    } else {
      for (const [p, s] of cBids) {
        if (p >= price) crossingAvailable += s;
        else break;
      }
    }

    if (crossingAvailable > 0) {
      const matchSize = Math.min(remaining, crossingAvailable);
      const custResult = book.market({ side, size: matchSize });

      for (const done of custResult.done) {
        if (done.id === orderId) continue;
        const makerP = (done as any).price ?? 0;
        const s = done.size;
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

      if (custResult.partial && custResult.partial.id !== orderId) {
        const makerP = custResult.partial.price;
        const partialSize = custResult.partialQuantityProcessed;
        if (partialSize > 0) {
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

      const filledFromCross = matchSize - custResult.quantityLeft;
      remaining -= filledFromCross;
    }

    // ── Phase 2: rest the remainder in the Limit Market book ────────────────
    if (remaining > 0) {
      if (book.order(orderId)) {
        book.cancel(orderId);
      }
      book.limit({ side, size: remaining, price, id: orderId });
    }

    return { matchedOrders: matched, restingSize: remaining };
  }

  /**
   * Cancel a customer limit order from the Limit Market book.
   */
  cancelCustomerOrder(pairId: string, orderId: string): boolean {
    const book = this.limitBooks.get(pairId);
    if (!book) return false;
    const result = book.cancel(orderId);
    return !!result;
  }

  /**
   * Evict every resting order from a pair's book (used when the LIMIT pool is
   * closed). Returns the removed order ids.
   */
  clearRestingForPair(pairId: string): string[] {
    const book = this.limitBooks.get(pairId);
    if (!book) return [];

    const ids: string[] = [];
    const snap: any = book.snapshot();
    const levels = [...(snap.bids ?? []), ...(snap.asks ?? [])];
    for (const level of levels) {
      for (const order of level.orders ?? []) {
        if (order?.id) {
          ids.push(order.id);
          book.cancel(order.id);
        }
      }
    }
    return ids;
  }

  /**
   * Get depth of the Limit Market book (real customer orders only).
   * Prices are per gram, converted to mesghal for display.
   */
  getDepth(pairId: string): { bids: DepthLevel[]; asks: DepthLevel[] } {
    const book = this.limitBooks.get(pairId);

    const bids: DepthLevel[] = [];
    const asks: DepthLevel[] = [];

    const toDisplay = (price: number) => Number((price * MESQAL_TO_GRAM).toFixed(4));

    if (book) {
      // Real per-level order counts come from the snapshot (depth() only
      // exposes aggregated size per level).
      const orderCounts = new Map<number, number>();
      const snap = book.snapshot();
      for (const level of snap.bids) orderCounts.set(level.price, level.orders.length);
      for (const level of snap.asks) orderCounts.set(level.price, level.orders.length);

      const [cAsks, cBids] = book.depth();
      for (const [price, size] of cBids) {
        if (size > 0) bids.push({ price: toDisplay(price), size, orderCount: orderCounts.get(price) ?? 0, source: OrderSource.CUSTOMER });
      }
      for (const [price, size] of cAsks) {
        if (size > 0) asks.push({ price: toDisplay(price), size, orderCount: orderCounts.get(price) ?? 0, source: OrderSource.CUSTOMER });
      }
    }

    bids.sort((a, b) => b.price - a.price);
    asks.sort((a, b) => a.price - b.price);

    return { bids, asks };
  }

  /**
   * Check whether a Limit Market book exists for a given pair.
   */
  hasCustomerBook(pairId: string): boolean {
    return this.limitBooks.has(pairId);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async loadPendingLimitOrders(): Promise<Map<string, OrderEntity[]>> {
    const pendingOrders = await this.orderRepo.find({
      where: {
        orderType: OrderTypeEnum.LIMIT,
        status: In([OrderStatusEnum.PENDING, OrderStatusEnum.PARTIALLY_COMPLETED]),
      },
    });

    const byPair = new Map<string, OrderEntity[]>();
    for (const order of pendingOrders) {
      const remaining = Number(order.quantity) - Number(order.executedQuantity ?? 0);
      if (remaining <= 0 || !order.price || Number(order.price) <= 0) continue;
      const list = byPair.get(order.pricePairId) ?? [];
      list.push(order);
      byPair.set(order.pricePairId, list);
    }
    return byPair;
  }

  /**
   * Restore resting orders through a snapshot instead of re-`limit()`-ing them:
   * `limit()` immediately matches any order that crosses an already-rested
   * order (their limits may have moved past each other since placement) and
   * silently consumes it without persistence. The snapshot path places every
   * order with NO taker matching, so the book faithfully reflects all PENDING
   * orders; crossings resolve when new orders arrive through processLimitOrder.
   */
  private buildRestoreSnapshot(orders: OrderEntity[]): NonNullable<OrderBookOptions["snapshot"]> {
    const bids = new Map<number, any[]>();
    const asks = new Map<number, any[]>();
    const now = Date.now();

    for (const order of orders) {
      const remaining = Number(order.quantity) - Number(order.executedQuantity ?? 0);
      if (remaining <= 0 || !order.price || Number(order.price) <= 0) continue;

      const side = order.side === "BUY" ? Side.BUY : Side.SELL;
      const price = Number(order.price);
      const entry = {
        id: order.id,
        type: "limit",
        side,
        size: remaining,
        origSize: remaining,
        price,
        time: order.createAt ? new Date(order.createAt).getTime() : now,
        timeInForce: "GTC",
        makerQty: 0,
        takerQty: 0,
      };

      const target = side === Side.BUY ? bids : asks;
      const arr = target.get(price) ?? [];
      arr.push(entry);
      target.set(price, arr);
    }

    const toLevels = (m: Map<number, any[]>) =>
      [...m.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([price, orders]) => ({ price, orders }));

    return {
      bids: toLevels(bids),
      asks: toLevels(asks),
      stopBook: { bids: [], asks: [] },
      ts: now,
      lastOp: 0,
    } as any;
  }

  private countSnapshotOrders(snapshot: any): number {
    const count = (levels: any[]) =>
      levels.reduce((sum: number, level: any) => sum + level.orders.length, 0);
    return count(snapshot.bids) + count(snapshot.asks);
  }
}