import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cbpApi, CbpGatewayHealth, CbpPayment } from "../api/cbp";
import { apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import { fmtDate, fmtNum, symbolLabel } from "../lib/format";
import { fmtBySymbol } from "../lib/money";

const STATUS_OPTS = ["pending", "processing", "succeeded", "failed", "rejected", "cancelled", "reversed"];
const OP_OPTS = ["DEPOSIT", "WITHDRAW"];

function healthBadge(h: CbpGatewayHealth) {
  switch (h.status) {
    case "up":
      return <Badge kind="green">فعال</Badge>;
    case "down":
      return <Badge kind="red">قطع</Badge>;
    case "not_configured":
      return <Badge kind="gray">پیکربندی نشده</Badge>;
    default:
      return <Badge kind="gray">نامشخص</Badge>;
  }
}

function paymentBadge(status: string) {
  switch (status) {
    case "succeeded":
      return <Badge kind="green">موفق</Badge>;
    case "failed":
    case "rejected":
    case "reversed":
      return <Badge kind="red">{status}</Badge>;
    case "processing":
      return <Badge kind="gold">در حال پردازش</Badge>;
    default:
      return <Badge kind="gray">{status}</Badge>;
  }
}

function JsonBlock({ label, value }: { label: string; value?: any }) {
  if (value === undefined || value === null) return null;
  let text: string;
  try {
    text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  } catch {
    text = String(value);
  }
  if (!text || text === "null") return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <pre dir="ltr" style={{ fontSize: 11, whiteSpace: "pre-wrap", maxHeight: 220, overflow: "auto", margin: 0, padding: 10, background: "var(--bg-elevated, #15181f)", borderRadius: 8 }}>
        {text}
      </pre>
    </div>
  );
}

/**
 * The symbol a payment is denominated in.
 *
 * Prefer the joined symbol's slug: `currency` is free text, and until this
 * change the backend filled it with `symbol.name` — "ریال ایران" for rial —
 * which no consumer can compare against. Falling back to it still helps for
 * rows written by the gateways, which set "IRR" directly. When neither
 * identifies the symbol the amount is shown unconverted rather than guessed.
 */
const paymentUnit = (p: { symbol?: { slug?: string } | null; currency?: string }) =>
  p.symbol?.slug ?? p.currency ?? null;

export default function CbpPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [operation, setOperation] = useState("");
  const [gateway, setGateway] = useState("");
  const [userId, setUserId] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [detail, setDetail] = useState<CbpPayment | null>(null);

  const health = useQuery({
    queryKey: ["cbp-health"],
    queryFn: () => cbpApi.getHealth(),
  });
  const gateways = useQuery({
    queryKey: ["cbp-gateways"],
    queryFn: () => cbpApi.getGateways(),
  });
  const list = useQuery({
    queryKey: ["cbp-payments", page, status, operation, gateway, userId, identifier],
    queryFn: () =>
      cbpApi.getPayments({
        page,
        limit: 20,
        status: status || undefined,
        operation: operation || undefined,
        gatewayCode: gateway || undefined,
        userId: userId || undefined,
        identifier: identifier || undefined,
      }),
  });
  const detailQ = useQuery({
    queryKey: ["cbp-payment", detail?.id],
    queryFn: () => cbpApi.getPayment(detail!.id),
    enabled: !!detail,
  });

  function openDetail(p: CbpPayment) {
    setDetail(p);
  }

  const rows = list.data?.data ?? [];
  const pagination = list.data?.pagination;

  return (
    <>
      <Card
        title="سلامت درگاه‌های پرداخت (CBP)"
        action={
          <button className="btn sm" onClick={() => health.refetch()} disabled={health.isFetching}>
            {health.isFetching ? <span className="spin" /> : "بررسی مجدد"}
          </button>
        }
      >
        {health.isLoading ? (
          <Loading label="در حال بررسی سلامت درگاه‌ها…" />
        ) : health.isError ? (
          <ErrorState message={apiError(health.error)} />
        ) : (
          <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12 }}>
            {(health.data ?? []).map((h) => (
              <div key={h.code} className="card" style={{ padding: 14 }}>
                <div className="row spread">
                  <strong>{h.name}</strong>
                  {healthBadge(h)}
                </div>
                <div style={{ marginTop: 8, fontSize: 12, color: "var(--text-faint)" }}>
                  <div dir="ltr" style={{ textAlign: "left" }} className="mono">{h.code}</div>
                  <div>{h.category} / {h.kind}</div>
                  {h.latencyMs !== undefined && <div>تأخیر: <span className="mono">{fmtNum(h.latencyMs, 0)}ms</span></div>}
                  <div>آخرین بررسی: {fmtDate(h.checkedAt)}</div>
                </div>
                {h.message && (
                  <div style={{ marginTop: 8, fontSize: 12 }} dir="ltr" className="mono">
                    {h.message}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="تراکنش‌های CBP"
        action={
          <button className="btn sm" onClick={() => list.refetch()} disabled={list.isFetching}>
            {list.isFetching ? <span className="spin" /> : "به‌روزرسانی"}
          </button>
        }
      >
        <div className="toolbar" style={{ flexWrap: "wrap" }}>
          <select className="select" style={{ width: 130 }} value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">وضعیت: همه</option>
            {STATUS_OPTS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select className="select" style={{ width: 130 }} value={operation} onChange={(e) => { setOperation(e.target.value); setPage(1); }}>
            <option value="">عملیات: همه</option>
            {OP_OPTS.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
          <select className="select" style={{ width: 150 }} value={gateway} onChange={(e) => { setGateway(e.target.value); setPage(1); }}>
            <option value="">درگاه: همه</option>
            {(gateways.data ?? []).map((g) => (
              <option key={g.code} value={g.code}>{g.name}</option>
            ))}
          </select>
          <input className="input" style={{ width: 140 }} placeholder="شناسه کاربر" value={userId} onChange={(e) => { setUserId(e.target.value); setPage(1); }} />
          <input className="input" style={{ width: 140 }} placeholder="شناسه تراکنش" value={identifier} onChange={(e) => { setIdentifier(e.target.value); setPage(1); }} />
        </div>

        {list.isLoading ? (
          <Loading label="در حال بارگذاری تراکنش‌ها…" />
        ) : list.isError ? (
          <ErrorState message={apiError(list.error)} />
        ) : rows.length === 0 ? (
          <Empty label="تراکنشی یافت نشد" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>شناسه</th>
                    <th>عملیات</th>
                    <th>درگاه</th>
                    <th>نوع</th>
                    <th>مبلغ</th>
                    <th>نماد</th>
                    <th>کاربر</th>
                    <th>وضعیت</th>
                    <th>زمان</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.id}>
                      <td className="mono" dir="ltr" style={{ fontSize: 12 }}>{p.identifier}</td>
                      <td>{p.operation}</td>
                      <td className="mono" dir="ltr" style={{ fontSize: 12 }}>{p.gatewayCode ?? "—"}</td>
                      <td>{p.type}</td>
                      <td className="mono">{fmtBySymbol(p.amount, paymentUnit(p))}</td>
                      <td>{symbolLabel(p.symbol)}</td>
                      <td className="mono" dir="ltr" style={{ fontSize: 12 }}>{p.userId?.slice(0, 8)}</td>
                      <td>{paymentBadge(p.status)}</td>
                      <td>{fmtDate(p.createAt)}</td>
                      <td>
                        <button className="btn sm" onClick={() => openDetail(p)}>جزئیات و لاگ</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pagination && pagination.totalPages > 1 && (
              <div className="row spread" style={{ marginTop: 10 }}>
                <div className="faint" style={{ fontSize: 12 }}>
                  صفحه {pagination.page} از {pagination.totalPages} — مجموع {fmtNum(pagination.total, 0)}
                </div>
                <div>
                  <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                    قبلی
                  </button>{" "}
                  <button className="btn ghost sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
                    بعدی
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      {detail && (
        <Modal title={`تراکنش ${detail.identifier}`} onClose={() => setDetail(null)} wide>
          {detailQ.isLoading ? (
            <Loading label="در حال بارگذاری جزئیات…" />
          ) : detailQ.isError ? (
            <ErrorState message={apiError(detailQ.error)} />
          ) : (
            <>
              <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
                <div className="field"><label>وضعیت</label><div>{paymentBadge(detailQ.data?.status ?? detail.status)}</div></div>
                <div className="field"><label>عملیات</label><div>{detailQ.data?.operation ?? detail.operation}</div></div>
                <div className="field"><label>درگاه</label><div className="mono" dir="ltr">{detailQ.data?.gatewayCode ?? detail.gatewayCode ?? "—"}</div></div>
                <div className="field"><label>نوع</label><div>{detailQ.data?.type ?? detail.type}</div></div>
                <div className="field"><label>مبلغ</label><div className="mono">{fmtBySymbol(detailQ.data?.amount ?? detail.amount, paymentUnit(detailQ.data ?? detail))}</div></div>
                <div className="field"><label>نماد</label><div>{symbolLabel(detailQ.data?.symbol)}</div></div>
                <div className="field"><label>کاربر</label><div className="mono" dir="ltr" style={{ fontSize: 12 }}>{detailQ.data?.userId ?? detail.userId}</div></div>
                <div className="field"><label>مرجع خارجی</label><div className="mono" dir="ltr" style={{ fontSize: 12 }}>{detailQ.data?.externalReference ?? detail.externalReference ?? "—"}</div></div>
                <div className="field"><label>stan</label><div className="mono" dir="ltr" style={{ fontSize: 12 }}>{detailQ.data?.stan ?? detail.stan ?? "—"}</div></div>
                <div className="field"><label>ipgReference</label><div className="mono" dir="ltr" style={{ fontSize: 12 }}>{detailQ.data?.ipgReference ?? detail.ipgReference ?? "—"}</div></div>
                <div className="field"><label>زمان ایجاد</label><div>{fmtDate(detailQ.data?.createAt ?? detail.createAt)}</div></div>
                <div className="field"><label>تکمیل</label><div>{fmtDate(detailQ.data?.completedAt ?? detail.completedAt)}</div></div>
              </div>
              {detailQ.data?.notes && <div style={{ marginTop: 10, fontSize: 13 }}>یادداشت: {detailQ.data.notes}</div>}
              {detailQ.data?.gatewayUrl && (
                <div style={{ marginTop: 10 }}>
                  <a className="btn sm" href={detailQ.data.gatewayUrl} target="_blank" rel="noopener noreferrer">صفحه پرداخت</a>
                </div>
              )}
              <JsonBlock label="metadata" value={detailQ.data?.metadata ?? detail.metadata} />
              <JsonBlock label="rawRequest" value={detailQ.data?.rawRequest ?? detail.rawRequest} />
              <JsonBlock label="rawResponse" value={detailQ.data?.rawResponse ?? detail.rawResponse} />
            </>
          )}
        </Modal>
      )}
    </>
  );
}
