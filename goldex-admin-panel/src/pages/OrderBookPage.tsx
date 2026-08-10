import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty } from "../components/ui";
import { fmtNum, pairLabel } from "../lib/format";
import type { PricePair, OrderBookDepth, OrderBookDepthLevel } from "../api/types";

function DepthTable({ levels, side, maxSize }: { levels: OrderBookDepthLevel[]; side: "bid" | "ask"; maxSize: number }) {
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
              <span className={`ob-price ${colorClass}`}>{fmtNum(l.price, 4)}</span>
              <span className="ob-size">{fmtNum(l.size, 4)}</span>
              <span className="ob-src">{l.orderCount}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function OrderBookPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const pairsQ = useQuery({
    queryKey: ["pairs"],
    queryFn: async () => unwrap<PricePair[]>((await api.get("/admin/pair")).data),
  });

  const pairs = useMemo(() => {
    const arr = pairsQ.data ?? [];
    if (!selectedId && arr.length > 0 && selectedId === null) {
      setSelectedId(arr[0].id);
    }
    return arr;
  }, [pairsQ.data, selectedId]);

  const depthQ = useQuery({
    queryKey: ["order-book-depth", selectedId],
    queryFn: async () => unwrap<OrderBookDepth>((await api.get(`/admin/orders/book/${selectedId}`)).data),
    enabled: !!selectedId,
    refetchInterval: autoRefresh ? 5000 : undefined,
  });

  const depth = depthQ.data;

  const asks = depth?.asks ?? [];
  const bids = depth?.bids ?? [];

  const bestAsk = asks.length > 0 ? asks[0].price : 0;
  const bestBid = bids.length > 0 ? bids[0].price : 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const spreadPercent = bestAsk > 0 ? (spread / bestAsk) * 100 : 0;

  const maxAskSize = Math.max(...asks.map((a) => a.size), 1);
  const maxBidSize = Math.max(...bids.map((b) => b.size), 1);

  const totalAskSize = asks.reduce((s, l) => s + l.size, 0);
  const totalBidSize = bids.reduce((s, l) => s + l.size, 0);

  return (
    <Card
      title="دفتر سفارش (Order Book)"
      action={
        <div className="row" style={{ gap: 10 }}>
          <label className="row" style={{ gap: 4, fontSize: 13, alignItems: "center" }}>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
            بروزرسانی خودکار
          </label>
          <select
            className="select"
            style={{ width: 200 }}
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || null)}
          >
            <option value="">انتخاب جفت‌ارز</option>
            {pairs.map((p: any) => (
              <option key={p.id} value={p.id}>
                {pairLabel(p) ?? p.baseCode + "/" + p.quoteCode}
              </option>
            ))}
          </select>
        </div>
      }
    >
      {pairsQ.isLoading ? (
        <Loading />
      ) : pairsQ.isError ? (
        <ErrorState message={apiError(pairsQ.error)} />
      ) : pairs.length === 0 ? (
        <Empty />
      ) : !selectedId ? (
        <Empty label="یک جفت‌ارز انتخاب کنید" />
      ) : depthQ.isLoading ? (
        <Loading />
      ) : depthQ.isError ? (
        <ErrorState message={apiError(depthQ.error)} />
      ) : (
        <div>
          {/* Summary stats */}
          <div className="grid grid-4" style={{ marginBottom: 20 }}>
            <div className="stat">
              <div className="stat-label">بهترین خرید (Bid)</div>
              <div className="stat-value" style={{ color: "var(--green)" }}>{fmtNum(bestBid, 4)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">بهترین فروش (Ask)</div>
              <div className="stat-value" style={{ color: "var(--red)" }}>{fmtNum(bestAsk, 4)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">اسپرد</div>
              <div className="stat-value">{fmtNum(spread, 4)} ({fmtNum(spreadPercent, 2)}%)</div>
            </div>
            <div className="stat">
              <div className="stat-label">عمق سفارشات</div>
              <div className="stat-value" style={{ fontSize: 14 }}>
                خرید {fmtNum(totalBidSize, 2)}g / فروش {fmtNum(totalAskSize, 2)}g
              </div>
            </div>
          </div>

          {/* Visual depth tables */}
          <div className="grid grid-2" style={{ gap: 16 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--red)" }}>فروش (Asks)</div>
              <DepthTable levels={asks} side="ask" maxSize={maxAskSize} />
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8, color: "var(--green)" }}>خرید (Bids)</div>
              <DepthTable levels={bids} side="bid" maxSize={maxBidSize} />
            </div>
          </div>

          <div style={{ marginTop: 16, fontSize: 12, color: "var(--text-faint)", textAlign: "center" }}>
            {depthQ.isFetching ? "در حال بروزرسانی…" : `آخرین بروزرسانی: ${new Date().toLocaleTimeString("fa-IR")}`}
          </div>
        </div>
      )}
    </Card>
  );
}