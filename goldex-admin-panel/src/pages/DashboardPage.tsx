import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Line, Doughnut } from "react-chartjs-2";
import { api, unwrap, apiError } from "../api/client";
import { Card, Stat, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { fmtNum } from "../lib/format";
import { gridColor } from "../lib/chart";
import { fmtBySymbol } from "../lib/money";
import type {
  DashboardActivityItem,
  DashboardDistribution,
  DashboardHealth,
  DashboardKpis,
  DashboardMetric,
  DashboardColumnKind,
  DashboardRecent,
  DashboardSeries,
  DashboardSeverity,
} from "../api/types";

const num = (...vals: any[]) => {
  for (const v of vals) if (v !== undefined && v !== null) return Number(v) || 0;
  return 0;
};
const assetName = (a: any): string => {
  const s = a?.symbol ?? a?.asset;
  if (s && typeof s === "object") return s.slug ?? s.name ?? "—";
  return String(s ?? a?.slug ?? "—");
};
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// ── Metric-filtered section (§5.3) ────────────────────────────────────────

const SEVERITY_KIND: Record<DashboardSeverity, "green" | "red" | "gold" | "gray"> = {
  good: "green",
  bad: "red",
  warn: "gold",
  info: "gray",
};

/** Slice colours, in the order the API returns them (largest first). */
const SLICE_COLORS = ["#d4af37", "#4c8dff", "#2ea861", "#e5544b", "#6b7585"];

/**
 * A Jalali year in Persian digits, ungrouped.
 *
 * `fmtNum` would render 1405 as ۱٬۴۰۵ — correct for a quantity, wrong for a
 * year.
 */
const faYear = (y: number) => y.toLocaleString("fa-IR", { useGrouping: false });

/**
 * Render one table cell according to what the column holds.
 *
 * The cells arrive as strings so a single table can serve all four metrics;
 * `columnKinds` is what lets it still show a rial amount as toman and an ISO
 * instant as a Jalali date instead of printing both raw.
 */
function renderCell(value: string, kind: DashboardColumnKind, unit: string | null) {
  if (!value) return "—";
  switch (kind) {
    case "money":
      return fmtBySymbol(value, unit, { digits: 0 });
    case "quantity":
      return fmtNum(value, 4);
    case "date":
      return fmtDate(value);
    default:
      return value;
  }
}

function Delta({ percent }: { percent: number | null }) {
  // Null means the previous period was empty — a dash, not a fabricated 100%.
  if (percent === null) return <span className="muted">—</span>;
  const up = percent >= 0;
  return (
    <span style={{ color: up ? "var(--green)" : "var(--red)", fontSize: 12 }}>
      {up ? "▲" : "▼"} {fmtNum(Math.abs(percent), 1)}٪
    </span>
  );
}

function MetricCards({
  metric,
  onSelect,
}: {
  metric: DashboardMetric;
  onSelect: (m: DashboardMetric) => void;
}) {
  const kpis = useQuery({
    queryKey: ["dash-kpis"],
    queryFn: async () => unwrap<DashboardKpis>((await api.get("/admin/dashboard/kpis")).data),
  });

  const cards = kpis.data?.cards ?? [];

  return (
    <div className="grid grid-4" style={{ marginBottom: 16 }}>
      {cards.length === 0
        ? [0, 1, 2, 3].map((i) => <Stat key={i} label="…" value="…" />)
        : cards.map((c) => (
            <div
              key={c.metric}
              role="button"
              tabIndex={0}
              onClick={() => onSelect(c.metric)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") onSelect(c.metric);
              }}
              style={{
                cursor: "pointer",
                outline: metric === c.metric ? "1px solid var(--gold)" : undefined,
                borderRadius: "var(--radius)",
              }}
            >
              <Stat
                label={c.label}
                // The API reports in the symbol's own units; this is the one
                // place that converts, exactly as everywhere else in the panel.
                value={fmtBySymbol(c.value, c.unit, { digits: c.unit === "XAU" ? 4 : 0 })}
                sub={
                  <span className="row" style={{ gap: 8 }}>
                    <Delta percent={c.deltaPercent} />
                    <span className="muted">
                      {c.subValue
                        ? `${fmtBySymbol(c.subValue, c.subUnit, { digits: 0 })} ${c.sub}`
                        : c.sub}
                    </span>
                  </span>
                }
              />
            </div>
          ))}
    </div>
  );
}

function MetricPanels({ metric }: { metric: DashboardMetric }) {
  const params = { metric };

  const series = useQuery({
    queryKey: ["dash-series", metric],
    queryFn: async () =>
      unwrap<DashboardSeries>((await api.get("/admin/dashboard/series", { params })).data),
  });
  const distribution = useQuery({
    queryKey: ["dash-distribution", metric],
    queryFn: async () =>
      unwrap<DashboardDistribution>((await api.get("/admin/dashboard/distribution", { params })).data),
  });
  const activity = useQuery({
    queryKey: ["dash-activity", metric],
    queryFn: async () =>
      unwrap<DashboardActivityItem[]>((await api.get("/admin/dashboard/activity", { params })).data),
  });
  const health = useQuery({
    queryKey: ["dash-health", metric],
    queryFn: async () =>
      unwrap<DashboardHealth>((await api.get("/admin/dashboard/health", { params })).data),
  });
  const recent = useQuery({
    queryKey: ["dash-recent", metric],
    queryFn: async () =>
      unwrap<DashboardRecent>((await api.get("/admin/dashboard/recent", { params })).data),
  });

  const s = series.data;
  const chart = useMemo(() => {
    if (!s) return null;
    return {
      labels: s.points.map((p) => p.label),
      datasets: [
        {
          label: s.primaryLabel,
          data: s.points.map((p) => Number(p.primary)),
          borderColor: "#d4af37",
          backgroundColor: "#d4af3722",
          tension: 0.3,
          fill: true,
          pointRadius: 2,
        },
        {
          label: s.secondaryLabel,
          data: s.points.map((p) => Number(p.secondary)),
          borderColor: "#4c8dff",
          backgroundColor: "transparent",
          tension: 0.3,
          pointRadius: 2,
        },
      ],
    };
  }, [s]);

  const pie = distribution.data;
  const pieData = useMemo(() => {
    if (!pie || pie.slices.length === 0) return null;
    return {
      labels: pie.slices.map((x) => x.label),
      datasets: [
        {
          data: pie.slices.map((x) => x.percent),
          backgroundColor: pie.slices.map((_, i) => SLICE_COLORS[i % SLICE_COLORS.length]),
          borderColor: "transparent",
        },
      ],
    };
  }, [pie]);

  return (
    <>
      <div className="grid grid-2">
        <Card title={s ? `${s.primaryLabel} و ${s.secondaryLabel} — ${faYear(s.year)}` : "روند"}>
          {series.isLoading ? (
            <Loading />
          ) : series.isError ? (
            <ErrorState message={apiError(series.error)} />
          ) : !chart ? (
            <Empty />
          ) : (
            <div className="chart-box">
              <Line
                data={chart}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: "index", intersect: false },
                  scales: { x: { grid: { color: gridColor } }, y: { grid: { color: gridColor } } },
                  plugins: { legend: { position: "bottom" } },
                }}
              />
            </div>
          )}
        </Card>

        <Card title={pie?.title ?? "توزیع"}>
          {distribution.isLoading ? (
            <Loading />
          ) : distribution.isError ? (
            <ErrorState message={apiError(distribution.error)} />
          ) : !pieData ? (
            <Empty label="داده‌ای برای این بازه نیست" />
          ) : (
            <div className="chart-box">
              <Doughnut
                data={pieData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: { position: "bottom" },
                    tooltip: {
                      callbacks: {
                        label: (i: any) => `${i.label}: ${fmtNum(i.parsed, 1)}٪`,
                      },
                    },
                  },
                }}
              />
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-2">
        <Card title="فعالیت اخیر">
          {activity.isLoading ? (
            <Loading />
          ) : (activity.data ?? []).length === 0 ? (
            <Empty label="فعالیتی ثبت نشده" />
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {(activity.data ?? []).map((a) => (
                <div key={a.id} className="row" style={{ gap: 10, alignItems: "flex-start" }}>
                  <Badge kind={SEVERITY_KIND[a.severity]}>●</Badge>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{a.title}</div>
                    <div className="muted" style={{ fontSize: 12, whiteSpace: "normal" }}>{a.description}</div>
                  </div>
                  <span className="muted" style={{ fontSize: 11 }}>{fmtDate(a.at)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title={health.data?.title ?? "سلامت"}>
          {health.isLoading ? (
            <Loading />
          ) : (health.data?.rows ?? []).length === 0 ? (
            <Empty label="داده‌ای برای این بازه نیست" />
          ) : (
            <>
              <div className="muted" style={{ fontSize: 11, marginBottom: 10 }}>
                ترکیب {fmtNum(health.data!.windowDays)} روز گذشته — نه وضعیت لحظه‌ای سرویس
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {health.data!.rows.map((r) => (
                  <div key={r.label}>
                    <div className="row spread" style={{ fontSize: 12, marginBottom: 4 }}>
                      <span>{r.label}</span>
                      <span className="mono">
                        {fmtNum(r.percent, 1)}٪ <span className="muted">({fmtNum(r.count)})</span>
                      </span>
                    </div>
                    <div style={{ height: 6, background: "var(--bg-elev-2)", borderRadius: 3, overflow: "hidden" }}>
                      <div
                        style={{
                          width: `${Math.min(r.percent, 100)}%`,
                          height: "100%",
                          background:
                            r.variant === "good" ? "var(--green)"
                            : r.variant === "bad" ? "var(--red)"
                            : "var(--gold)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </div>

      <Card title={recent.data?.title ?? "اخیر"}>
        {recent.isLoading ? (
          <Loading />
        ) : recent.isError ? (
          <ErrorState message={apiError(recent.error)} />
        ) : (recent.data?.rows ?? []).length === 0 ? (
          <Empty />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {recent.data!.columns.map((c) => <th key={c}>{c}</th>)}
                  <th>وضعیت</th>
                </tr>
              </thead>
              <tbody>
                {/*
                  Rendered by position: the API sends `columns` and each row's
                  `cells` in the same order, so this one table serves all four
                  metrics without switching on which is selected.
                */}
                {recent.data!.rows.map((r) => (
                  <tr key={r.id}>
                    {r.cells.map((cell, i) => {
                      const kind = recent.data!.columnKinds?.[i] ?? "text";
                      return (
                        <td
                          key={i}
                          className={i === 0 || kind !== "text" ? "mono" : undefined}
                          style={{ fontSize: 12 }}
                        >
                          {renderCell(cell, kind, recent.data!.unit)}
                        </td>
                      );
                    })}
                    <td>{r.status ? <Badge kind="gray">{r.status}</Badge> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

export default function DashboardPage() {
  const [metric, setMetric] = useState<DashboardMetric>("volume");

  // Only the two surviving panels' data is fetched here; the metric panels own
  // their own queries. The previous page also pulled profit, KYC stats,
  // providers, user stats and two recent lists — all now served by the
  // dashboard endpoints, so leaving those calls in would be six requests a
  // load for data nothing renders.
  const summary = useQuery({
    queryKey: ["fin-summary"],
    queryFn: async () => unwrap<any>((await api.get("/admin/financial/summary")).data),
  });
  const providerDeals = useQuery({
    queryKey: ["provider-deals"],
    queryFn: async () => unwrap<any[]>((await api.get("/admin/financial/provider-deals")).data),
  });

  const assets: any[] = summary.data?.assets ?? [];
  const dealBalances: any[] = providerDeals.data ?? [];


  return (
    <>
      {/* The four cards are the page's global filter: every panel below is a
          function of the selected metric, which is why they are fetched
          together and the panels take it as a prop. */}
      <MetricCards metric={metric} onSelect={setMetric} />
      <MetricPanels metric={metric} />

      {/* Kept from the previous dashboard: per-asset balances and provider
          balances have no equivalent among the metric views, so replacing the
          page wholesale would have quietly dropped them. */}
      <div className="grid grid-2">
        <Card title="موجودی و سود به تفکیک دارایی">
          {summary.isLoading ? (
            <Loading />
          ) : assets.length === 0 ? (
            <Empty />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>دارایی</th>
                    <th>آزاد</th>
                    <th>قفل</th>
                    <th>مسدود</th>
                    <th>کل</th>
                    <th>سود سیستم</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a, i) => {
                    const dec = a.symbol?.slug === "IRR" ? 0 : 4;
                    return (
                      <tr key={i}>
                        <td>
                          <Badge kind="gold">{assetName(a)}</Badge>
                        </td>
                        <td className="mono">{fmtNum(num(a.customerFree), dec)}</td>
                        <td className="mono">{fmtNum(num(a.customerLocked), dec)}</td>
                        <td className="mono" style={{ color: num(a.customerFrozen) > 0 ? "var(--danger)" : undefined }}>
                          {fmtNum(num(a.customerFrozen), dec)}
                        </td>
                        <td className="mono">{fmtNum(num(a.customerTotal), dec)}</td>
                        <td className="mono">{fmtNum(num(a.systemProfit), a.symbol?.slug === "IRR" ? 0 : 6)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="موجودی تأمین‌کنندگان (از معاملات انجام‌شده)">
          {providerDeals.isLoading ? (
            <Loading />
          ) : dealBalances.length === 0 ? (
            <Empty label="معامله انجام‌شده‌ای ثبت نشده" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>تأمین‌کننده</th>
                    <th>موجودی به تفکیک نماد</th>
                    <th>تعداد معامله</th>
                  </tr>
                </thead>
                <tbody>
                  {dealBalances.map((p, i) => (
                    <tr key={i}>
                      <td>{p.providerKey ?? "—"}</td>
                      <td>
                        <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
                          {(p.symbols ?? []).map((s: any) => (
                            <span key={s.symbol} className="row" style={{ gap: 6 }}>
                              <Badge kind="gold">{s.symbol}</Badge>
                              <span className="mono" style={{ color: num(s.value) < 0 ? "var(--red)" : "var(--green)" }}>
                                {fmtNum(num(s.value), s.symbol === "XAU" ? 4 : 0)}
                              </span>
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="mono">{fmtNum(num(p.dealCount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
