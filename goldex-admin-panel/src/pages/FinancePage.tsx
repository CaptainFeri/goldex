import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { fmtNum, fmtDate, pairLabel } from "../lib/format";

type Tab = "orders" | "transactions" | "ledger";

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

function OrdersTab() {
  const q = useQuery({
    queryKey: ["fin-orders"],
    queryFn: async () => unwrap<any>((await api.get("/admin/financial/orders", { params: { limit: 100 } })).data),
  });
  const orders: any[] = q.data?.items ?? [];
  if (q.isLoading) return <Loading />;
  if (q.isError) return <ErrorState message={apiError(q.error)} />;
  if (orders.length === 0) return <Empty label="سفارشی ثبت نشده" />;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>کد</th>
            <th>جفت‌ارز</th>
            <th>سمت</th>
            <th>مقدار</th>
            <th>قیمت</th>
            <th>ارزش</th>
            <th>وضعیت</th>
            <th>تاریخ</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td className="mono">{o.orderCode ?? o.id?.slice(0, 8)}</td>
              <td>{o.base && o.quote ? `${o.base}/${o.quote}` : pairLabel(o.pricePair)}</td>
              <td>{sideBadge(o.side)}</td>
              <td className="mono">{fmtNum(o.quantity, 4)}</td>
              <td className="mono">{fmtNum(o.price, 2)}</td>
              <td className="mono">{fmtNum(o.totalValue, 0)}</td>
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
          <tr>
            <th>نوع</th>
            <th>کاربر</th>
            <th>نماد</th>
            <th>مبلغ</th>
            <th>کارمزد</th>
            <th>وضعیت</th>
            <th>توضیحات</th>
            <th>تاریخ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((t) => (
            <tr key={t.id}>
              <td>{t.transactionType ?? "—"}</td>
              <td>{t.user ?? "—"}</td>
              <td>{t.symbol ? <Badge kind="gold">{t.symbol}</Badge> : "—"}</td>
              <td className="mono" style={{ color: Number(t.amount) < 0 ? "var(--red)" : "var(--green)" }}>
                {fmtNum(t.amount, 6)}
              </td>
              <td className="mono">{fmtNum(t.fee, 6)}</td>
              <td>{t.status ?? "—"}</td>
              <td className="muted" style={{ maxWidth: 240, whiteSpace: "normal" }}>{t.description ?? "—"}</td>
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
          <tr>
            <th>نوع</th>
            <th>نماد</th>
            <th>مبلغ</th>
            <th>توضیحات</th>
            <th>تاریخ</th>
          </tr>
        </thead>
        <tbody>
          {items.map((l) => (
            <tr key={l.id}>
              <td>
                <Badge kind={l.type === "COMMISSION_BUY" || l.type === "COMMISSION_SELL" ? "green" : "gray"}>
                  {l.type}
                </Badge>
              </td>
              <td>{l.symbol ? <Badge kind="gold">{l.symbol}</Badge> : "—"}</td>
              <td className="mono" style={{ color: Number(l.amount) < 0 ? "var(--red)" : "var(--green)" }}>
                {fmtNum(l.amount, 6)}
              </td>
              <td className="muted" style={{ maxWidth: 280, whiteSpace: "normal" }}>{l.description ?? "—"}</td>
              <td>{fmtDate(l.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function FinancePage() {
  const [tab, setTab] = useState<Tab>("orders");
  const tabs: { key: Tab; label: string }[] = [
    { key: "orders", label: "سفارش‌ها" },
    { key: "transactions", label: "تراکنش‌ها" },
    { key: "ledger", label: "دفتر سیستم" },
  ];
  return (
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
    >
      {tab === "orders" && <OrdersTab />}
      {tab === "transactions" && <TransactionsTab />}
      {tab === "ledger" && <LedgerTab />}
    </Card>
  );
}
