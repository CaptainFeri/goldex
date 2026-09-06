import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";
import type { MarketTicker as MarketTickerData, MarketTickerItem } from "../api/types";
import { fmtBySymbol } from "../lib/money";
import { directionOf, isGoldCategory, marqueeDuration, type Direction } from "../lib/ticker";

/** Matches the reference panel's cadence, and the endpoint's own polling advice. */
const POLL_MS = 3000;

/** Remembers the previous poll so `directionOf` has something to compare. */
function useDirection(value: number | null): Direction {
  const previous = useRef<number | null>(null);
  const [direction, setDirection] = useState<Direction>("neutral");

  useEffect(() => {
    const next = directionOf(previous.current, value);
    if (value !== null) previous.current = value;
    if (next !== "neutral") setDirection(next);
  }, [value]);

  return direction;
}

function TickerItem({ item }: { item: MarketTickerItem }) {
  const direction = useDirection(item.sellPrice);
  const isGold = isGoldCategory(item.category);

  const valueClass = [
    isGold ? "ticker-gold" : "ticker-value",
    direction === "up" && "ticker-up",
    direction === "down" && "ticker-down",
    item.stale && "ticker-stale",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className="ticker-item">
      {item.label}:{" "}
      <b className={valueClass}>
        {/*
          The price arrives in the quote symbol's units and `fmtBySymbol` turns
          a rial one into toman with its label, like every other amount in the
          panel. An unquoted instrument shows an em dash rather than a zero.
        */}
        {item.sellPrice === null ? "—" : fmtBySymbol(item.sellPrice, item.quoteSlug, { digits: 0 })}
      </b>
      {item.stale && (
        <span className="ticker-stale-mark" title="این نرخ به‌روز نیست">
          {" "}
          ⧗
        </span>
      )}
      {!item.stale && direction === "up" && <span className="ticker-change ticker-up"> ▲</span>}
      {!item.stale && direction === "down" && <span className="ticker-change ticker-down"> ▼</span>}
    </span>
  );
}

export default function MarketTicker() {
  const ticker = useQuery({
    queryKey: ["market-ticker"],
    queryFn: async () => unwrap<MarketTickerData>((await api.get("/admin/market/ticker")).data),
    refetchInterval: POLL_MS,
    // A stale-looking strip is worse than a briefly empty one, and the poll is
    // frequent enough that a failed fetch resolves itself.
    retry: false,
  });

  const items = ticker.data?.items ?? [];

  // The strip is ambient context, not a screen of its own: while it is loading
  // or the endpoint is unreachable it takes no space rather than showing an
  // error the operator cannot act on.
  if (items.length === 0) return null;

  // Every instrument is quoted, or none is — either way the operator should be
  // able to tell at a glance whether the desk has live prices.
  const allStale = items.every((i) => i.stale);

  const row = items.map((item) => <TickerItem key={item.symbolId} item={item} />);

  return (
    <div className="market-ticker">
      <span className="ticker-live">
        <span className={"ticker-dot" + (allStale ? " off" : "")} />
        {allStale ? "نرخ‌ها به‌روز نیست" : "نرخ‌های زنده"}
      </span>
      <div className="ticker-marquee">
        {/*
          Two identical sets scrolling by exactly half the track width is what
          makes the loop seamless; the duplicate is decorative, so it is hidden
          from assistive technology.
        */}
        <div className="ticker-track" style={{ ["--ticker-duration" as any]: marqueeDuration(items.length) }}>
          <div className="ticker-set">{row}</div>
          <div className="ticker-set" aria-hidden="true">
            {items.map((item) => (
              <TickerItem key={`${item.symbolId}-dup`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
