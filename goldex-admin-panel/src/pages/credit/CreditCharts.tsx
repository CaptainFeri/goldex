import { Doughnut, Bar } from "react-chartjs-2";
import { gridColor } from "../../lib/chart";
import { toneColor } from "./KpiCard";
import { SETTLEMENT_STATE_LABELS, SETTLEMENT_STATE_KINDS, RISK_STATE_LABELS, RISK_STATE_KINDS } from "./labels";
import type { CreditStats } from "./CreditKpis";

function DistributionDoughnut({
  title,
  distribution,
  labels,
  kinds,
}: {
  title: string;
  distribution: Record<string, number>;
  labels: Record<string, string>;
  kinds: Record<string, string>;
}) {
  const entries = Object.entries(distribution || {}).filter(([, v]) => v > 0);

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{title}</div>
      {entries.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--text-muted)" }}>داده‌ای برای نمایش وجود ندارد</div>
      ) : (
        <div style={{ height: 220 }}>
          <Doughnut
            data={{
              labels: entries.map(([k]) => labels[k] || k),
              datasets: [
                {
                  data: entries.map(([, v]) => v),
                  backgroundColor: entries.map(([k]) => toneColor(kinds[k] || "gray")),
                  borderColor: "transparent",
                  borderWidth: 2,
                  hoverOffset: 4,
                },
              ],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              plugins: {
                legend: { position: "bottom", labels: { boxWidth: 10, padding: 12, font: { size: 11 } } },
                tooltip: {
                  callbacks: {
                    label: (ctx: any) => `${ctx.label}: ${Number(ctx.parsed).toLocaleString("fa-IR")}`,
                  },
                },
              },
            }}
          />
        </div>
      )}
    </div>
  );
}

function ExposureBar({ stats }: { stats: CreditStats }) {
  const rows = [
    { label: "حد اعتبار فعال", value: stats.exposure.activeCreditLimit, tone: "blue" },
    { label: "اعتبار استفاده‌شده", value: stats.exposure.activeUsedCredit, tone: "gold" },
    { label: "ارزش وثیقه فعال", value: stats.exposure.activeCollateralValue, tone: "green" },
  ];

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>در معرض ریسک (اعتبارات فعال)</div>
      <div style={{ height: 220 }}>
        <Bar
          data={{
            labels: rows.map((r) => r.label),
            datasets: [
              {
                label: "ریال",
                data: rows.map((r) => r.value),
                backgroundColor: rows.map((r) => toneColor(r.tone)),
                borderRadius: 4,
                maxBarThickness: 56,
              },
            ],
          }}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: "y" as const,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (ctx: any) => `${Number(ctx.parsed.x ?? ctx.parsed).toLocaleString("fa-IR")} ریال`,
                },
              },
            },
            scales: {
              x: { grid: { color: gridColor }, ticks: { callback: (v: any) => Number(v).toLocaleString("fa-IR") } },
              y: { grid: { display: false } },
            },
          }}
        />
      </div>
    </div>
  );
}

export function CreditCharts({ stats }: { stats: CreditStats }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12, marginBottom: 16 }}>
      <DistributionDoughnut title="توزیع وضعیت تسویه" distribution={stats.settlementDistribution} labels={SETTLEMENT_STATE_LABELS} kinds={SETTLEMENT_STATE_KINDS} />
      <DistributionDoughnut title="توزیع وضعیت ریسک" distribution={stats.riskDistribution} labels={RISK_STATE_LABELS} kinds={RISK_STATE_KINDS} />
      <ExposureBar stats={stats} />
    </div>
  );
}
