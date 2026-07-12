import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import { fmtNum, fmtDate, pairLabel } from "../lib/format";

function sideBadge(side: string) {
  const v = String(side ?? "").toUpperCase();
  if (v === "BUY") return <Badge kind="green">خرید</Badge>;
  if (v === "SELL") return <Badge kind="red">فروش</Badge>;
  return <Badge kind="gray">{side ?? "—"}</Badge>;
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

const ORDER_TYPES = ["MARKET", "LIMIT", "QUOTE"];
const STATUSES = ["PENDING", "PARTIALLY_COMPLETED", "COMPLETED", "CANCELLED", "REJECTED"];

function typeLabel(t: string) {
  const map: Record<string, string> = { MARKET: "بازار", LIMIT: "محدود", QUOTE: "استعلام" };
  return map[t] ?? t;
}

export default function OrdersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [side, setSide] = useState("");
  const [orderType, setOrderType] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<any | null>(null);

  const params: any = { limit: 20, offset: page * 20 };
  if (search) params.search = search;
  if (status) params.status = status;
  if (side) params.side = side;
  if (orderType) params.orderType = orderType;

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
        <button className="btn ghost sm" onClick={() => { setSearch(""); setStatus(""); setSide(""); setOrderType(""); setPage(0); }}>
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
                    <td className="mono">{fmtNum(o.quantity, 4)}</td>
                    <td className="mono">{fmtNum(o.price ?? o.averagePrice, 2)}</td>
                    <td className="mono">{fmtNum(o.executedQuantity, 4)}</td>
                    <td className="mono">{fmtNum(o.totalValue, 0)}</td>
                    <td>{statusBadge(o.status)}</td>
                    <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>{fmtDate(o.createdAt ?? o.createAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn ghost sm" onClick={() => setSelected(o)}>جزئیات</button>
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

      {selected && (
        <Modal title={`جزئیات سفارش ${selected.orderCode ?? selected.id?.slice(0, 8)}`} onClose={() => setSelected(null)} wide>
          <div className="grid grid-3" style={{ marginBottom: 16 }}>
            <div className="field">
              <label>کد سفارش</label>
              <div className="mono">{selected.orderCode ?? "—"}</div>
            </div>
            <div className="field">
              <label>کاربر</label>
              <div>{selected.user?.firstName ?? ""} {selected.user?.lastName ?? ""} ({selected.user?.phone ?? selected.user?.email ?? "—"})</div>
            </div>
            <div className="field">
              <label>شناسه کاربر</label>
              <div className="mono" style={{ fontSize: 12 }}>{selected.userId}</div>
            </div>
            <div className="field">
              <label>جفت‌ارز</label>
              <div>{selected.pricePair ? pairLabel(selected.pricePair) : "—"}</div>
            </div>
            <div className="field">
              <label>سمت</label>
              <div>{sideBadge(selected.side)}</div>
            </div>
            <div className="field">
              <label>نوع</label>
              <div>{typeLabel(selected.orderType)}</div>
            </div>
            <div className="field">
              <label>مقدار (گرم)</label>
              <div className="mono">{fmtNum(selected.quantity, 4)}</div>
            </div>
            <div className="field">
              <label>قیمت</label>
              <div className="mono">{fmtNum(selected.price ?? selected.averagePrice, 2)}</div>
            </div>
            <div className="field">
              <label>اجرا شده</label>
              <div className="mono">{fmtNum(selected.executedQuantity, 4)}</div>
            </div>
            <div className="field">
              <label>ارزش کل</label>
              <div className="mono">{fmtNum(selected.totalValue, 0)}</div>
            </div>
            <div className="field">
              <label>کارمزد</label>
              <div className="mono">{fmtNum(selected.commission, 2)}</div>
            </div>
            <div className="field">
              <label>وضعیت</label>
              <div>{statusBadge(selected.status)}</div>
            </div>
          </div>
          <div className="grid grid-2">
            <div className="field">
              <label>ایجاد</label>
              <div>{fmtDate(selected.createdAt ?? selected.createAt)}</div>
            </div>
            <div className="field">
              <label>آخرین بروزرسانی</label>
              <div>{fmtDate(selected.updatedAt)}</div>
            </div>
            {selected.completedAt && (
              <div className="field">
                <label>تکمیل شده</label>
                <div>{fmtDate(selected.completedAt)}</div>
              </div>
            )}
            {selected.cancelledAt && (
              <div className="field">
                <label>لغو شده</label>
                <div>{fmtDate(selected.cancelledAt)}</div>
              </div>
            )}
            {selected.providerOrderId && (
              <div className="field">
                <label>شناسه تأمین‌کننده</label>
                <div className="mono" style={{ fontSize: 12 }}>{selected.providerOrderId}</div>
              </div>
            )}
          </div>
          {selected.notes && (
            <div className="field" style={{ marginTop: 12 }}>
              <label>یادداشت</label>
              <div>{selected.notes}</div>
            </div>
          )}
          {selected.metadata?.adminNote && (
            <div className="field" style={{ marginTop: 8 }}>
              <label>یادداشت ادمین</label>
              <div>{selected.metadata.adminNote}</div>
            </div>
          )}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn ghost" onClick={() => setSelected(null)}>بستن</button>
          </div>
        </Modal>
      )}
    </Card>
  );
}
