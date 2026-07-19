import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Badge, Loading, ErrorState, Empty, Modal } from "../components/ui";

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const FEATURE_LABELS: Record<string, string> = {
  TRADING_DAILY_LIMIT: "محدودیت روزانه معاملات",
  TRADING_MAX_ORDER_VALUE: "حداکثر ارزش هر سفارش",
  TRADING_MAX_OPEN_ORDERS: "حداکثر سفارش‌های باز",
  WALLET_WITHDRAWAL_DAILY_LIMIT: "محدودیت روزانه برداشت",
  WALLET_WITHDRAWAL_PER_TX_LIMIT: "محدودیت هر تراکنش برداشت",
  CREDIT_MAX_AMOUNT: "حداکثر مبلغ اعتبار",
  CREDIT_MAX_DURATION_DAYS: "حداکثر مدت اعتبار (روز)",
  TELEGRAM_BOT_ENABLED: "ربات تلگرام",
  API_ACCESS_ENABLED: "دسترسی API",
  ELITE_TRADE_ENABLED: "معاملات نخبگان",
  PRIORITY_SUPPORT: "پشتیبانیpriority",
  MAX_MARKET_TYPES: "تعداد بازارهای مجاز",
};

function renderFeatureValue(key: string, val: any): string {
  if (val === null || val === undefined) return "—";
  if (typeof val === "boolean") return val ? "فعال" : "غیرفعال";
  if (typeof val === "object") {
    if ("enabled" in val) return val.enabled ? "فعال" : "غیرفعال";
    if ("amount" in val && "currency" in val) {
      if (val.amount === 0) return "نامحدود";
      return `${val.amount.toLocaleString("fa-IR")} ${val.currency}`;
    }
    return JSON.stringify(val);
  }
  if (typeof val === "number") {
    if (val === 0) return "نامحدود";
    if (val >= 999) return "نامحدود";
    return val.toLocaleString("fa-IR");
  }
  return String(val);
}

export default function LevelsPage() {
  const [modal, setModal] = useState<null | "create" | "edit" | "assign" | "features">(null);
  const [selected, setSelected] = useState<any>(null);
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["user-levels"],
    queryFn: async () => unwrap<any[]>((await api.get("/admin/user-levels")).data),
  });

  const create = useMutation({
    mutationFn: (body: any) => api.post("/admin/user-levels", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["user-levels"] }); setModal(null); },
  });

  const update = useMutation({
    mutationFn: ({ id, ...body }: any) => api.patch(`/admin/user-levels/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["user-levels"] }); setModal(null); setSelected(null); },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/user-levels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["user-levels"] }),
  });

  const assign = useMutation({
    mutationFn: (body: any) => api.post("/admin/user-levels/assign", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["user-levels"] }); setModal(null); setSelected(null); },
  });

  return (
    <Card
      title="مدیریت سطوح کاربری"
      action={
        <button className="btn" onClick={() => setModal("create")}>ایجاد سطح جدید</button>
      }
    >
      {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={apiError(list.error)} /> :
      !list.data?.length ? <Empty label="هیچ سطحی تعریف نشده است" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>نام</th>
                <th>Slug</th>
                <th>اولویت</th>
                <th>پیش‌فرض</th>
                <th>امکانات</th>
                <th>ایجاد</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {(list.data as any[]).map((l) => (
                <tr key={l.id}>
                  <td><strong>{l.name}</strong></td>
                  <td><code>{l.slug}</code></td>
                  <td>{l.priority}</td>
                  <td>{l.isDefault ? <Badge kind="green">پیش‌فرض</Badge> : "—"}</td>
                  <td>
                    <button className="btn ghost sm" onClick={() => { setSelected(l); setModal("features"); }}>
                      مشاهده امکانات
                    </button>
                  </td>
                  <td>{fmtDate(l.createdAt)}</td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn sm" onClick={() => { setSelected(l); setModal("edit"); }}>ویرایش</button>
                      <button className="btn sm" onClick={() => { setSelected(l); setModal("assign"); }}>اختصاص به کاربر</button>
                      {!l.isDefault && (
                        <button className="btn sm" style={{ background: "var(--red)" }} onClick={() => { if (confirm(`آیا از حذف سطح "${l.name}" اطمینان دارید؟`)) remove.mutate(l.id); }}>
                          حذف
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal === "create" && (
        <LevelFormModal title="ایجاد سطح جدید" onClose={() => setModal(null)} onSave={(d) => create.mutate(d)} loading={create.isPending} />
      )}
      {modal === "edit" && selected && (
        <LevelFormModal title={`ویرایش سطح ${selected.name}`} initial={selected} onClose={() => { setModal(null); setSelected(null); }} onSave={(d) => update.mutate({ id: selected.id, ...d })} loading={update.isPending} />
      )}
      {modal === "assign" && selected && (
        <AssignLevelModal level={selected} onClose={() => { setModal(null); setSelected(null); }} onSave={(d) => assign.mutate(d)} loading={assign.isPending} />
      )}
      {modal === "features" && selected && (
        <FeaturesModal level={selected} onClose={() => { setModal(null); setSelected(null); }} />
      )}
    </Card>
  );
}

const FEATURE_TYPE: Record<string, "boolean" | "numeric" | "limit"> = {
  TRADING_DAILY_LIMIT: "limit",
  TRADING_MAX_ORDER_VALUE: "limit",
  TRADING_MAX_OPEN_ORDERS: "numeric",
  WALLET_WITHDRAWAL_DAILY_LIMIT: "limit",
  WALLET_WITHDRAWAL_PER_TX_LIMIT: "limit",
  CREDIT_MAX_AMOUNT: "limit",
  CREDIT_MAX_DURATION_DAYS: "numeric",
  TELEGRAM_BOT_ENABLED: "boolean",
  API_ACCESS_ENABLED: "boolean",
  ELITE_TRADE_ENABLED: "boolean",
  PRIORITY_SUPPORT: "boolean",
  MAX_MARKET_TYPES: "numeric",
};

function initFeatures(initial?: any): Record<string, any> {
  const base: Record<string, any> = {};
  for (const key of Object.keys(FEATURE_TYPE)) {
    const ft = FEATURE_TYPE[key];
    if (ft === "boolean") base[key] = { enabled: initial?.features?.[key]?.enabled ?? false };
    else if (ft === "limit") base[key] = { amount: initial?.features?.[key]?.amount ?? 0, currency: "IRR" };
    else base[key] = initial?.features?.[key] ?? 0;
  }
  return base;
}

function LevelFormModal({ title, initial, onClose, onSave, loading }: {
  title: string; initial?: any; onClose: () => void; onSave: (d: any) => void; loading: boolean;
}) {
  const [form, setForm] = useState({
    name: initial?.name ?? "",
    slug: initial?.slug ?? "",
    description: initial?.description ?? "",
    priority: initial?.priority ?? 0,
    isDefault: initial?.isDefault ?? false,
    features: initFeatures(initial),
  });
  const [showFeatures, setShowFeatures] = useState(false);
  const [err, setErr] = useState("");

  const setFeature = (key: string, patch: any) => {
    setForm((f) => ({ ...f, features: { ...f.features, [key]: { ...f.features[key], ...patch } } }));
  };

  const handle = () => {
    if (!form.name.trim() || !form.slug.trim()) { setErr("نام و Slug الزامی هستند"); return; }
    setErr("");
    onSave({ name: form.name, slug: form.slug, description: form.description, priority: form.priority, isDefault: form.isDefault, features: form.features });
  };

  return (
    <Modal title={title} onClose={onClose} wide>
      <form className="modal-form" onSubmit={(e) => { e.preventDefault(); handle(); }}>
        {err && <div className="form-err">{err}</div>}
        <div className="form-grid">
          <div className="field">
            <label>نام</label>
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="مثال: برنز" />
          </div>
          <div className="field">
            <label>Slug</label>
            <input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} placeholder="مثال: bronze" dir="ltr" />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>توضیحات</label>
            <textarea className="input" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="field">
            <label>اولویت</label>
            <input className="input" type="number" min={0} value={form.priority} onChange={(e) => setForm({ ...form, priority: +e.target.value })} />
          </div>
          <div className="field">
            <label className="checkbox-label">
              <input type="checkbox" checked={form.isDefault} onChange={(e) => setForm({ ...form, isDefault: e.target.checked })} />
              <span>سطح پیش‌فرض</span>
            </label>
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <button type="button" className="btn ghost" style={{ fontSize: "0.8rem" }} onClick={() => setShowFeatures(!showFeatures)}>
              {showFeatures ? "▼" : "▶"} امکانات سطح ({Object.keys(form.features).length} مورد)
            </button>
          </div>

          {showFeatures && (
            <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 8, maxHeight: 320, overflowY: "auto" }}>
              {Object.entries(FEATURE_TYPE).map(([key, type]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: "var(--bg)", borderRadius: 6, fontSize: "0.82rem" }}>
                  <div style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 500 }}>{FEATURE_LABELS[key] || key}</div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-faint)" }}><code>{key}</code></div>
                  </div>
                  {type === "boolean" ? (
                    <label className="checkbox-label" style={{ margin: 0 }}>
                      <input type="checkbox" checked={form.features[key]?.enabled ?? false} onChange={(e) => setFeature(key, { enabled: e.target.checked })} />
                      <span>{form.features[key]?.enabled ? "فعال" : "غیرفعال"}</span>
                    </label>
                  ) : type === "numeric" ? (
                    <input className="input mono" type="number" min={0} style={{ width: 100, textAlign: "center" }}
                      value={form.features[key] ?? 0} onChange={(e) => setForm((f) => ({ ...f, features: { ...f.features, [key]: +e.target.value } }))} />
                  ) : (
                    <div className="row" style={{ gap: 4, alignItems: "center" }}>
                      <input className="input mono" type="number" min={0} style={{ width: 120, textAlign: "center" }}
                        value={form.features[key]?.amount ?? 0}
                        onChange={(e) => setFeature(key, { amount: +e.target.value })} />
                      <span style={{ fontSize: "0.72rem", color: "var(--text-faint)", minWidth: 30 }}>{form.features[key]?.currency ?? "IRR"}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? <><span className="spin" /> در حال ذخیره…</> : "ذخیره"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AssignLevelModal({ level, onClose, onSave, loading }: {
  level: any; onClose: () => void; onSave: (d: any) => void; loading: boolean;
}) {
  const [userId, setUserId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [err, setErr] = useState("");

  const users = useQuery({
    queryKey: ["users-dropdown"],
    queryFn: async () => {
      const res = await api.get("/admin/users/users", { params: { pageSize: 999, pageNumber: 1 } });
      return (res.data?.data?.userList ?? []) as any[];
    },
  });

  const handle = () => {
    if (!userId) { setErr("لطفاً یک کاربر انتخاب کنید"); return; }
    setErr("");
    onSave({ userId, levelId: level.id, expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined });
  };

  return (
    <Modal title={`اختصاص سطح "${level.name}" به کاربر`} onClose={onClose}>
      <form className="modal-form" onSubmit={(e) => { e.preventDefault(); handle(); }}>
        {err && <div className="form-err">{err}</div>}
        <div className="form-grid">
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>کاربر</label>
            <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">— انتخاب کاربر —</option>
              {users.isLoading && <option disabled>در حال بارگذاری…</option>}
              {(users.data ?? []).map((u: any) => (
                <option key={u.id} value={u.id}>
                  {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.phone || u.email || u.id}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>تاریخ انقضا (اختیاری)</label>
            <input className="input" type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? <><span className="spin" /> در حال اختصاص…</> : "اختصاص سطح"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FeaturesModal({ level, onClose }: { level: any; onClose: () => void }) {
  const features = level.features ?? {};
  const keys = Object.keys(features);

  return (
    <Modal title={`امکانات سطح "${level.name}"`} onClose={onClose} wide>
      {keys.length === 0 ? (
        <Empty label="هیچ امکانی تعریف نشده است" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کلید</th>
                <th>عنوان</th>
                <th>مقدار</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k}>
                  <td><code>{k}</code></td>
                  <td>{FEATURE_LABELS[k] || k}</td>
                  <td>{renderFeatureValue(k, features[k])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>بستن</button>
      </div>
    </Modal>
  );
}
