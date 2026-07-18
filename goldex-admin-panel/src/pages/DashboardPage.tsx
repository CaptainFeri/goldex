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
const assetName = (a: any): string => {
  const s = a?.symbol ?? a?.asset;
  if (s && typeof s === "object") return s.slug ?? s.name ?? "—";
  return String(s ?? a?.slug ?? "—");
};
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

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
  const providerDeals = useQuery({
    queryKey: ["provider-deals"],
    queryFn: async () => unwrap<any[]>((await api.get("/admin/financial/provider-deals")).data),
  });
  const userStats = useQuery({
    queryKey: ["user-stats"],
    queryFn: async () => unwrap<any>((await api.get("/admin/users/stats")).data),
  });
  const recentOrders = useQuery({
    queryKey: ["recent-orders"],
    queryFn: async () => unwrap<any>((await api.get("/admin/financial/orders", { params: { limit: 10 } })).data),
  });
  const recentTxns = useQuery({
    queryKey: ["recent-txns"],
    queryFn: async () => unwrap<any>((await api.get("/admin/financial/transactions", { params: { limit: 10 } })).data),
  });

  const assets: any[] = summary.data?.assets ?? [];
  const dealBalances: any[] = providerDeals.data ?? [];
  const xau = assets.find((a) => (a.symbol?.slug ?? "") === "XAU");
  const irr = assets.find((a) => (a.symbol?.slug ?? "") === "IRR");
  const providerCount = providers.data?.length ?? 0;
  const onlineUsers = userStats.data?.online ?? 0;
  const totalUsers = userStats.data?.total ?? 0;

  const breakdown: any[] = kyc.data?.breakdown ?? [];
  const kycPending = num(breakdown.find((b) => String(b.status ?? "").toLowerCase().includes("pend"))?.count);
  const kycTotal = num(kyc.data?.total);

  const orders = recentOrders.data?.items ?? [];
  const txns = recentTxns.data?.items ?? [];

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
            {xau ? (
              <>
                <Stat label="طلا (XAU) — مشتریان" value={fmtNum(num(xau.customerFree), 4)} sub={`مسدود: ${fmtNum(num(xau.customerFrozen), 4)} | قفل: ${fmtNum(num(xau.customerLocked), 4)}`} />
                <Stat label="طلا (XAU) — سود سیستم" value={fmtNum(num(xau.systemProfit), 6)} sub={num(xau.systemProfit) >= 0 ? "داشته" : "منفی"} />
              </>
            ) : (
              <>
                <Stat label="طلا (XAU)" value="—" sub="داده‌ای موجود نیست" />
                <Stat label="طلا (XAU) — سود" value="—" />
              </>
            )}
            {irr ? (
              <>
                <Stat label="ریال (IRR) — مشتریان" value={fmtNum(num(irr.customerFree), 0)} sub={`مسدود: ${fmtNum(num(irr.customerFrozen), 0)} | قفل: ${fmtNum(num(irr.customerLocked), 0)}`} />
                <Stat label="ریال (IRR) — سود سیستم" value={fmtNum(num(irr.systemProfit), 0)} sub={num(irr.systemProfit) >= 0 ? "داشته" : "منفی"} />
              </>
            ) : (
              <>
                <Stat label="ریال (IRR)" value="—" sub="داده‌ای موجود نیست" />
                <Stat label="ریال (IRR) — سود" value="—" />
              </>
            )}
      </div>

      <div className="grid grid-4">
        <Stat label="کاربران آنلاین" value={userStats.isLoading ? "…" : fmtNum(onlineUsers)} sub={`کل: ${fmtNum(totalUsers)}`} />
        <Stat label="احراز هویت در انتظار" value={kyc.isLoading ? "…" : fmtNum(kycPending)} sub={`کل: ${fmtNum(kycTotal)}`} />
        <Stat label="تأمین‌کنندگان قیمت" value={providers.isLoading ? "…" : fmtNum(providerCount)} />
        <Stat label="سایر دارایی‌ها" value={fmtNum(assets.length - (xau ? 1 : 0) - (irr ? 1 : 0))} sub={`از ${assets.length} دارایی`} />
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

      <div className="grid grid-2">
        <Card title="سفارشات اخیر">
          {recentOrders.isLoading ? (
            <Loading />
          ) : orders.length === 0 ? (
            <Empty label="سفارشی ثبت نشده" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>کد</th>
                    <th>نوع</th>
                    <th>طرف</th>
                    <th>مقدار</th>
                    <th>قیمت</th>
                    <th>وضعیت</th>
                    <th>تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o: any) => (
                    <tr key={o.id}>
                      <td><code>{o.orderCode}</code></td>
                      <td>{o.orderType ?? "—"}</td>
                      <td>
                        <Badge kind={o.side === "BUY" ? "green" : "red"}>{o.side === "BUY" ? "خرید" : "فروش"}</Badge>
                      </td>
                      <td className="mono">{fmtNum(o.quantity, 4)}</td>
                      <td className="mono">{fmtNum(o.price, 0)}</td>
                      <td>{o.status ?? "—"}</td>
                      <td>{fmtDate(o.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title="تراکنش‌های اخیر">
          {recentTxns.isLoading ? (
            <Loading />
          ) : txns.length === 0 ? (
            <Empty label="تراکنشی ثبت نشده" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>نوع</th>
                    <th>نماد</th>
                    <th>مبلغ</th>
                    <th>کاربر</th>
                    <th>تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t: any) => (
                    <tr key={t.id}>
                      <td>{t.transactionType ?? "—"}</td>
                      <td><Badge kind="gold">{t.symbol ?? "—"}</Badge></td>
                      <td className="mono" style={{ color: num(t.amount) < 0 ? "var(--red)" : "var(--green)" }}>
                        {fmtNum(t.amount, 6)}
                      </td>
                      <td>{t.user ?? "—"}</td>
                      <td>{fmtDate(t.createdAt)}</td>
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
