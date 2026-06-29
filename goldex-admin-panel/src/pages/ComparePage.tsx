import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line } from "react-chartjs-2";
import { api, unwrap } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { colorFor, fmtNum, pairLabel } from "../lib/format";
import { gridColor } from "../lib/chart";
import type { CompareResponse, PricePair } from "../api/types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const RANGES: { key: string; label: string; ms?: number }[] = [
  { key: "15m", label: "۱۵ دقیقه", ms: 15 * MIN },
  { key: "1h", label: "۱ ساعت", ms: HOUR },
  { key: "6h", label: "۶ ساعت", ms: 6 * HOUR },
  { key: "24h", label: "۲۴ ساعت", ms: 24 * HOUR },
  { key: "7d", label: "۷ روز", ms: 7 * 24 * HOUR },
  { key: "all", label: "همه" },
];

type Metric = "buyPrice" | "sellPrice" | "spread";
const METRIC_LABEL: Record<Metric, string> = {
  buyPrice: "قیمت خرید",
  sellPrice: "قیمت فروش",
  spread: "اسپرد",
};

export default function ComparePage() {
  const [pairId, setPairId] = useState<string>("");
  const [metric, setMetric] = useState<Metric>("buyPrice");
  const [range, setRange] = useState("1h");

  const pairs = useQuery({
    queryKey: ["pairs"],
    queryFn: async () => unwrap<PricePair[]>((await api.get("/admin/pair")).data),
  });

  const effectivePairId = pairId || pairs.data?.[0]?.id || "";

  const compare = useQuery({
    queryKey: ["compare", effectivePairId, range],
    enabled: !!effectivePairId,
    refetchInterval: 15_000,
    queryFn: async () => {
      // Compute the window at fetch time so "to" stays live across refetches.
      const ms = RANGES.find((r) => r.key === range)?.ms;
      const params: Record<string, any> = { limit: 5000 };
      if (ms) {
        params.from = Date.now() - ms;
        params.to = Date.now();
      }
      return unwrap<CompareResponse>(
        (await api.get(`/admin/monitoring/pairs/${effectivePairId}/compare`, { params })).data
      );
    },
  });

  const chart = useMemo(() => {
    const series = compare.data?.series ?? [];
    // Union of all timestamps as the shared x-axis (sorted).
    const allTs = Array.from(
      new Set(series.flatMap((s) => s.points.map((p) => p.timestamp)))
    ).sort();
    const datasets = series.map((s) => {
      const map = new Map(s.points.map((p) => [p.timestamp, p[metric]]));
      const c = colorFor(s.providerKey);
      return {
        label: `${s.providerKey} (#${s.providerItemId})`,
        data: allTs.map((t) => (map.has(t) ? Number(map.get(t)) : null)),
        borderColor: c,
        backgroundColor: c + "20",
        spanGaps: true,
        tension: 0.25,
        pointRadius: 0,
        borderWidth: 2,
      };
    });
    return { labels: allTs.map((t) => new Date(t)), datasets, n: allTs.length };
  }, [compare.data, metric]);

  const series = compare.data?.series ?? [];

  return (
    <>
      <Card title="مقایسه قیمت تأمین‌کنندگان بر اساس نگاشت جفت‌ارز">
        <div className="toolbar" style={{ marginBottom: 4 }}>
          <div className="field" style={{ margin: 0, minWidth: 220 }}>
            <label>جفت‌ارز</label>
            <select
              className="select"
              value={effectivePairId}
              onChange={(e) => setPairId(e.target.value)}
              disabled={pairs.isLoading}
            >
              {pairs.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {pairLabel(p)}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 150 }}>
            <label>شاخص</label>
            <select className="select" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
              <option value="buyPrice">قیمت خرید</option>
              <option value="sellPrice">قیمت فروش</option>
              <option value="spread">اسپرد</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 140 }}>
            <label>بازه زمانی</label>
            <select className="select" value={range} onChange={(e) => setRange(e.target.value)}>
              {RANGES.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginInlineStart: "auto", alignSelf: "flex-end" }}>
            {compare.isFetching ? <Badge kind="gray">به‌روزرسانی…</Badge> : <Badge kind="green">زنده</Badge>}
          </div>
        </div>
      </Card>

      <Card title={`${METRIC_LABEL[metric]} — ${series.length} تأمین‌کننده`}>
        {pairs.isLoading || compare.isLoading ? (
          <Loading />
        ) : compare.isError ? (
          <ErrorState message="عدم دریافت داده مقایسه (موتور قیمت‌گذاری در دسترس است؟)" />
        ) : chart.n === 0 ? (
          <Empty label="برای این جفت‌ارز نگاشت یا داده تاریخی موجود نیست" />
        ) : (
          <div className="chart-box" style={{ height: 420 }}>
            <Line
              data={chart as any}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                scales: {
                  x: {
                    type: "time",
                    // Let Chart.js pick the unit; show date for multi-day ranges.
                    time: {
                      tooltipFormat: range === "7d" || range === "all" ? "MM/dd HH:mm" : "HH:mm:ss",
                    },
                    grid: { color: gridColor },
                    ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
                  },
                  y: { grid: { color: gridColor }, ticks: { callback: (v) => fmtNum(v as number) } },
                },
                plugins: { legend: { position: "bottom" } },
              }}
            />
          </div>
        )}
      </Card>

      {series.length > 0 && (
        <Card title="آخرین مقادیر">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>تأمین‌کننده</th>
                  <th>آیتم</th>
                  <th>آخرین خرید</th>
                  <th>آخرین فروش</th>
                  <th>اسپرد</th>
                  <th>نقاط</th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => {
                  const last = s.points[s.points.length - 1];
                  return (
                    <tr key={s.providerKey + s.providerItemId}>
                      <td>
                        <span style={{ color: colorFor(s.providerKey), fontWeight: 700 }}>●</span>{" "}
                        {s.providerKey}
                      </td>
                      <td className="mono">{s.providerItemId}</td>
                      <td className="mono">{last ? fmtNum(last.buyPrice) : "—"}</td>
                      <td className="mono">{last ? fmtNum(last.sellPrice) : "—"}</td>
                      <td className="mono">{last ? fmtNum(last.spread) : "—"}</td>
                      <td className="mono">{s.points.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
