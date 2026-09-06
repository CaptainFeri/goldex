import { describe, expect, it } from "vitest";
import {
  buildDatasets,
  chartLabels,
  confirmMarketMessage,
  filterGroups,
  flatten,
  marketLabel,
  missingLabel,
  needsLogScale,
  pollMs,
  reasonLabel,
  toggleId,
} from "./price";
import type { PriceHistory, PriceInstrument, PriceInstruments } from "../api/types";

const instrument = (over: Partial<PriceInstrument> = {}): PriceInstrument => ({
  id: "i-1", slug: "XAU", tickerKey: null, name: "طلا", category: "طلا",
  color: "#d4af37", colorConfigured: true,
  buy: 100, sell: 110, buyGram: null, sellGram: null,
  quoteSlug: "IRR", pairId: "p-1",
  marketOpen: true, marketStatusReason: "price-fresh", marketOverridden: false,
  lastUpdated: null, stale: false, ...over,
});

const catalogue: PriceInstruments = {
  groups: [
    { category: "طلا", items: [instrument()] },
    {
      category: "ارز",
      items: [
        instrument({ id: "i-2", slug: "USD", name: "دلار", category: "ارز" }),
        instrument({ id: "i-3", slug: "EUR", name: "یورو", category: "ارز" }),
      ],
    },
  ],
  total: 3, quoteSlug: "IRR", generatedAt: "", freshnessWindowSeconds: 15,
};

describe("flatten", () => {
  it("returns every instrument across the groups", () => {
    expect(flatten(catalogue).map((i) => i.slug)).toEqual(["XAU", "USD", "EUR"]);
  });

  it("survives a query that has not resolved", () => {
    expect(flatten(undefined)).toEqual([]);
  });
});

describe("toggleId", () => {
  it("adds at the end, keeping the order the operator picked", () => {
    expect(toggleId(["a"], "b")).toEqual(["a", "b"]);
  });

  it("removes without disturbing the rest", () => {
    expect(toggleId(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("does not mutate the input", () => {
    const before = ["a"];
    toggleId(before, "b");
    expect(before).toEqual(["a"]);
  });
});

describe("filterGroups", () => {
  it("returns everything for a blank query", () => {
    expect(filterGroups(catalogue, "  ")).toHaveLength(2);
  });

  it("matches on the category, so typing a group finds all of it", () => {
    const groups = filterGroups(catalogue, "ارز");
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.slug)).toEqual(["USD", "EUR"]);
  });

  it("matches on slug, case-insensitively", () => {
    expect(filterGroups(catalogue, "usd")[0].items.map((i) => i.slug)).toEqual(["USD"]);
  });

  it("drops groups that matched nothing rather than rendering a bare heading", () => {
    expect(filterGroups(catalogue, "طلا").map((g) => g.category)).toEqual(["طلا"]);
    expect(filterGroups(catalogue, "nothing")).toEqual([]);
  });
});

describe("buildDatasets", () => {
  const history: PriceHistory = {
    series: [
      { symbolId: "i-1", slug: "XAU", name: "طلا", color: "#d4af37", buyKey: "XAU_buy", sellKey: "XAU_sell", filledPoints: 2 },
    ],
    missing: [],
    rows: [
      { i: 0, at: "2026-09-06T09:00:00.000Z", XAU_buy: null, XAU_sell: null },
      { i: 1, at: "2026-09-06T09:30:00.000Z", XAU_buy: 100, XAU_sell: 110 },
    ],
    from: "", to: "", points: 2, bucketSeconds: 1800, quoteSlug: "IRR",
  };

  it("draws both lines in `all` mode", () => {
    expect(buildDatasets(history, "all")).toHaveLength(2);
  });

  it("draws one line per mode filter", () => {
    expect(buildDatasets(history, "buy")).toHaveLength(1);
    expect(buildDatasets(history, "sell")).toHaveLength(1);
    expect((buildDatasets(history, "buy")[0] as any).label).toContain("خرید");
  });

  it("reads the row keys off `series`, not by rebuilding them", () => {
    // The server publishes buyKey/sellKey; a client that built `${slug}_buy`
    // itself would silently draw nothing the day that naming changed.
    const renamed = {
      ...history,
      series: [{ ...history.series[0], buyKey: "renamed_buy", sellKey: "renamed_sell" }],
      rows: [{ i: 0, at: "", renamed_buy: 7, renamed_sell: 8 }],
    };
    expect((buildDatasets(renamed, "buy")[0] as any).data).toEqual([7]);
  });

  it("keeps a missing price as null so the line breaks instead of dropping to zero", () => {
    const buy = buildDatasets(history, "buy")[0] as any;
    expect(buy.data).toEqual([null, 100]);
    expect(buy.spanGaps).toBe(false);
  });

  it("dashes the sell line, so the two stay apart in print", () => {
    expect((buildDatasets(history, "sell")[0] as any).borderDash).toBeTruthy();
    expect((buildDatasets(history, "buy")[0] as any).borderDash).toBeUndefined();
  });

  it("survives a query that has not resolved", () => {
    expect(buildDatasets(undefined, "all")).toEqual([]);
  });
});

describe("chartLabels", () => {
  it("labels each bucket with its own instant", () => {
    const labels = chartLabels({
      rows: [{ i: 0, at: "2026-09-06T09:00:00.000Z" }, { i: 1, at: "2026-09-06T10:00:00.000Z" }],
    } as any);
    expect(labels).toHaveLength(2);
    expect(labels[0]).not.toBe(labels[1]);
  });

  it("survives a query that has not resolved", () => {
    expect(chartLabels(undefined)).toEqual([]);
  });
});

describe("marketLabel", () => {
  it("distinguishes unknown from closed", () => {
    // A pair that was never reconciled is not a closed market, and saying so
    // would be a claim the server did not make.
    expect(marketLabel(instrument({ marketOpen: null }))).toContain("نامشخص");
    expect(marketLabel(instrument({ marketOpen: false }))).toContain("بسته");
    expect(marketLabel(instrument({ marketOpen: true }))).toContain("باز");
  });
});

describe("confirmMarketMessage", () => {
  it("warns that closing cancels resting orders", () => {
    expect(confirmMarketMessage(instrument(), false)).toContain("سفارش");
  });

  it("does not warn when opening", () => {
    expect(confirmMarketMessage(instrument(), true)).not.toContain("سفارش");
  });

  it("names the instrument either way", () => {
    expect(confirmMarketMessage(instrument(), true)).toContain("طلا");
    expect(confirmMarketMessage(instrument(), false)).toContain("طلا");
  });
});

describe("reasonLabel", () => {
  it("translates the reasons the server sends", () => {
    expect(reasonLabel("stale-price")).toBe("قیمت قدیمی");
    expect(reasonLabel("admin-override")).toBe("اعمال دستی مدیر");
  });

  it("shows an unmapped reason rather than a blank cell", () => {
    expect(reasonLabel("something-new")).toBe("something-new");
  });

  it("returns null when there is no reason at all", () => {
    expect(reasonLabel(null)).toBeNull();
  });
});

describe("missingLabel", () => {
  it("explains why a slug could not be charted", () => {
    expect(missingLabel("no-pair")).toBe("جفت‌ارز ریالی ندارد");
    expect(missingLabel("unknown-symbol")).toBe("نماد ناشناخته");
  });

  it("passes an unmapped reason through", () => {
    expect(missingLabel("mystery")).toBe("mystery");
  });
});

describe("pollMs", () => {
  it("uses the server's cadence", () => {
    expect(pollMs(5)).toBe(5000);
  });

  it("falls back before the config loads", () => {
    expect(pollMs(undefined)).toBe(3000);
  });

  it("refuses a value that would busy-loop the browser", () => {
    expect(pollMs(0)).toBe(3000);
    expect(pollMs(-1)).toBe(3000);
  });

  it("caps a value that would make the screen look frozen", () => {
    expect(pollMs(100000)).toBe(300000);
  });
});

describe("needsLogScale", () => {
  const history = (rows: Array<Record<string, number | string | null>>) =>
    ({ rows } as any);

  it("stays linear for instruments of a similar size", () => {
    expect(needsLogScale(history([{ i: 0, at: "", A_buy: 100, B_buy: 140 }]))).toBe(false);
  });

  it("switches when one instrument dwarfs another", () => {
    // Gold at 89,000,000 rial beside a dollar at 58,000 puts one line on the
    // ceiling and the other flat on the floor.
    expect(needsLogScale(history([{ i: 0, at: "", XAU_buy: 89_250_000, USD_buy: 58_200 }]))).toBe(true);
  });

  it("ignores nulls rather than treating a gap as a zero-priced series", () => {
    expect(needsLogScale(history([{ i: 0, at: "", A_buy: null, B_buy: 100 }]))).toBe(false);
  });

  it("ignores a zero, which has no place on a log axis", () => {
    expect(needsLogScale(history([{ i: 0, at: "", A_buy: 0, B_buy: 100 }]))).toBe(false);
  });

  it("does not read the index or timestamp columns as prices", () => {
    // `i` counts 0..29. Counted as a price it would sit next to a real one at
    // 89 million and force every single-instrument chart onto a log axis.
    expect(
      needsLogScale(history([{ i: 1, at: "2026-09-06T09:00:00.000Z", XAU_buy: 89_250_000 }])),
    ).toBe(false);
  });

  it("survives a query that has not resolved", () => {
    expect(needsLogScale(undefined)).toBe(false);
  });
});
