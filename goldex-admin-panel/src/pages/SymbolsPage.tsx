import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import { fmtNum } from "../lib/format";
import { GAIN_TYPES, SYMBOL_TYPES, UNIT_TYPES, PAYMENT_GATEWAYS, MARKET_TYPES_ENUM, DEPOSIT_TYPES, WITHDRAW_TYPES, SYMBOL_TYPE_DEPOSIT_MAP, SYMBOL_TYPE_WITHDRAW_MAP } from "../lib/enums";

function toArray(x: any): any[] {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.items)) return x.items;
  if (x && Array.isArray(x.data)) return x.data;
  return [];
}

function getDefaultDepositTypes(symbolType: string): string[] {
  return SYMBOL_TYPE_DEPOSIT_MAP[symbolType] ?? ["manual"];
}

function getDefaultWithdrawTypes(symbolType: string): string[] {
  return SYMBOL_TYPE_WITHDRAW_MAP[symbolType] ?? ["manual"];
}

const EMPTY = {
  name: "",
  slug: "",
  picPath: "",
  gain: 0,
  gainType: "number",
  symbolType: "material",
  unitType: "number",
  marketType: "formal",
  paymentGateWayType: "up",
  hasPaymentGateway: false,
  isActive: true,
  depositTypes: getDefaultDepositTypes("material"),
  withdrawTypes: getDefaultWithdrawTypes("material"),
};

function toggle(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

function SymbolForm({ initial, onClose }: { initial?: any; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = !!initial?.id;
  const [form, setForm] = useState<any>({ ...EMPTY, ...initial });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: (body: any) =>
      editing ? api.patch(`/admin/symbols/${initial.id}`, body) : api.post("/admin/symbols", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["symbols"] });
      onClose();
    },
  });

  function handleSymbolTypeChange(v: string) {
    if (!editing) {
      setForm((f: any) => ({
        ...f,
        symbolType: v,
        depositTypes: getDefaultDepositTypes(v),
        withdrawTypes: getDefaultWithdrawTypes(v),
      }));
    } else {
      set("symbolType", v);
    }
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      name: form.name,
      slug: form.slug,
      picPath: form.picPath || "/icons/default.png",
      gain: Number(form.gain) || 0,
      gainType: form.gainType,
      symbolType: form.symbolType,
      unitType: form.unitType,
      marketType: form.marketType,
      hasPaymentGateway: !!form.hasPaymentGateway,
      isActive: !!form.isActive,
      depositTypes: form.depositTypes,
      withdrawTypes: form.withdrawTypes,
    };
    if (form.symbolType === "rial") {
      payload.paymentGateWayType = form.paymentGateWayType;
      payload.hasPaymentGateway = true;
    }
    save.mutate(payload);
  }

  return (
    <Modal title={editing ? "ویرایش نماد" : "افزودن نماد"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field">
            <label>نام</label>
            <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="field">
            <label>اسلاگ (مثل XAU)</label>
            <input className="input mono" dir="ltr" value={form.slug} onChange={(e) => set("slug", e.target.value)} required />
          </div>
          <div className="field">
            <label>نوع نماد</label>
            <select className="select" value={form.symbolType} onChange={(e) => handleSymbolTypeChange(e.target.value)}>
              {SYMBOL_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>نوع بازار</label>
            <select className="select" value={form.marketType} onChange={(e) => set("marketType", e.target.value)}>
              {MARKET_TYPES_ENUM.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>واحد</label>
            <select className="select" value={form.unitType} onChange={(e) => set("unitType", e.target.value)}>
              {UNIT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>سود (gain)</label>
            <input className="input mono" dir="ltr" value={form.gain} onChange={(e) => set("gain", e.target.value)} />
          </div>
          <div className="field">
            <label>نوع سود</label>
            <select className="select" value={form.gainType} onChange={(e) => set("gainType", e.target.value)}>
              {GAIN_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          {form.symbolType === "rial" && (
            <div className="field">
              <label>درگاه پرداخت (الزامی برای ریال)</label>
              <select className="select" value={form.paymentGateWayType} onChange={(e) => set("paymentGateWayType", e.target.value)} required>
                {PAYMENT_GATEWAYS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          )}
          <div className="field">
            <label>مسیر آیکون</label>
            <input className="input mono" dir="ltr" value={form.picPath} onChange={(e) => set("picPath", e.target.value)} placeholder="/icons/xau.png" />
          </div>
        </div>
        <div className="grid grid-2" style={{ margin: "12px 0" }}>
          <div className="field">
            <label>نوع واریز</label>
            <div className="checkbox-group">
              {DEPOSIT_TYPES.map((o) => (
                <label key={o.value} className="row" style={{ gap: 6, margin: "4px 0" }}>
                  <input
                    type="checkbox"
                    checked={(form.depositTypes || []).includes(o.value)}
                    onChange={() => set("depositTypes", toggle(form.depositTypes || [], o.value))}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
          <div className="field">
            <label>نوع برداشت</label>
            <div className="checkbox-group">
              {WITHDRAW_TYPES.map((o) => (
                <label key={o.value} className="row" style={{ gap: 6, margin: "4px 0" }}>
                  <input
                    type="checkbox"
                    checked={(form.withdrawTypes || []).includes(o.value)}
                    onChange={() => set("withdrawTypes", toggle(form.withdrawTypes || [], o.value))}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 20, margin: "4px 0 16px" }}>
          {form.symbolType !== "rial" && (
            <label className="row" style={{ gap: 6 }}>
              <input type="checkbox" checked={form.hasPaymentGateway} onChange={(e) => set("hasPaymentGateway", e.target.checked)} />
              دارای درگاه پرداخت
            </label>
          )}
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
            فعال
          </label>
        </div>
        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={save.isPending}>{save.isPending ? <span className="spin" /> : "ذخیره"}</button>
        </div>
      </form>
    </Modal>
  );
}

const SYMBOL_TYPE_OPTIONS = [
  { value: "", label: "همه انواع" },
  ...SYMBOL_TYPES,
];

function DetailsModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["symbol-detail", id],
    queryFn: async () => unwrap<any>((await api.get(`/admin/symbols/${id}`)).data),
  });
  const s = q.data;
  return (
    <Modal title="جزئیات نماد" onClose={onClose}>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={apiError(q.error)} />
      ) : s ? (
        <div className="kv">
          <span className="k">شناسه</span>
          <span className="mono" style={{ fontSize: 12 }}>{s.id}</span>
          <span className="k">نام</span>
          <span>{s.name ?? "—"}</span>
          <span className="k">اسلاگ</span>
          <span className="mono">{s.slug ?? "—"}</span>
          <span className="k">نوع</span>
          <span>{s.symbolType ?? "—"}</span>
          <span className="k">بازار</span>
          <span>{s.marketType === "informal" ? "غیررسمی" : "رسمی"}</span>
          <span className="k">واحد</span>
          <span>{s.unitType ?? "—"}</span>
          <span className="k">وضعیت</span>
          <span>{s.isActive ? <Badge kind="green">فعال</Badge> : <Badge kind="gray">غیرفعال</Badge>}</span>
          <span className="k">سود (gain)</span>
          <span className="mono">{fmtNum(s.gain, 4)}</span>
          <span className="k">نوع سود</span>
          <span>{s.gainType ?? "—"}</span>
          <span className="k">مسیر آیکون</span>
          <span className="mono">{s.picPath || "—"}</span>
          <span className="k">درگاه پرداخت</span>
          <span>{s.paymentGateWayType ?? "—"}</span>
          <span className="k">نوع واریز</span>
          <span>{(s.depositTypes && Array.isArray(s.depositTypes) ? s.depositTypes.join("، ") : "—") || "—"}</span>
          <span className="k">نوع برداشت</span>
          <span>{(s.withdrawTypes && Array.isArray(s.withdrawTypes) ? s.withdrawTypes.join("، ") : "—") || "—"}</span>
        </div>
      ) : null}
    </Modal>
  );
}

export default function SymbolsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");

  const list = useQuery({
    queryKey: ["symbols"],
    queryFn: async () => unwrap<any>((await api.get("/admin/symbols/active")).data),
  });
  const toggle = useMutation({
    mutationFn: (p: { id: string; isActive: boolean }) => api.patch(`/admin/symbols/${p.id}/status`, { isActive: p.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["symbols"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/symbols/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["symbols"] }),
  });

  let symbols = toArray(list.data);
  if (filterType) symbols = symbols.filter((s) => s.symbolType === filterType);

  return (
    <Card
      title="نمادها"
      action={
        <div className="row" style={{ gap: 8 }}>
          <select className="select" value={filterType} onChange={(e) => setFilterType(e.target.value)} style={{ minWidth: 130 }}>
            {SYMBOL_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button className="btn primary sm" onClick={() => setForm({ open: true })}>+ افزودن نماد</button>
        </div>
      }
    >
      {(toggle.isError || remove.isError) && <div className="error-text">{apiError(toggle.error || remove.error)}</div>}
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={apiError(list.error)} />
      ) : symbols.length === 0 ? (
        <Empty />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>نام</th>
                <th>اسلاگ</th>
                <th>نوع</th>
                <th>بازار</th>
                <th>واحد</th>
                <th>وضعیت</th>
                <th>واریز</th>
                <th>برداشت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {symbols.map((s) => (
                <tr key={s.id}>
                  <td>{s.name ?? "—"}</td>
                  <td className="mono">{s.slug ?? "—"}</td>
                  <td>{s.symbolType ?? "—"}</td>
                  <td>{s.marketType === "informal" ? <Badge kind="gold">غیررسمی</Badge> : <Badge kind="green">رسمی</Badge>}</td>
                  <td>{s.unitType ?? "—"}</td>
                  <td>{s.isActive ? <Badge kind="green">فعال</Badge> : <Badge kind="gray">غیرفعال</Badge>}</td>
                  <td style={{ fontSize: 12 }}>{s.depositTypes?.join(", ") || "—"}</td>
                  <td style={{ fontSize: 12 }}>{s.withdrawTypes?.join(", ") || "—"}</td>
                  <td>
                    <div className="row">
                      <button className="btn sm" onClick={() => setDetailId(s.id)}>جزئیات</button>
                      <button className="btn sm" onClick={() => setForm({ open: true, initial: s })}>ویرایش</button>
                      <button className="btn sm" disabled={toggle.isPending} onClick={() => toggle.mutate({ id: s.id, isActive: !s.isActive })}>
                        {s.isActive ? "غیرفعال" : "فعال"}
                      </button>
                      <button className="btn sm danger" disabled={remove.isPending} onClick={() => window.confirm("حذف نماد؟") && remove.mutate(s.id)}>
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailId && <DetailsModal id={detailId} onClose={() => setDetailId(null)} />}
      {form.open && <SymbolForm initial={form.initial} onClose={() => setForm({ open: false })} />}
    </Card>
  );
}
