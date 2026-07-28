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
    refetchInterval: 2_000,
  });

  const opportunities = useQuery({
    queryKey: ["tg-opportunities"],
    queryFn: () => telegramApi.getOpportunities(),
    refetchInterval: 5_000,
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
    refetchInterval: tab === "chart" ? 5_000 : undefined,
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
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={"tab-btn" + (tab === "market" ? " active" : "")}
          onClick={() => setTab("market")}
        >
          <span>📊</span> بازار طلا
          {market.data && (
            <span className="live-dot" title="بروزرسانی لحظه‌ای" />
          )}
        </button>
        <button
          className={"tab-btn" + (tab === "chart" ? " active" : "")}
          onClick={() => setTab("chart")}
        >
          <span>📈</span> نمودار قیمت
        </button>
      </div>

      {tab === "market" && (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-title">
              <span>بازار</span>
              <div className="row">
                {market.isFetching && <span className="spin" style={{ width: 14, height: 14, borderWidth: 2 }} />}
                <span style={{ fontSize: 11, opacity: 0.6 }}>{market.data?.length ?? 0} نوع</span>
              </div>
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
                    className="market-card"
                  >
                    <div className="market-card-header">
                      {m.deliveryType} <span>{DIRECTION_ICON[m.direction] ?? ""}</span>
                    </div>
                    <div className="market-card-row">
                      <span>بهترین خرید ما</span>
                      <span className="mono green">{m.bestBid !== null ? fmtNum(m.bestBid) : "—"}</span>
                    </div>
                    <div className="market-card-row">
                      <span>بهترین فروش ما</span>
                      <span className="mono red">{m.bestAsk !== null ? fmtNum(m.bestAsk) : "—"}</span>
                    </div>
                    <div className="market-card-row">
                      <span>اسپرد</span>
                      <span className="mono">{m.spread !== null ? fmtNum(m.spread) : "—"}</span>
                    </div>
                    <div className="market-card-row">
                      <span>آخرین قیمت</span>
                      <span className={`mono ${DIRECTION_CLASS[m.direction]}`}>
                        {fmtNum(m.lastPrice)}
                      </span>
                    </div>
                    <div className="market-card-row">
                      <span>تغییر</span>
                      <span className={`mono ${DIRECTION_CLASS[m.direction]}`}>
                        {priceChangeText(m.priceChangePercent)}
                      </span>
                    </div>
                    <div className="market-card-row">
                      <span>حجم</span>
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
                  <div key={o.id} className="opp-row">
                    <div className="opp-row-top">
                      <div>
                        <span className={OPP_TYPE_CLASS[o.type] ?? "badge"} style={{ marginInlineEnd: 6 }}>
                          {OPP_TYPE_LABEL[o.type] ?? o.type}
                        </span>
                        <strong>{o.deliveryType}</strong> {DIRECTION_ICON[o.direction] ?? ""}
                      </div>
                      <span className="opp-time">{epochToFa(o.date)}</span>
                    </div>
                    <div className="opp-row-detail">
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
          <div className="chart-filters">
            <div className="field">
              <label>دسته</label>
              <select value={chartSubType} onChange={(e) => setChartSubType(e.target.value)}>
                <option value="">همه</option>
                {(filters.data?.subTypes ?? []).map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>نوع تحویل</label>
              <select value={chartDeliveryType} onChange={(e) => setChartDeliveryType(e.target.value)}>
                <option value="">همه</option>
                {(filters.data?.deliveryTypes ?? []).map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>سمت</label>
              <select value={chartAction} onChange={(e) => setChartAction(e.target.value)}>
                <option value="">خرید و فروش</option>
                <option value="WE_BUY">فقط خرید ما</option>
                <option value="WE_SELL">فقط فروش ما</option>
              </select>
            </div>
            <div className="field">
              <label>حداکثر نقاط</label>
              <input
                type="number"
                value={chartLimit}
                onChange={(e) => setChartLimit(Number(e.target.value) || 500)}
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
                  animation: { duration: 300 },
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
