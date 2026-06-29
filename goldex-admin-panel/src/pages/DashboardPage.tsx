import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import { api, unwrap } from "../api/client";
import { Card, Stat, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { fmtNum } from "../lib/format";
import { gridColor } from "../lib/chart";

const num = (...vals: any[]) => {
  for (const v of vals) if (v !== undefined && v !== null) return Number(v) || 0;
  return 0;
};
// `symbol` may be an object {slug,name} or a plain string depending on endpoint.
const assetName = (a: any): string => {
  const s = a?.symbol ?? a?.asset;
  if (s && typeof s === "object") return s.slug ?? s.name ?? "—";
  return String(s ?? a?.slug ?? "—");
};

export default function DashboardPage() {
  const [interval, setInterval] = useState("day");

  const summary = useQuery({
    queryKey: ["fin-summary"],
    queryFn: async () => unwrap<any>((await api.get("/admin/financial/summary")).data),
  });
  const profit = useQuery({
    queryKey: ["fin-profit", interval],
    queryFn: async () =>
      unwrap<any>((await api.get("/admin/financial/profit", { params: { interval } })).data),
  });
  const kyc = useQuery({
    queryKey: ["kyc-stats"],
    queryFn: async () => unwrap<any>((await api.get("/admin/kyc/admin/stats")).data),
  });
  const providers = useQuery({
    queryKey: ["mon-providers"],
    queryFn: async () => unwrap<string[]>((await api.get("/admin/monitoring/providers")).data),
  });
  // Provider balances computed from completed deals (fed via RabbitMQ from the engine).
  const providerDeals = useQuery({
    queryKey: ["provider-deals"],
    queryFn: async () => unwrap<any[]>((await api.get("/admin/financial/provider-deals")).data),
  });

  const assets: any[] = summary.data?.assets ?? [];
  const dealBalances: any[] = providerDeals.data ?? [];
  const totalProfit = assets.reduce((s, a) => s + num(a.systemProfit), 0);
  const totalLocked = assets.reduce((s, a) => s + num(a.customerLocked), 0);
  const providerCount = providers.data?.length ?? 0;

  const breakdown: any[] = kyc.data?.breakdown ?? [];
  const kycPending = num(
    breakdown.find((b) => String(b.status ?? "").toLowerCase().includes("pend"))?.count
  );
  const kycTotal = num(kyc.data?.total);

  const chart = useMemo(() => {
    const points: any[] = profit.data?.points ?? [];
    const byAsset: Record<string, Map<string, number>> = {};
    for (const p of points) {
      const key = typeof p.symbol === "object" ? p.symbol?.slug ?? "profit" : p.symbol ?? "profit";
      (byAsset[key] ||= new Map()).set(p.date ?? p.bucket, num(p.profit));
    }
    const labels = Array.from(new Set(points.map((p) => p.date ?? p.bucket))).sort();
    const colors = ["#d4af37", "#4c8dff", "#2ea861", "#e5544b"];
    const datasets = Object.entries(byAsset).map(([k, m], i) => ({
      label: k,
      data: labels.map((l) => m.get(l) ?? 0),
      borderColor: colors[i % colors.length],
      backgroundColor: colors[i % colors.length] + "22",
      tension: 0.3,
      fill: true,
      pointRadius: 2,
    }));
    return {
      labels: labels.map((l) => new Date(l).toLocaleDateString("fa-IR")),
      datasets,
      count: points.length,
    };
  }, [profit.data]);

  return (
    <>
      <div className="grid grid-4">
        <Stat label="سود سیستم (مجموع دارایی‌ها)" value={fmtNum(totalProfit, 4)} sub={`${assets.length} دارایی`} />
        <Stat label="موجودی قفل‌شده مشتریان" value={fmtNum(totalLocked, 4)} />
        <Stat
          label="احراز هویت در انتظار"
          value={kyc.isLoading ? "…" : fmtNum(kycPending)}
          sub={`کل: ${fmtNum(kycTotal)}`}
        />
        <Stat label="تأمین‌کنندگان قیمت" value={providers.isLoading ? "…" : fmtNum(providerCount)} />
      </div>

      <Card
        title="روند سود در طول زمان"
        action={
          <select className="select" style={{ width: 130 }} value={interval} onChange={(e) => setInterval(e.target.value)}>
            <option value="hour">ساعتی</option>
            <option value="day">روزانه</option>
            <option value="week">هفتگی</option>
            <option value="month">ماهانه</option>
          </select>
        }
      >
        {profit.isLoading ? (
          <Loading />
        ) : profit.isError ? (
          <ErrorState message="عدم دریافت داده سود" />
        ) : chart.count === 0 ? (
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
                    <th>آزاد مشتریان</th>
                    <th>قفل‌شده</th>
                    <th>سود سیستم</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a, i) => (
                    <tr key={i}>
                      <td>
                        <Badge kind="gold">{assetName(a)}</Badge>
                      </td>
                      <td className="mono">{fmtNum(num(a.customerFree), 4)}</td>
                      <td className="mono">{fmtNum(num(a.customerLocked), 4)}</td>
                      <td className="mono">{fmtNum(num(a.systemProfit), 6)}</td>
                    </tr>
                  ))}
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
