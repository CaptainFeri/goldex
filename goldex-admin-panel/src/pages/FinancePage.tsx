import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line } from "react-chartjs-2";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { fmtNum, fmtDate, fmtDuration, pairLabel, symbolLabel, baseSlug, quoteSlug } from "../lib/format";
import { fmtBySymbol } from "../lib/money";
import { gridColor } from "../lib/chart";
import { fromWireDate } from "../lib/dates";
import DateField from "../components/DateField";

type Tab = "overview" | "orders" | "transactions" | "ledger" | "providers" | "customers";

const DAY = 24 * 3600_000;
const PRESETS = [
  { key: "1d", label: "۲۴ ساعت", ms: DAY },
  { key: "7d", label: "۷ روز", ms: 7 * DAY },
  { key: "30d", label: "۳۰ روز", ms: 30 * DAY },
  { key: "90d", label: "۹۰ روز", ms: 90 * DAY },
];
const toInput = (ms: number) => new Date(ms).toISOString().slice(0, 10);

interface Range {
  from: number;
  to: number;
}

function sideBadge(side: string) {
  const v = String(side ?? "").toUpperCase();
  if (v === "BUY") return <Badge kind="green">خرید</Badge>;
  if (v === "SELL") return <Badge kind="red">فروش</Badge>;
  return <Badge kind="gray">{side ?? "—"}</Badge>;
}
function statusBadge(s: string) {
  const v = String(s ?? "").toUpperCase();
  if (v === "COMPLETED") return <Badge kind="green">انجام شد</Badge>;
  if (v.includes("CANCEL") || v.includes("REJECT")) return <Badge kind="red">{s}</Badge>;
  if (v === "PENDING") return <Badge kind="gold">در انتظار</Badge>;
  return <Badge kind="gray">{s ?? "—"}</Badge>;
}

// ---- KPI card with previous-period delta ----
function Delta({ cur, prev, invert }: { cur: number; prev: number; invert?: boolean }) {
  if (prev === 0 && cur === 0) return <span className="muted" style={{ fontSize: 12 }}>—</span>;
  const pct = prev === 0 ? 100 : ((cur - prev) / Math.abs(prev)) * 100;
  const up = pct >= 0;
  const good = invert ? !up : up;
  return (
    <span style={{ fontSize: 12, color: good ? "var(--green)" : "var(--red)" }}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(1)}% <span className="muted">(قبل: {fmtNum(prev, 2)})</span>
    </span>
  );
}
function Kpi({ label, value, cur, prev, invert }: { label: string; value: React.ReactNode; cur: number; prev: number; invert?: boolean }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{value}</div>
      <div className="stat-sub">
        <Delta cur={cur} prev={prev} invert={invert} />
      </div>
    </div>
  );
}

function OverviewTab({ range }: { range: Range }) {
  const stats = useQuery({
    queryKey: ["fin-stats", range.from, range.to],
    queryFn: async () =>
      unwrap<any>((await api.get("/admin/financial/stats", { params: { from: range.from, to: range.to } })).data),
  });

  const span = range.to - range.from;
  const interval = span <= 2 * DAY ? "hour" : span <= 60 * DAY ? "day" : "week";
  const profitCur = useQuery({
    queryKey: ["fin-profit-cur", range.from, range.to, interval],
    queryFn: async () =>
      unwrap<any>((await api.get("/admin/financial/profit", { params: { from: new Date(range.from).toISOString(), to: new Date(range.to).toISOString(), interval } })).data),
  });
  const profitPrev = useQuery({
    queryKey: ["fin-profit-prev", range.from, span, interval],
    queryFn: async () =>
      unwrap<any>((await api.get("/admin/financial/profit", { params: { from: new Date(range.from - span).toISOString(), to: new Date(range.from).toISOString(), interval } })).data),
  });

  const c = stats.data?.current;
  const p = stats.data?.previous;

  // Total profit per bucket (sum across symbols), indexed for current-vs-previous overlay.
  const chart = useMemo(() => {
    const bucketize = (pts: any[]) => {
      const m = new Map<string, number>();
      for (const x of pts ?? []) m.set(x.date ?? x.bucket, (m.get(x.date ?? x.bucket) ?? 0) + (Number(x.profit) || 0));
      return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    };
    const cur = bucketize(profitCur.data?.points);
    const prev = bucketize(profitPrev.data?.points);
    const n = Math.max(cur.length, prev.length);
    const labels = Array.from({ length: n }, (_, i) => (cur[i] ? new Date(cur[i][0]).toLocaleDateString("fa-IR") : `#${i + 1}`));
    return {
      labels,
      datasets: [
        { label: "این بازه", data: Array.from({ length: n }, (_, i) => cur[i]?.[1] ?? null), borderColor: "#d4af37", backgroundColor: "#d4af3722", tension: 0.3, fill: true, pointRadius: 2 },
        { label: "بازه قبل", data: Array.from({ length: n }, (_, i) => prev[i]?.[1] ?? null), borderColor: "#4c8dff", backgroundColor: "transparent", borderDash: [5, 4], tension: 0.3, pointRadius: 0 },
      ],
      n,
    };
  }, [profitCur.data, profitPrev.data]);

  if (stats.isLoading) return <Loading />;
  if (stats.isError) return <ErrorState message={apiError(stats.error)} />;

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Kpi label="حجم کل معاملات (XAU)" value={fmtNum(c?.dealVolume, 4)} cur={c?.dealVolume ?? 0} prev={p?.dealVolume ?? 0} />
        <Kpi label="میانگین زمان انجام معامله" value={fmtDuration(c?.avgDealSeconds)} cur={c?.avgDealSeconds ?? 0} prev={p?.avgDealSeconds ?? 0} invert />
        <Kpi label="نرخ تبدیل سفارش موفق" value={`${fmtNum(c?.successRate, 1)}%`} cur={c?.successRate ?? 0} prev={p?.successRate ?? 0} />
        <Kpi label="سفارش‌های دوره" value={fmtNum(c?.totalOrders)} cur={c?.totalOrders ?? 0} prev={p?.totalOrders ?? 0} />
        <Kpi label="درخواست‌های احراز در انتظار" value={fmtNum(c?.pendingKyc)} cur={c?.pendingKyc ?? 0} prev={p?.pendingKyc ?? 0} invert />
        <Kpi label="مجموع مسدودسازی‌ها" value={fmtNum(c?.totalBlocks)} cur={c?.totalBlocks ?? 0} prev={p?.totalBlocks ?? 0} invert />
      </div>

      <Card title="سود — مقایسه با بازه قبل">
        {profitCur.isLoading ? (
          <Loading />
        ) : chart.n === 0 ? (
          <Empty label="داده سودی در این بازه نیست" />
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
    </>
  );
}

function OrdersTab({ range }: { range: Range }) {
  const q = useQuery({
    queryKey: ["fin-orders", range.from, range.to],
    queryFn: async () =>
      unwrap<any>((await api.get("/admin/financial/orders", { params: { limit: 200, from: range.from, to: range.to } })).data),
  });
  const orders: any[] = q.data?.items ?? [];
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState message={apiError(q.error)} />;
  if (orders.length === 0) return <Empty label="سفارشی در این بازه نیست" />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>کد</th><th>جفت‌ارز</th><th>سمت</th><th>مقدار</th><th>قیمت</th><th>ارزش</th><th>وضعیت</th><th>تاریخ</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="mono">{o.orderCode ?? o.id?.slice(0, 8)}</td>
              <td>{o.base && o.quote ? `${o.base}/${o.quote}` : pairLabel(o.pricePair)}</td>
              <td>{sideBadge(o.side)}</td>
              <td className="mono">{fmtBySymbol(o.quantity, o.base ?? baseSlug(o.pricePair), { digits: 4 })}</td>
              <td className="mono">{fmtBySymbol(o.price, o.quote ?? quoteSlug(o.pricePair), { digits: 2 })}</td>
              <td className="mono">{fmtBySymbol(o.totalValue, o.quote ?? quoteSlug(o.pricePair), { digits: 0 })}</td>
              <td>{statusBadge(o.status)}</td>
              <td>{fmtDate(o.createdAt ?? o.createAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TransactionsTab() {
  const q = useQuery({
    queryKey: ["fin-transactions"],
    queryFn: async () => unwrap<any>((await api.get("/admin/financial/transactions", { params: { limit: 100 } })).data),
  });
  const items: any[] = q.data?.items ?? [];
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState message={apiError(q.error)} />;
  if (items.length === 0) return <Empty label="تراکنشی ثبت نشده" />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>نوع</th><th>کاربر</th><th>نماد</th><th>مبلغ</th><th>کارمزد</th><th>وضعیت</th><th>تاریخ</th></tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id}>
              <td>{t.transactionType ?? "—"}</td>
              <td>{t.user ?? "—"}</td>
              <td>{t.symbol ? <Badge kind="gold">{t.symbol}</Badge> : "—"}</td>
              <td className="mono" style={{ color: Number(t.amount) < 0 ? "var(--red)" : "var(--green)" }}>{fmtBySymbol(t.amount, t.symbol, { digits: 6 })}</td>
              <td className="mono">{fmtBySymbol(t.fee, t.symbol, { digits: 6 })}</td>
              <td>{t.status ?? "—"}</td>
              <td>{fmtDate(t.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LedgerTab() {
  const q = useQuery({
    queryKey: ["fin-ledger"],
    queryFn: async () => unwrap<any>((await api.get("/admin/financial/ledger", { params: { limit: 100 } })).data),
  });
  const items: any[] = q.data?.items ?? [];
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState message={apiError(q.error)} />;
  if (items.length === 0) return <Empty label="رکوردی در دفتر سیستم نیست" />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>نوع</th><th>نماد</th><th>مبلغ</th><th>توضیحات</th><th>تاریخ</th></tr>
        </thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.id}>
              <td><Badge kind={l.type === "COMMISSION_BUY" || l.type === "COMMISSION_SELL" ? "green" : "gray"}>{l.type}</Badge></td>
              <td>{l.symbol ? <Badge kind="gold">{l.symbol}</Badge> : "—"}</td>
              <td className="mono" style={{ color: Number(l.amount) < 0 ? "var(--red)" : "var(--green)" }}>{fmtBySymbol(l.amount, l.symbol, { digits: 6 })}</td>
              <td className="muted" style={{ maxWidth: 280, whiteSpace: "normal" }}>{l.description ?? "—"}</td>
              <td>{fmtDate(l.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ProvidersTab() {
  const q = useQuery({
    queryKey: ["fin-providers"],
    queryFn: async () => unwrap<any[]>((await api.get("/admin/financial/providers")).data),
  });
  const items: any[] = q.data ?? [];
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState message={apiError(q.error)} />;
  if (items.length === 0) return <Empty label="داده‌ای برای تأمین‌کنندگان موجود نیست" />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>تأمین‌کننده</th>
            <th>نماد</th>
            <th>موجودی کل</th>
            <th>آزاد</th>
            <th>قفل‌شده</th>
            <th>آخرین بروزرسانی</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p, i) => {
            const symbols = p.symbols ?? [];
            if (symbols.length === 0) {
              return (
                <tr key={i}>
                  <td>{p.providerKey ?? p.name ?? "—"}</td>
                  <td colSpan={5} className="muted">—</td>
                </tr>
              );
            }
            return symbols.map((s: any, j: number) => (
              <tr key={`${i}-${j}`}>
                {j === 0 && (
                  <td rowSpan={symbols.length} style={{ fontWeight: 600 }}>{p.providerKey ?? p.name ?? "—"}</td>
                )}
                <td><Badge kind="gold">{s.symbol ?? s.asset ?? "—"}</Badge></td>
                <td className="mono">{fmtBySymbol(s.total ?? s.balance, s.symbol ?? s.asset, { digits: 4 })}</td>
                <td className="mono" style={{ color: "var(--green)" }}>{fmtBySymbol(s.free ?? s.available, s.symbol ?? s.asset, { digits: 4 })}</td>
                <td className="mono" style={{ color: "var(--red)" }}>{fmtBySymbol(s.locked, s.symbol ?? s.asset, { digits: 4 })}</td>
                <td style={{ fontSize: 12 }}>{fmtDate(s.updatedAt ?? p.updatedAt)}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

function CustomersTab() {
  const [offset, setOffset] = useState(0);
  const limit = 50;
  const q = useQuery({
    queryKey: ["fin-customers", offset],
    queryFn: async () => unwrap<any>((await api.get("/admin/financial/customers", { params: { limit, offset } })).data),
  });
  const items: any[] = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const page = Math.floor(offset / limit) + 1;
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState message={apiError(q.error)} />;
  if (items.length === 0) return <Empty label="مشتری‌ای یافت نشد" />;
  return (
    <>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>نام</th>
              <th>موبایل</th>
              <th>موجودی به تفکیک نماد</th>
            </tr>
          </thead>
          <tbody>
            {items.map((c: any) => (
              <tr key={c.id ?? c.userId}>
                <td>{c.firstName ?? ""} {c.lastName ?? ""}</td>
                <td className="mono" dir="ltr">{c.phone ?? "—"}</td>
                <td>
                  <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
                    {(c.balances ?? []).map((b: any) => (
                      <span key={b.symbol} className="row" style={{ gap: 6 }}>
                        <Badge kind="gold">{b.symbol}</Badge>
                        <span className="mono" style={{ fontSize: 12 }}>
                          {fmtBySymbol(b.free, b.symbol, { digits: 4 })} / {fmtBySymbol(b.locked, b.symbol, { digits: 4 })}
                        </span>
                      </span>
                    ))}
                    {(!c.balances || c.balances.length === 0) && <span className="muted">—</span>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 16 }}>
          <button className="btn ghost sm" disabled={offset === 0} onClick={() => setOffset(offset - limit)}>قبلی</button>
          <span style={{ fontSize: 13, padding: "4px 8px" }}>{page} / {totalPages}</span>
          <button className="btn ghost sm" disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)}>بعدی</button>
        </div>
      )}
    </>
  );
}

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>("overview");
  const [range, setRange] = useState<Range>({ from: Date.now() - 7 * DAY, to: Date.now() });

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "نمای کلی" },
    { key: "orders", label: "سفارش‌ها" },
    { key: "transactions", label: "تراکنش‌ها" },
    { key: "ledger", label: "دفتر سیستم" },
    { key: "providers", label: "تأمین‌کنندگان" },
    { key: "customers", label: "مشتریان" },
  ];
  const showRange = tab === "overview" || tab === "orders";

  return (
    <>
      <Card
        title={
          <div className="toolbar">
            {tabs.map((t) => (
              <button key={t.key} className={"btn sm " + (tab === t.key ? "primary" : "ghost")} onClick={() => setTab(t.key)}>
                {t.label}
              </button>
            ))}
          </div>
        }
        action={
          showRange ? (
            <div className="toolbar">
              {PRESETS.map((pr) => (
                <button
                  key={pr.key}
                  className={"btn sm " + (range.to - range.from === pr.ms ? "primary" : "ghost")}
                  onClick={() => setRange({ from: Date.now() - pr.ms, to: Date.now() })}
                >
                  {pr.label}
                </button>
              ))}
              <DateField
                style={{ width: 150 }}
                value={toInput(range.from)}
                onChange={(v) => setRange((r) => ({ ...r, from: fromWireDate(v)?.getTime() ?? r.from }))}
              />
              <span className="muted">تا</span>
              <DateField
                style={{ width: 150 }}
                value={toInput(range.to)}
                onChange={(v) => {
                  const picked = fromWireDate(v);
                  // The upper bound is the end of the chosen day, as before.
                  if (picked) setRange((r) => ({ ...r, to: picked.getTime() + DAY - 1 }));
                }}
              />
            </div>
          ) : null
        }
      >
        {tab === "overview" && <OverviewTab range={range} />}
        {tab === "orders" && <OrdersTab range={range} />}
        {tab === "transactions" && <TransactionsTab />}
        {tab === "ledger" && <LedgerTab />}
        {tab === "providers" && <ProvidersTab />}
        {tab === "customers" && <CustomersTab />}
      </Card>
    </>
  );
}
