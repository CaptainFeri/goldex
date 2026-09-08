import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Line, Doughnut } from "react-chartjs-2";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { fmtNum, fmtYear } from "../lib/format";
import { gridColor } from "../lib/chart";
import { fmtBySymbol, fmtCompact, splitCompact } from "../lib/money";
import type {
  DashboardActivityItem,
  DashboardDistribution,
  DashboardHealth,
  DashboardKpi,
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

/**
 * One card: three figures, and its own filter where it has one.
 *
 * The filter belongs to the card rather than the page — a warehouse means
 * nothing to the profit card — so selecting one re-fetches this card alone and
 * passes the same value to the panels below when the card is the active one.
 */
function MetricCard({
  card,
  selected,
  filter,
  onSelect,
  onFilter,
}: {
  card: DashboardKpi;
  selected: boolean;
  filter: string;
  onSelect: () => void;
  onFilter: (value: string) => void;
}) {
  // Refetched on its own when the filter moves; the row's other cards would
  // come back identical.
  const filtered = useQuery({
    queryKey: ["dash-card", card.metric, filter],
    queryFn: async () =>
      unwrap<DashboardKpi>(
        (await api.get("/admin/dashboard/card", { params: { metric: card.metric, filter } })).data,
      ),
    enabled: !!filter,
  });

  const shown = (filter && filtered.data) || card;

  return (
    <div
      className={`dash-card${selected ? " selected" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
    >
      <div className="row spread" style={{ gap: 8, alignItems: "center" }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{card.label}</span>
        <Delta percent={shown.deltaPercent} />
      </div>

      {card.filters.length > 0 && (
        <select
          className="select sm"
          value={filter}
          // The click would otherwise pick the card while the operator is only
          // choosing what it shows.
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onFilter(e.target.value)}
          style={{ marginTop: 8 }}
        >
          <option value="">همه {card.filterLabel ?? ""}</option>
          {card.filters.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      )}

      <div className="dash-card-stats">
        {shown.stats.map((stat) => {
          // Three figures share one card, so a billion Rial is scaled and its
          // words move to the line below rather than overrunning the column
          // beside it. The exact amount stays on the tile's title.
          const { text, suffix } = splitCompact(stat.value, stat.unit);
          const note = [suffix, stat.hint].filter(Boolean).join(" · ");
          return (
            <div key={stat.label}>
              <div className="muted" style={{ fontSize: 11 }}>{stat.label}</div>
              <div
                className="mono dash-stat-value"
                title={stat.unit ? fmtBySymbol(stat.value, stat.unit, { digits: 0 }) : undefined}
              >
                {stat.unit ? text : fmtNum(stat.value, 0)}
              </div>
              {note && <div className="muted dash-stat-note">{note}</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MetricCards({
  metric,
  filters,
  onSelect,
  onFilter,
}: {
  metric: DashboardMetric;
  filters: Record<string, string>;
  onSelect: (m: DashboardMetric) => void;
  onFilter: (m: DashboardMetric, value: string) => void;
}) {
  const kpis = useQuery({
    queryKey: ["dash-kpis"],
    queryFn: async () => unwrap<DashboardKpis>((await api.get("/admin/dashboard/kpis")).data),
  });

  const cards = kpis.data?.cards ?? [];

  if (kpis.isLoading) return <Loading />;
  if (kpis.isError) return <ErrorState message={apiError(kpis.error)} />;

  return (
    <div className="dash-cards">
      {cards.map((c) => (
        <MetricCard
          key={c.metric}
          card={c}
          selected={metric === c.metric}
          filter={filters[c.metric] ?? ""}
          onSelect={() => onSelect(c.metric)}
          onFilter={(value) => onFilter(c.metric, value)}
        />
      ))}
    </div>
  );
}

function MetricPanels({ metric, filter }: { metric: DashboardMetric; filter: string }) {
  // Every panel is a function of the metric *and* whatever its card is
  // narrowed to, so the same value goes into the key and the request.
  const params = filter ? { metric, filter } : { metric };

  const series = useQuery({
    queryKey: ["dash-series", metric, filter],
    queryFn: async () =>
      unwrap<DashboardSeries>((await api.get("/admin/dashboard/series", { params })).data),
  });
  const distribution = useQuery({
    queryKey: ["dash-distribution", metric, filter],
    queryFn: async () =>
      unwrap<DashboardDistribution>((await api.get("/admin/dashboard/distribution", { params })).data),
  });
  const activity = useQuery({
    queryKey: ["dash-activity", metric, filter],
    queryFn: async () =>
      unwrap<DashboardActivityItem[]>((await api.get("/admin/dashboard/activity", { params })).data),
  });
  const health = useQuery({
    queryKey: ["dash-health", metric, filter],
    queryFn: async () =>
      unwrap<DashboardHealth>((await api.get("/admin/dashboard/health", { params })).data),
  });
  const recent = useQuery({
    queryKey: ["dash-recent", metric, filter],
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
        <Card title={s ? `${s.primaryLabel} و ${s.secondaryLabel} — ${fmtYear(s.year)}` : "روند"}>
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
                  scales: { x: { grid: { color: gridColor() } }, y: { grid: { color: gridColor() } } },
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
              {(health.data!.measures ?? []).length > 0 && (
                <div className="dash-measures">
                  {health.data!.measures.map((m) => (
                    <div key={m.label}>
                      <div className="muted" style={{ fontSize: 11 }}>{m.label}</div>
                      <div className="mono dash-stat-value" style={{ fontSize: 14 }}>
                        {m.value === "—"
                          ? "—"
                          : m.unit
                            ? fmtCompact(m.value, m.unit)
                            : fmtNum(m.value, 1)}
                      </div>
                      {m.hint && <div className="muted" style={{ fontSize: 10 }}>{m.hint}</div>}
                    </div>
                  ))}
                </div>
              )}
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
  // Kept per card, not per page: switching metrics should not silently apply
  // the last card's warehouse to the credits panels.
  const [filters, setFilters] = useState<Record<string, string>>({});

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
      {/* The cards are the page's global filter: every panel below is a
          function of the selected metric and that card's own sub-filter, which
          is why they are fetched together and the panels take both as props. */}
      <MetricCards
        metric={metric}
        filters={filters}
        onSelect={setMetric}
        onFilter={(m, value) => setFilters((f) => ({ ...f, [m]: value }))}
      />
      <MetricPanels metric={metric} filter={filters[metric] ?? ""} />

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
