import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Stat } from "../components/ui";
import { fmtNum } from "../lib/format";
import { fmtBySymbol } from "../lib/money";
import type { OrderBookDepth, OrderBookDepthLevel, OrderBookOverview, OrderBookStatus } from "../api/types";

const REFRESH_MS = 5000;

type Filter = "all" | "active" | "attention" | "closed";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "همه" },
  { key: "active", label: "دارای سفارش" },
  { key: "attention", label: "نیازمند بررسی" },
  { key: "closed", label: "بسته / غیرفعال" },
];

/** A book an admin should look at: no book, out of sync, or crossed. */
function needsAttention(s: OrderBookStatus): boolean {
  return s.crossed || !s.inSync || (s.isValid && !s.hasBook);
}

function attentionNote(s: OrderBookStatus): string | null {
  if (s.isValid && !s.hasBook)
    return "دفتر سفارشی در حافظه وجود ندارد — اولین سفارش Limit روی این جفت‌ارز خطا می‌دهد.";
  if (!s.inSync)
    return `ناهمخوانی: ${s.restingOrders} سفارش در حافظه در برابر ${s.dbPendingOrders} سفارش باز در دیتابیس.`;
  if (s.crossed) return "دفتر متقاطع است: بهترین خرید بزرگ‌تر یا مساوی بهترین فروش.";
  return null;
}

function DepthTable({
  levels,
  side,
  maxSize,
  baseSlug,
  quoteSlug,
}: {
  levels: OrderBookDepthLevel[];
  side: "bid" | "ask";
  maxSize: number;
  // A ladder row mixes units: the price is in the quote symbol, the size in
  // the base. One formatter for both would be wrong on one of them.
  baseSlug?: string | null;
  quoteSlug?: string | null;
}) {
  const isAsk = side === "ask";
  const colorClass = isAsk ? "ask" : "bid";
  const barColor = isAsk ? "var(--red)" : "var(--green)";

  return (
    <div className="ob-table">
      <div className="ob-hdr">
        <span>قیمت</span>
        <span>مقدار</span>
        <span>سفارش</span>
      </div>
      <div className="ob-rows">
        {levels.length === 0 ? (
          <div className="ob-empty">خالی</div>
        ) : (
          levels.map((l, i) => (
            <div key={`${side}-${i}`} className="ob-row">
              <div
                className="ob-bar"
                style={{
                  width: `${(l.size / maxSize) * 100}%`,
                  background: barColor,
                  [isAsk ? "right" : "left"]: 0,
                }}
              />
              <span className={`ob-price ${colorClass}`}>{fmtBySymbol(l.price, quoteSlug, { digits: 4 })}</span>
              <span className="ob-size">{fmtBySymbol(l.size, baseSlug, { digits: 4 })}</span>
              <span className="ob-src">{l.orderCount}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function OverviewTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: OrderBookStatus[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) return <Empty label="جفت‌ارزی با این فیلتر نیست." />;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>جفت‌ارز</th>
            <th>وضعیت</th>
            <th>استخر Limit</th>
            <th>دفتر</th>
            <th>سفارش باز</th>
            <th>سطوح (خرید/فروش)</th>
            <th>عمق (خرید/فروش)</th>
            <th>بهترین خرید</th>
            <th>بهترین فروش</th>
            <th>اسپرد</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const note = attentionNote(s);
            const selected = s.pairId === selectedId;
            return (
              <tr
                key={s.pairId}
                onClick={() => onSelect(s.pairId)}
                style={{
                  cursor: "pointer",
                  background: selected ? "var(--bg-elev-2)" : undefined,
                }}
              >
                <td>
                  <b className="mono">{s.pairLabel}</b>
                  {note && (
                    <div style={{ fontSize: 11, color: "var(--red)", whiteSpace: "normal", maxWidth: 260 }}>
                      {note}
                    </div>
                  )}
                </td>
                <td>
                  {s.isValid ? <Badge kind="green">فعال</Badge> : <Badge kind="gray">غیرفعال</Badge>}
                </td>
                <td>
                  {s.limitPoolStatus === "CLOSED" ? (
                    <Badge kind="red">بسته</Badge>
                  ) : s.limitPoolStatus === "OPEN" ? (
                    <Badge kind="green">باز</Badge>
                  ) : (
                    <span className="muted">—</span>
                  )}
                  {s.limitPoolOverridden && (
                    <span className="muted" style={{ fontSize: 11, marginInlineStart: 6 }}>
                      اجباری
                    </span>
                  )}
                </td>
                <td>
                  {s.hasBook ? <Badge kind="green">باز</Badge> : <Badge kind="gray">ندارد</Badge>}
                </td>
                <td className="mono">
                  {s.restingOrders}
                  {!s.inSync && (
                    <span style={{ color: "var(--red)" }}> / {s.dbPendingOrders}</span>
                  )}
                </td>
                <td className="mono">
                  {s.bidLevels} / {s.askLevels}
                </td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {fmtBySymbol(s.totalBidSize, s.baseSlug, { digits: 2 })}
                  {" / "}
                  {fmtBySymbol(s.totalAskSize, s.baseSlug, { digits: 2 })}
                </td>
                <td className="mono" style={{ color: "var(--green)" }}>
                  {s.bestBid == null ? "—" : fmtBySymbol(s.bestBid, s.quoteSlug, { digits: 4 })}
                </td>
                <td className="mono" style={{ color: "var(--red)" }}>
                  {s.bestAsk == null ? "—" : fmtBySymbol(s.bestAsk, s.quoteSlug, { digits: 4 })}
                </td>
                <td className="mono" style={{ color: s.crossed ? "var(--red)" : undefined }}>
                  {s.spread == null ? "—" : `${fmtBySymbol(s.spread, s.quoteSlug, { digits: 4 })} (${fmtNum(s.spreadPercent, 2)}٪)`}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function OrderBookPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");

  const refetchInterval = autoRefresh ? REFRESH_MS : undefined;

  const overviewQ = useQuery({
    queryKey: ["order-book-overview"],
    queryFn: async () => unwrap<OrderBookOverview>((await api.get("/admin/orders/book/overview")).data),
    refetchInterval,
  });

  const pairs = overviewQ.data?.pairs ?? [];
  const summary = overviewQ.data?.summary;

  // Default to the first pair that actually has resting orders, falling back to
  // the first row — opening on an empty book teaches nothing.
  useEffect(() => {
    if (selectedId || pairs.length === 0) return;
    setSelectedId((pairs.find((p) => p.restingOrders > 0) ?? pairs[0]).pairId);
  }, [pairs, selectedId]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pairs.filter((p) => {
      if (term && !p.pairLabel.toLowerCase().includes(term)) return false;
      switch (filter) {
        case "active":
          return p.restingOrders > 0;
        case "attention":
          return needsAttention(p);
        case "closed":
          return !p.isValid || p.limitPoolStatus === "CLOSED";
        default:
          return true;
      }
    });
  }, [pairs, filter, search]);

  const depthQ = useQuery({
    queryKey: ["order-book-depth", selectedId],
    queryFn: async () =>
      unwrap<OrderBookDepth>((await api.get(`/admin/orders/book/${selectedId}`)).data),
    enabled: !!selectedId,
    refetchInterval,
  });

  const selected = pairs.find((p) => p.pairId === selectedId) ?? null;
  const asks = depthQ.data?.asks ?? [];
  const bids = depthQ.data?.bids ?? [];

  const bestAsk = asks.length > 0 ? asks[0].price : 0;
  const bestBid = bids.length > 0 ? bids[0].price : 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPercent = bestAsk > 0 ? (spread / bestAsk) * 100 : 0;

  const maxAskSize = Math.max(...asks.map((a) => a.size), 1);
  const maxBidSize = Math.max(...bids.map((b) => b.size), 1);
  const totalAskSize = asks.reduce((s, l) => s + l.size, 0);
  const totalBidSize = bids.reduce((s, l) => s + l.size, 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="grid grid-4">
        <Stat
          label="دفتر فعال"
          value={`${summary?.withBook ?? 0} / ${summary?.validPairs ?? 0}`}
          sub="جفت‌ارز دارای دفتر / فعال"
        />
        <Stat
          label="سفارش‌های در انتظار"
          value={fmtNum(summary?.totalRestingOrders ?? 0)}
          sub={`روی ${summary?.withRestingOrders ?? 0} جفت‌ارز`}
        />
        <Stat
          label="باز ولی خالی"
          value={summary?.emptyWhileOpen ?? 0}
          sub="استخر باز، دفتر بدون سفارش"
        />
        <Stat
          label="نیازمند بررسی"
          value={(summary?.missingBook ?? 0) + (summary?.outOfSync ?? 0) + (summary?.crossed ?? 0)}
          sub={`${summary?.missingBook ?? 0} بدون دفتر • ${summary?.outOfSync ?? 0} ناهمخوان • ${summary?.crossed ?? 0} متقاطع`}
        />
      </div>

      <Card
        title="وضعیت دفتر سفارش مشترک هر جفت‌ارز"
        action={
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <label className="row" style={{ gap: 5, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              بروزرسانی خودکار
            </label>
            <input
              className="input"
              style={{ maxWidth: 160 }}
              placeholder="جستجوی جفت‌ارز…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="select"
              style={{ minWidth: 150 }}
              value={filter}
              onChange={(e) => setFilter(e.target.value as Filter)}
            >
              {FILTERS.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
        }
      >
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          دفتر Limit کاملاً P2P است و فقط سفارش‌های واقعی کاربران در آن قرار می‌گیرد. ستون «سفارش
          باز» تعداد سفارش‌های نشسته در حافظه است؛ اگر با تعداد سفارش‌های باز دیتابیس یکی نباشد،
          بازیابی دفتر ناقص انجام شده است. برای دیدن عمق، روی سطر جفت‌ارز کلیک کنید.
        </div>
        {overviewQ.isLoading ? (
          <Loading />
        ) : overviewQ.isError ? (
          <ErrorState message={apiError(overviewQ.error)} />
        ) : (
          <OverviewTable rows={rows} selectedId={selectedId} onSelect={setSelectedId} />
        )}
      </Card>

      <Card title={selected ? `عمق بازار — ${selected.pairLabel}` : "عمق بازار"}>
        {!selectedId ? (
          <Empty label="یک جفت‌ارز را از جدول بالا انتخاب کنید" />
        ) : depthQ.isLoading ? (
          <Loading />
        ) : depthQ.isError ? (
          <ErrorState message={apiError(depthQ.error)} />
        ) : (
          <div>
            <div className="grid grid-4" style={{ marginBottom: 20 }}>
              <div className="stat">
                <div className="stat-label">بهترین خرید (Bid)</div>
                <div className="stat-value" style={{ color: "var(--green)" }}>{fmtBySymbol(bestBid, selected?.quoteSlug, { digits: 4 })}</div>
              </div>
              <div className="stat">
                <div className="stat-label">بهترین فروش (Ask)</div>
                <div className="stat-value" style={{ color: "var(--red)" }}>{fmtBySymbol(bestAsk, selected?.quoteSlug, { digits: 4 })}</div>
              </div>
              <div className="stat">
                <div className="stat-label">اسپرد</div>
                <div className="stat-value">
                  {fmtBySymbol(spread, selected?.quoteSlug, { digits: 4 })} ({fmtNum(spreadPercent, 2)}٪)
                </div>
              </div>
              <div className="stat">
                <div className="stat-label">عمق سفارشات</div>
                <div className="stat-value" style={{ fontSize: 14 }}>
                  خرید {fmtBySymbol(totalBidSize, selected?.baseSlug, { digits: 2 })} / فروش {fmtBySymbol(totalAskSize, selected?.baseSlug, { digits: 2 })}
                </div>
              </div>
            </div>

            <div className="grid grid-2" style={{ gap: 16 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--red)" }}>
                  فروش (Asks)
                </div>
                <DepthTable levels={asks} side="ask" maxSize={maxAskSize} baseSlug={selected?.baseSlug} quoteSlug={selected?.quoteSlug} />
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--green)" }}>
                  خرید (Bids)
                </div>
                <DepthTable levels={bids} side="bid" maxSize={maxBidSize} baseSlug={selected?.baseSlug} quoteSlug={selected?.quoteSlug} />
              </div>
            </div>

            <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-faint)", textAlign: "center" }}>
              {depthQ.isFetching
                ? "در حال بروزرسانی…"
                : `آخرین بروزرسانی: ${new Date().toLocaleTimeString("fa-IR")}`}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
