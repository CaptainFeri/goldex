import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import { fmtNum, fmtDate } from "../lib/format";
import type { DiscountCoupon, DiscountOverview, DiscountList } from "../api/types";

const COUPON_TYPES = [
  { value: "FIXED", label: "مبلغ ثابت" },
  { value: "PERCENT", label: "درصدی" },
];

function toIsoDateInput(d?: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 16);
}

function couponTypeLabel(t: string): string {
  return COUPON_TYPES.find((x) => x.value === t)?.label ?? t;
}

interface FormState {
  couponType: string;
  discountAmount: number;
  discountPercentage: number;
  maxDiscount: number;
  usageLimit: number;
  expiredAt: string; // datetime-local string
}

const EMPTY: FormState = {
  couponType: "PERCENT",
  discountAmount: 0,
  discountPercentage: 5,
  maxDiscount: 0,
  usageLimit: 1,
  expiredAt: "",
};

function DiscountForm({
  initial,
  onClose,
}: {
  initial?: DiscountCoupon;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!initial?.id;
  const [form, setForm] = useState<FormState>({
    ...EMPTY,
    ...(initial
      ? {
          couponType: initial.couponType ?? "PERCENT",
          discountAmount: Number(initial.discountAmount ?? 0),
          discountPercentage: Number(initial.discountPercentage ?? 0),
          maxDiscount: Number(initial.maxDiscount ?? 0),
          usageLimit: Number(initial.usageLimit ?? 1),
          expiredAt: toIsoDateInput(initial.expiredAt),
        }
      : {}),
  });
  const set = (k: keyof FormState, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: (body: any) =>
      editing ? api.patch(`/admin/discounts/coupons/${initial!.id}`, body) : api.post("/admin/discounts/coupons", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discounts"] });
      onClose();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.expiredAt) return;
    const expiredAt = new Date(form.expiredAt).toISOString();
    const payload: any = {
      couponType: form.couponType,
      discountAmount: Number(form.discountAmount) || 0,
      discountPercentage: Number(form.discountPercentage) || 0,
      maxDiscount: Number(form.maxDiscount) || 0,
      usageLimit: Number(form.usageLimit) || 1,
      expiredAt,
    };
    save.mutate(payload);
  }

  return (
    <Modal title={editing ? "ویرایش کوپن تخفیف" : "ایجاد کوپن تخفیف"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field">
            <label>نوع کوپن</label>
            <select className="select" value={form.couponType} onChange={(e) => set("couponType", e.target.value)} required>
              {COUPON_TYPES.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>تاریخ انقضا</label>
            <input
              className="input"
              type="datetime-local"
              value={form.expiredAt}
              onChange={(e) => set("expiredAt", e.target.value)}
              required
            />
          </div>
          {form.couponType === "FIXED" && (
            <div className="field">
              <label>مبلغ تخفیف</label>
              <input
                className="input mono"
                dir="ltr"
                type="number"
                step="0.01"
                value={form.discountAmount}
                onChange={(e) => set("discountAmount", e.target.value)}
                required
              />
            </div>
          )}
          {form.couponType === "PERCENT" && (
            <>
              <div className="field">
                <label>درصد تخفیف</label>
                <input
                  className="input mono"
                  dir="ltr"
                  type="number"
                  step="0.01"
                  value={form.discountPercentage}
                  onChange={(e) => set("discountPercentage", e.target.value)}
                  required
                />
              </div>
              <div className="field">
                <label>سقف تخفیف</label>
                <input
                  className="input mono"
                  dir="ltr"
                  type="number"
                  step="0.01"
                  value={form.maxDiscount}
                  onChange={(e) => set("maxDiscount", e.target.value)}
                />
              </div>
            </>
          )}
          <div className="field">
            <label>سقف استفاده</label>
            <input
              className="input mono"
              dir="ltr"
              type="number"
              min={1}
              value={form.usageLimit}
              onChange={(e) => set("usageLimit", e.target.value)}
              required
            />
          </div>
        </div>
        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            انصراف
          </button>
          <button className="btn primary" disabled={save.isPending}>
            {save.isPending ? <span className="spin" /> : "ذخیره"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DetailsModal({ id, onClose }: { id: number; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["discount-detail", id],
    queryFn: async () => unwrap<DiscountCoupon>((await api.get(`/admin/discounts/coupons/${id}`)).data),
  });
  const c = q.data;
  return (
    <Modal wide title={c ? `جزئیات کوپن ${c.code}` : "جزئیات کوپن"} onClose={onClose}>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={apiError(q.error)} />
      ) : c ? (
        <div className="grid grid-2">
          <div className="kv">
            <span className="k">کد</span>
            <span className="mono">{c.code}</span>
            <span className="k">نوع</span>
            <span>{couponTypeLabel(c.couponType)}</span>
            <span className="k">مبلغ تخفیف</span>
            <span className="mono">{fmtNum(c.discountAmount, 2)}</span>
            <span className="k">درصد تخفیف</span>
            <span className="mono">{fmtNum(c.discountPercentage, 2)}</span>
            <span className="k">سقف تخفیف</span>
            <span className="mono">{fmtNum(c.maxDiscount, 2)}</span>
          </div>
          <div className="kv">
            <span className="k">وضعیت</span>
            <span>{c.isActive ? <Badge kind="green">فعال</Badge> : <Badge kind="gray">غیرفعال</Badge>}</span>
            <span className="k">سقف استفاده</span>
            <span className="mono">{fmtNum(c.usageLimit)}</span>
            <span className="k">تعداد استفاده</span>
            <span className="mono">{fmtNum(c.usageCount)}</span>
            <span className="k">انقضا</span>
            <span>{fmtDate(c.expiredAt)}</span>
            <span className="k">ایجاد</span>
            <span>{fmtDate(c.createdAt)}</span>
          </div>
        </div>
      ) : null}
    </Modal>
  );
}

export default function DiscountsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<{ open: boolean; initial?: DiscountCoupon }>({ open: false });
  const [detailId, setDetailId] = useState<number | null>(null);
  const pageSize = 20;

  const list = useQuery({
    queryKey: ["discounts", search, page],
    queryFn: async () =>
      unwrap<DiscountList>(
        (await api.get("/admin/discounts/coupons", { params: { pageNumber: page, pageSize, searchKey: search || undefined } })).data
      ),
  });

  const toggle = useMutation({
    mutationFn: (id: number) => api.patch(`/admin/discounts/coupons/${id}/activation`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["discounts"] }),
  });

  const items: DiscountOverview[] = list.data?.discountCouponOverviewList ?? [];
  const totalItems = list.data?.totalItems ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  return (
    <Card
      title={`کوپن‌های تخفیف${totalItems ? ` (${totalItems})` : ""}`}
      action={
        <div className="row" style={{ gap: 8 }}>
          <input
            className="input"
            style={{ width: 220 }}
            placeholder="جستجو روی کد کوپن…"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
          <button
            className="btn primary sm"
            onClick={() => setForm({ open: true })}
          >
            + ایجاد کوپن
          </button>
        </div>
      }
    >
      {toggle.isError && <div className="error-text">{apiError(toggle.error)}</div>}

      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={apiError(list.error)} />
      ) : items.length === 0 ? (
        <Empty label="کوپنی یافت نشد" />
      ) : (
        <>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>کد</th>
                  <th>نوع</th>
                  <th>سقف استفاده</th>
                  <th>استفاده شده</th>
                  <th>وضعیت</th>
                  <th>انقضا</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => {
                  const exhausted = (c.usageCount ?? 0) >= (c.usageLimit ?? 0);
                  return (
                    <tr key={c.id}>
                      <td className="mono" style={{ fontWeight: 700 }}>{c.code}</td>
                      <td>{couponTypeLabel(c.couponType)}</td>
                      <td className="mono">{fmtNum(c.usageLimit)}</td>
                      <td className="mono">
                        {fmtNum(c.usageCount)}{" "}
                        {exhausted && <Badge kind="red">تکمیل</Badge>}
                      </td>
                      <td>{c.isActive ? <Badge kind="green">فعال</Badge> : <Badge kind="gray">غیرفعال</Badge>}</td>
                      <td>{fmtDate(c.expiresAt)}</td>
                      <td>
                        <div className="row">
                          <button className="btn sm" onClick={() => setDetailId(c.id)}>
                            جزئیات
                          </button>
                          <button
                            className="btn sm"
                            disabled={toggle.isPending}
                            onClick={() => toggle.mutate(c.id)}
                          >
                            {c.isActive ? "غیرفعال" : "فعال"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="row" style={{ justifyContent: "center", gap: 8, marginTop: 16 }}>
              <button className="btn ghost sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
                قبلی
              </button>
              <span style={{ fontSize: 13, padding: "4px 8px" }}>{page} / {totalPages}</span>
              <button className="btn ghost sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                بعدی
              </button>
            </div>
          )}
        </>
      )}

      {form.open && (
        <DiscountForm
          initial={form.initial}
          onClose={() => setForm({ open: false })}
        />
      )}

      {detailId !== null && (
        <DetailsModal id={detailId} onClose={() => setDetailId(null)} />
      )}
    </Card>
  );
}
