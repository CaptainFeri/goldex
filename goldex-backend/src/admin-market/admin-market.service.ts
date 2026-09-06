import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { RIAL_SYMBOL_SLUG } from "../shared/constants/currency.constants";
import { MarketService } from "../websocket/market.service";
import { MarketTickerDto, MarketTickerItemDto } from "./dto/market-ticker.dto";

/**
 * A quote older than this counts as stale.
 *
 * The panels poll the ticker every 3s, and `MarketService` refreshes its cache
 * on pair updates, so a quote that has not moved in 15s is either a closed
 * market or a broken feed. Either way the operator should be told rather than
 * shown a number that looks live.
 */
export const TICKER_FRESHNESS_WINDOW_SECONDS = 15;

@Injectable()
export class AdminMarketService {
  constructor(
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
    private readonly marketService: MarketService,
  ) {}

  /**
   * The market ticker: every symbol flagged `isTicker`, priced against the
   * rial symbol.
   *
   * A ticker entry is a symbol, but a *price* belongs to a pair — so each
   * instrument is quoted through the `<slug>-IRR` pair that `MarketService`
   * already keeps live for the websocket feed. Reusing that cache rather than
   * reading prices again keeps the ticker and the socket stream showing the
   * same number; a second price path would eventually disagree with the first.
   *
   * An instrument with no configured pair comes back with null prices and
   * `stale: true` rather than being dropped, so a half-configured ticker is
   * visible as such instead of silently short.
   */
  async getTicker(): Promise<MarketTickerDto> {
    const symbols = await this.symbolRepo.find({
      // `deleteAt` is a @DeleteDateColumn, so soft-deleted symbols are already
      // excluded — filtering again here would be noise that reads like a rule.
      where: { isTicker: true },
      order: { displayOrder: "ASC", slug: "ASC" },
    });

    const pairKeys = symbols.map((s) => `${s.slug}-${RIAL_SYMBOL_SLUG}`);
    const prices = pairKeys.length > 0 ? await this.marketService.getMultiplePrices(pairKeys) : {};

    const now = Date.now();
    const items = symbols.map((symbol) =>
      this.toItem(symbol, prices[`${symbol.slug}-${RIAL_SYMBOL_SLUG}`], now),
    );

    return {
      items,
      generatedAt: new Date(now).toISOString(),
      freshnessWindowSeconds: TICKER_FRESHNESS_WINDOW_SECONDS,
    };
  }

  private toItem(symbol: SymbolEntity, point: any, now: number): MarketTickerItemDto {
    const lastUpdated = point?.lastUpdated ?? null;
    return {
      symbolId: symbol.id,
      slug: symbol.slug,
      tickerKey: symbol.tickerKey ?? null,
      label: symbol.name,
      category: symbol.category ?? null,
      displayOrder: symbol.displayOrder ?? 0,
      // The display prices, not the raw bests: they carry the pair's commission
      // and the symbol's gain, which is what a customer is actually quoted.
      buyPrice: this.num(point?.displayBuyPrice),
      sellPrice: this.num(point?.displaySellPrice),
      buyGramPrice: this.num(point?.displayBuyGramPrice),
      sellGramPrice: this.num(point?.displaySellGramPrice),
      quoteSlug: point ? RIAL_SYMBOL_SLUG : null,
      lastUpdated,
      stale: this.isStale(lastUpdated, now),
    };
  }

  /** Zero is a real price only in the sense that it means "no quote". */
  private num(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  private isStale(lastUpdated: string | null, now: number): boolean {
    if (!lastUpdated) return true;
    const at = Date.parse(lastUpdated);
    if (Number.isNaN(at)) return true;
    return now - at > TICKER_FRESHNESS_WINDOW_SECONDS * 1000;
  }
}
