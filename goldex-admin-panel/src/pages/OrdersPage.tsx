import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import { fmtNum, fmtDate, pairLabel } from "../lib/format";
import type { AdminOrder } from "../api/types";

function sideBadge(side: string) {
  const v = String(side ?? "").toUpperCase();
  if (v === "BUY") return <Badge kind="green">خرید</Badge>;
  if (v === "SELL") return <Badge kind="red">فروش</Badge>;
  return <Badge kind="gray">{side ?? "—"}</Badge>;
}

/**
 * Credit-funded orders draw on an admin-granted credit line; wallet orders
 * spend the customer's own deposited balance. Different money, different
 * settlement — the list says which without opening the row.
 */
function fundingBadge(o: any) {
  const v = String(o?.fundingSource ?? (o?.isCreditLinked ? "CREDIT" : "WALLET")).toUpperCase();
  if (v === "CREDIT") {
    return (
      <div>
        <Badge kind="gold">اعتباری</Badge>
        {o?.credit?.creditCode && (
          <div className="mono muted" style={{ fontSize: 11, marginTop: 2 }}>{o.credit.creditCode}</div>
        )}
      </div>
    );
  }
  return <Badge kind="blue">کیف پول</Badge>;
}

function statusBadge(s: string) {
  const v = String(s ?? "").toUpperCase();
  if (v === "COMPLETED") return <Badge kind="green">انجام شد</Badge>;
  if (v === "CANCELLED") return <Badge kind="red">لغو شد</Badge>;
  if (v === "REJECTED") return <Badge kind="red">رد شد</Badge>;
  if (v === "PENDING") return <Badge kind="gold">در انتظار</Badge>;
  if (v === "PARTIALLY_COMPLETED") return <Badge kind="gold">جزئی</Badge>;
  return <Badge kind="gray">{s ?? "—"}</Badge>;
}

function AdminEditModal({ orderId, order, onClose }: { orderId: string; order: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState(order?.status ?? "");
  const [price, setPrice] = useState(String(order?.price ?? ""));
  const [notes, setNotes] = useState(order?.notes ?? "");

  const save = useMutation({
    mutationFn: (body: any) => api.put(`/admin/orders/${orderId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      onClose();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {};
    if (status) payload.status = status;
    if (price) payload.price = Number(price);
    if (notes) payload.notes = notes;
    save.mutate(payload);
  }

  return (
    <Modal title="ویرایش سفارش توسط ادمین" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="kv" style={{ marginBottom: 12 }}>
          <span className="k">کد سفارش</span>
          <span className="mono">{order?.orderCode ?? orderId?.slice(0, 8)}</span>
        </div>
        <div className="field">
          <label>وضعیت جدید</label>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">بدون تغییر</option>
            <option value="PENDING">در انتظار</option>
            <option value="COMPLETED">انجام شد</option>
            <option value="CANCELLED">لغو شد</option>
            <option value="REJECTED">رد شد</option>
          </select>
        </div>
        <div className="field">
          <label>قیمت جدید (اختیاری)</label>
          <input className="input mono" dir="ltr" type="number" step="0.0001" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="field">
          <label>یادداشت ادمین</label>
          <textarea className="input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={save.isPending}>{save.isPending ? <span className="spin" /> : "ذخیره"}</button>
        </div>
      </form>
    </Modal>
  );
}

const ORDER_TYPES = ["MARKET", "LIMIT", "QUOTE"];
const STATUSES = ["PENDING", "PARTIALLY_COMPLETED", "COMPLETED", "CANCELLED", "REJECTED"];

function typeLabel(t: string) {
  const map: Record<string, string> = { MARKET: "بازار", LIMIT: "محدود", QUOTE: "استعلام" };
  return map[t] ?? t;
}

function OrderDetailsModal({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["admin-order-detail", orderId],
    queryFn: async () => unwrap<AdminOrder>((await api.get(`/admin/orders/${orderId}`)).data),
  });
  const order = q.data;
  return (
    <Modal title={`جزئیات سفارش ${order?.orderCode ?? orderId?.slice(0, 8)}`} onClose={onClose} wide>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={apiError(q.error)} />
      ) : order ? (
        <>
          <div className="grid grid-3" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>کد سفارش</label>
              <div className="mono">{order.orderCode ?? "—"}</div>
            </div>
            <div className="field">
              <label>کاربر</label>
              <div>{order.user?.firstName ?? ""} {order.user?.lastName ?? ""} ({order.user?.phone ?? order.user?.email ?? "—"})</div>
            </div>
            <div className="field">
              <label>شناسه کاربر</label>
              <div className="mono" style={{ fontSize: 12 }}>{order.userId}</div>
            </div>
            <div className="field">
              <label>منبع تأمین</label>
              <div>{fundingBadge(order)}</div>
            </div>
            <div className="field">
              <label>جفت‌ارز</label>
              <div>{order.pricePair ? pairLabel(order.pricePair) : `${order.base ?? ""}/${order.quote ?? ""}`}</div>
            </div>
            <div className="field">
              <label>سمت</label>
              <div>{sideBadge(order.side)}</div>
            </div>
            <div className="field">
              <label>نوع</label>
              <div>{typeLabel(order.orderType)}</div>
            </div>
            <div className="field">
              <label>مقدار</label>
              <div className="mono">{fmtNum(order.quantity, 4)}</div>
            </div>
            <div className="field">
              <label>قیمت</label>
              <div className="mono">{fmtNum(order.price ?? order.averagePrice, 2)}</div>
            </div>
            <div className="field">
              <label>اجرا شده</label>
              <div className="mono">{fmtNum(order.executedQuantity, 4)}</div>
            </div>
            <div className="field">
              <label>ارزش کل</label>
              <div className="mono">{fmtNum(order.totalValue, 0)}</div>
            </div>
            <div className="field">
              <label>کارمزد</label>
              <div className="mono">{fmtNum(order.commission, 2)}</div>
            </div>
            <div className="field">
              <label>مسیر قیمت</label>
              <div>
                {order.routeMode === "BRIDGE" ? (
                  <>
                    <Badge kind="gold">غیرمستقیم</Badge>
                    <div className="mono muted" style={{ fontSize: 11, marginTop: 3 }}>
                      {(order.routeLegs ?? []).map((l: any) => l.pair).join(" × ") || "—"}
                    </div>
                    {order.bridgeRate != null && (
                      <div className="mono muted" style={{ fontSize: 11 }}>
                        نرخ واسط: {fmtNum(order.bridgeRate, 4)}
                      </div>
                    )}
                  </>
                ) : order.routeMode === "DIRECT" ? (
                  <Badge kind="green">مستقیم</Badge>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
            </div>
            <div className="field">
              <label>وضعیت</label>
              <div>{statusBadge(order.status)}</div>
            </div>
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label>ایجاد</label>
              <div>{fmtDate(order.createdAt ?? order.createAt)}</div>
            </div>
            <div className="field">
              <label>آخرین بروزرسانی</label>
              <div>{fmtDate(order.updatedAt)}</div>
            </div>
            {order.completedAt && (
              <div className="field">
                <label>تکمیل شده</label>
                <div>{fmtDate(order.completedAt)}</div>
              </div>
            )}
            {order.cancelledAt && (
              <div className="field">
                <label>لغو شده</label>
                <div>{fmtDate(order.cancelledAt)}</div>
              </div>
            )}
            {order.providerOrderId && (
              <div className="field">
                <label>شناسه تأمین‌کننده</label>
                <div className="mono" style={{ fontSize: 12 }}>{order.providerOrderId}</div>
              </div>
            )}
          </div>
          {order.notes && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>یادداشت</label>
              <div>{order.notes}</div>
            </div>
          )}
        </>
      ) : null}
    </Modal>
  );
}

export default function OrdersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [side, setSide] = useState("");
  const [orderType, setOrderType] = useState("");
  const [fundingSource, setFundingSource] = useState("");
  const [page, setPage] = useState(0);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);

  const params: any = { limit: 20, offset: page * 20 };
  if (search) params.search = search;
  if (status) params.status = status;
  if (side) params.side = side;
  if (orderType) params.orderType = orderType;
  if (fundingSource) params.fundingSource = fundingSource;

  const list = useQuery({
    queryKey: ["admin-orders", params],
    queryFn: async () => unwrap<any>((await api.get("/admin/orders", { params })).data),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/orders/${id}/cancel`, { data: { reason: "Cancelled by admin" } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-orders"] }),
  });

  const orders: any[] = list.data?.orders ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <Card
      title="مدیریت سفارش‌ها"
      action={
        <span className="muted" style={{ fontSize: 13 }}>
          {total > 0 ? `${total} سفارش` : ""}
        </span>
      }
    >
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <input
          className="input"
          placeholder="جستجوی کد سفارش یا کاربر…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
          style={{ width: 260 }}
        />
        <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">همه وضعیت‌ها</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="select" value={side} onChange={(e) => { setSide(e.target.value); setPage(0); }}>
          <option value="">همه سمت‌ها</option>
          <option value="BUY">خرید</option>
          <option value="SELL">فروش</option>
        </select>
        <select className="select" value={orderType} onChange={(e) => { setOrderType(e.target.value); setPage(0); }}>
          <option value="">همه انواع</option>
          {ORDER_TYPES.map((t) => <option key={t} value={t}>{typeLabel(t)}</option>)}
        </select>
        <select className="select" value={fundingSource} onChange={(e) => { setFundingSource(e.target.value); setPage(0); }}>
          <option value="">همه منابع تأمین</option>
          <option value="CREDIT">اعتباری</option>
          <option value="WALLET">کیف پول (واریزی)</option>
        </select>
        <button className="btn ghost sm" onClick={() => { setSearch(""); setStatus(""); setSide(""); setOrderType(""); setFundingSource(""); setPage(0); }}>
          پاک کردن فیلترها
        </button>
      </div>

      {cancel.isError && <div className="error-text" style={{ marginBottom: 12 }}>{apiError(cancel.error)}</div>}

      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={apiError(list.error)} />
      ) : orders.length === 0 ? (
        <Empty label="سفارشی یافت نشد" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>کد سفارش</th>
                  <th>کاربر</th>
                  <th>جفت‌ارز</th>
                  <th>سمت</th>
                  <th>نوع</th>
                  <th>منبع تأمین</th>
                  <th>مقدار (g)</th>
                  <th>قیمت</th>
                  <th>اجرا شده</th>
                  <th>ارزش</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="mono" style={{ fontSize: 12 }}>{o.orderCode ?? o.id?.slice(0, 8)}</td>
                    <td style={{ fontSize: 13 }}>
                      <div>{o.user?.firstName ?? ""} {o.user?.lastName ?? ""}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{o.user?.phone ?? o.user?.email ?? "—"}</div>
                    </td>
                    <td>{o.pricePair ? pairLabel(o.pricePair) : "—"}</td>
                    <td>{sideBadge(o.side)}</td>
                    <td style={{ fontSize: 13 }}>{typeLabel(o.orderType)}</td>
                    <td>{fundingBadge(o)}</td>
                    <td className="mono">{fmtNum(o.quantity, 4)}</td>
                    <td className="mono">{fmtNum(o.price ?? o.averagePrice, 2)}</td>
                    <td className="mono">{fmtNum(o.executedQuantity, 4)}</td>
                    <td className="mono">{fmtNum(o.totalValue, 0)}</td>
                    <td>{statusBadge(o.status)}</td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(o.createdAt ?? o.createAt)}</td>
                      <td>
                        <div className="row" style={{ gap: 4 }}>
                          <button className="btn ghost sm" onClick={() => setDetailId(o.id)}>جزئیات</button>
                          <button className="btn ghost sm" onClick={() => setEditOrderId(o.id)}>ویرایش</button>
                          {(o.status === "PENDING" || o.status === "PARTIALLY_COMPLETED") && (
                            <button
                              className="btn sm danger"
                              disabled={cancel.isPending}
                              onClick={() => window.confirm("لغو سفارش " + (o.orderCode ?? o.id) + "؟") && cancel.mutate(o.id)}
                            >
                              لغو
                            </button>
                          )}
                        </div>
                      </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 16 }}>
              <button className="btn ghost sm" disabled={page === 0} onClick={() => setPage(page - 1)}>قبلی</button>
              <span style={{ fontSize: 13, padding: "4px 8px" }}>{page + 1} / {totalPages}</span>
              <button className="btn ghost sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>بعدی</button>
            </div>
          )}
        </>
      )}

      {detailId && <OrderDetailsModal orderId={detailId} onClose={() => setDetailId(null)} />}
      {editOrderId && <AdminEditModal orderId={editOrderId} order={orders.find((o) => o.id === editOrderId)} onClose={() => setEditOrderId(null)} />}
    </Card>
  );
}
