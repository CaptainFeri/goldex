import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Line } from "react-chartjs-2";
import { telegramApi } from "../api/telegram";
import { Card, Loading, ErrorState, Empty } from "../components/ui";
import { fmtNum } from "../lib/format";
import { gridColor } from "../lib/chart";

const DIRECTION_ICON: Record<string, string> = { UP: "📈", DOWN: "📉", FLAT: "➡️" };
const DIRECTION_CLASS: Record<string, string> = { UP: "green", DOWN: "red", FLAT: "" };
const OPP_TYPE_LABEL: Record<string, string> = { PRICE_MOVEMENT: "تغییر قیمت", BEST_PRICE: "بهترین قیمت" };
const OPP_TYPE_CLASS: Record<string, string> = { PRICE_MOVEMENT: "badge gold", BEST_PRICE: "badge green" };

function epochToFa(sec: number): string {
  return new Date(sec * 1000).toLocaleString("fa-IR");
}

function priceChangeText(pct: number): string {
  if (pct === 0) return "—";
  return `${pct > 0 ? "+" : ""}${pct}%`;
}

export default function TelegramMarketPage() {
  const [tab, setTab] = useState<"market" | "chart">("market");

  const [chartSubType, setChartSubType] = useState("");
  const [chartDeliveryType, setChartDeliveryType] = useState("");
  const [chartAction, setChartAction] = useState("");
  const [chartLimit, setChartLimit] = useState(500);

  const market = useQuery({
    queryKey: ["tg-market"],
    queryFn: telegramApi.getMarket,
    refetchInterval: 10_000,
  });

  const opportunities = useQuery({
    queryKey: ["tg-opportunities"],
    queryFn: () => telegramApi.getOpportunities(),
    refetchInterval: 15_000,
  });

  const filters = useQuery({
    queryKey: ["tg-filters"],
    queryFn: telegramApi.getPriceFilters,
    staleTime: 60_000,
  });

  const prices = useQuery({
    queryKey: ["tg-prices", chartSubType, chartDeliveryType, chartAction, chartLimit],
    queryFn: () =>
      telegramApi.getPrices({
        subType: chartSubType || undefined,
        deliveryType: chartDeliveryType || undefined,
        action: chartAction || undefined,
        limit: chartLimit || undefined,
      }),
    enabled: tab === "chart",
  });

  const formatChartData = () => {
    const points = prices.data ?? [];
    const buy = points.filter((p) => p.ourAction === "WE_BUY").map((p) => ({ x: p.date * 1000, y: p.price }));
    const sell = points.filter((p) => p.ourAction === "WE_SELL").map((p) => ({ x: p.date * 1000, y: p.price }));
    return {
      datasets: [
        { label: "خرید ما", data: buy, borderColor: "#2ea861", backgroundColor: "#2ea861", pointRadius: 2, borderWidth: 1.5, tension: 0.15 },
        { label: "فروش ما", data: sell, borderColor: "#e5544b", backgroundColor: "#e5544b", pointRadius: 2, borderWidth: 1.5, tension: 0.15 },
      ],
    };
  };

  return (
    <div>
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        <button
          className={"btn" + (tab === "market" ? " btn-primary" : " btn-outline")}
          onClick={() => setTab("market")}
        >
          بازار طلا
        </button>
        <button
          className={"btn" + (tab === "chart" ? " btn-primary" : " btn-outline")}
          onClick={() => setTab("chart")}
        >
          نمودار قیمت
        </button>
      </div>

      {tab === "market" && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">
              <span>بازار</span>
              {market.isLoading && <Loading label="" />}
            </div>
            {market.isError ? (
              <ErrorState message="خطا در دریافت اطلاعات بازار" />
            ) : market.data?.length === 0 ? (
              <Empty label="هنوز قیمتی ثبت نشده است" />
            ) : (
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: 10 }}>
                {(market.data ?? []).map((m) => (
                  <div
                    key={m.deliveryType}
                    style={{
                      background: "var(--bg-elev-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "var(--radius-sm)",
                      padding: 12,
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: "var(--text-dim)" }}>
                      {m.deliveryType} {DIRECTION_ICON[m.direction] ?? ""}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                      <span style={{ opacity: 0.6 }}>بهترین خرید ما</span>
                      <span className="mono" style={{ color: "var(--green)" }}>{m.bestBid !== null ? fmtNum(m.bestBid) : "—"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                      <span style={{ opacity: 0.6 }}>بهترین فروش ما</span>
                      <span className="mono" style={{ color: "var(--red)" }}>{m.bestAsk !== null ? fmtNum(m.bestAsk) : "—"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                      <span style={{ opacity: 0.6 }}>اسپرد</span>
                      <span className="mono">{m.spread !== null ? fmtNum(m.spread) : "—"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                      <span style={{ opacity: 0.6 }}>آخرین قیمت</span>
                      <span className={`mono ${DIRECTION_CLASS[m.direction] ? "c-" + DIRECTION_CLASS[m.direction] : ""}`}>
                        {fmtNum(m.lastPrice)}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                      <span style={{ opacity: 0.6 }}>تغییر</span>
                      <span className={`mono ${DIRECTION_CLASS[m.direction] ? "c-" + DIRECTION_CLASS[m.direction] : ""}`}>
                        {priceChangeText(m.priceChangePercent)}
                      </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, padding: "2px 0" }}>
                      <span style={{ opacity: 0.6 }}>حجم</span>
                      <span className="mono">{m.volume}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Card title="فرصت‌ها" action={<span style={{ fontSize: 11, opacity: 0.6 }}>{opportunities.data?.length ?? 0} فرصت</span>}>
            {opportunities.isLoading ? (
              <Loading />
            ) : opportunities.isError ? (
              <ErrorState message="خطا" />
            ) : !opportunities.data || opportunities.data.length === 0 ? (
              <Empty label="فرصتی یافت نشد" />
            ) : (
              <div>
                {[...opportunities.data].reverse().slice(0, 50).map((o) => (
                  <div
                    key={o.id}
                    style={{
                      padding: "8px 0",
                      borderBottom: "1px solid var(--border-soft)",
                      fontSize: 12,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div>
                        <span className={OPP_TYPE_CLASS[o.type] ?? "badge"} style={{ marginInlineEnd: 6 }}>
                          {OPP_TYPE_LABEL[o.type] ?? o.type}
                        </span>
                        <strong>{o.deliveryType}</strong> {DIRECTION_ICON[o.direction] ?? ""}
                      </div>
                      <span style={{ fontSize: 10, opacity: 0.6 }}>{epochToFa(o.date)}</span>
                    </div>
                    <div style={{ marginTop: 4, color: "var(--text-dim)" }}>
                      قیمت: {fmtNum(o.price)} | قبلی: {fmtNum(o.previousPrice)} | تغییر: {priceChangeText(o.changePercent)} | تعداد: {o.quantity}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {tab === "chart" && (
        <Card title="نمودار قیمت">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
            <div className="field">
              <label style={{ fontSize: 11, display: "block", marginBottom: 2 }}>دسته</label>
              <select value={chartSubType} onChange={(e) => setChartSubType(e.target.value)}>
                <option value="">همه</option>
                {(filters.data?.subTypes ?? []).map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label style={{ fontSize: 11, display: "block", marginBottom: 2 }}>نوع تحویل</label>
              <select value={chartDeliveryType} onChange={(e) => setChartDeliveryType(e.target.value)}>
                <option value="">همه</option>
                {(filters.data?.deliveryTypes ?? []).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label style={{ fontSize: 11, display: "block", marginBottom: 2 }}>سمت</label>
              <select value={chartAction} onChange={(e) => setChartAction(e.target.value)}>
                <option value="">خرید و فروش</option>
                <option value="WE_BUY">فقط خرید ما</option>
                <option value="WE_SELL">فقط فروش ما</option>
              </select>
            </div>
            <div className="field">
              <label style={{ fontSize: 11, display: "block", marginBottom: 2 }}>حداکثر نقاط</label>
              <input
                type="number"
                value={chartLimit}
                onChange={(e) => setChartLimit(Number(e.target.value) || 500)}
                style={{ width: 90, background: "var(--bg-elev)", border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", padding: "4px 6px", color: "inherit" }}
              />
            </div>
          </div>

          {prices.isLoading ? (
            <Loading />
          ) : prices.isError ? (
            <ErrorState message="خطا در دریافت قیمت‌ها" />
          ) : !prices.data || prices.data.length === 0 ? (
            <Empty label="داده‌ای برای نمایش وجود ندارد" />
          ) : (
            <div className="chart-box">
              <Line
                data={formatChartData()}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  parsing: false,
                  interaction: { mode: "nearest", intersect: false },
                  scales: {
                    x: {
                      type: "linear",
                      ticks: { callback: (v: any) => new Date(Number(v)).toLocaleTimeString("fa-IR"), color: "#9aa4b2" },
                      grid: { color: gridColor },
                    },
                    y: { ticks: { callback: (v: any) => fmtNum(Number(v)), color: "#9aa4b2" }, grid: { color: gridColor } },
                  },
                  plugins: {
                    legend: { labels: { color: "#e6e9ef" } },
                    tooltip: {
                      callbacks: {
                        title: (items) => new Date(items[0].parsed.x as number).toLocaleString("fa-IR"),
                        label: (item) => `${item.dataset.label}: ${fmtNum(item.parsed.y as number)}`,
                      },
                    },
                  },
                }}
              />
            </div>
          )}
          {prices.data && (
            <div className="meta" style={{ fontSize: 12, opacity: 0.6, marginTop: 8 }}>
              {prices.data.length} نقطه
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
