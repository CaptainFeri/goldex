import { useEffect, useState, useCallback } from "react";
import { apiError } from "../../api/client";
import { crmApi, CustomerSegment, SegmentCombination, SegmentOperator, SegmentMember } from "../../api/crm";
import { Loading, Card } from "../../components/ui";

interface CriteriaForm {
  roles: string;
  kycStatus: string;
  kycLevel: string;
  levelId: string;
  hasBlocked: string;
  emailVerified: string;
  twoFactorActivated: string;
  hasReferral: string;
  createdAfter: string;
  createdBefore: string;
  hasTags: string;
  minTotalBalance: string;
  maxTotalBalance: string;
  hasOrders: string;
  minOrderCount: string;
  hasCompletedOrders: string;
  hasDeposits: string;
  minDepositCount: string;
  minDepositTotal: string;
  hasWithdraws: string;
  minWithdrawCount: string;
  minWithdrawTotal: string;
}

const emptyCriteria: CriteriaForm = {
  roles: "", kycStatus: "", kycLevel: "", levelId: "", hasBlocked: "", emailVerified: "",
  twoFactorActivated: "", hasReferral: "", createdAfter: "", createdBefore: "", hasTags: "",
  minTotalBalance: "", maxTotalBalance: "", hasOrders: "", minOrderCount: "", hasCompletedOrders: "",
  hasDeposits: "", minDepositCount: "", minDepositTotal: "", hasWithdraws: "", minWithdrawCount: "",
  minWithdrawTotal: "",
};

function criteriaToForm(criteria: Record<string, any>): CriteriaForm {
  const c = criteria || {};
  const str = (v: any) => (v === undefined || v === null ? "" : String(v));
  return {
    roles: Array.isArray(c.roles) ? c.roles.join(",") : str(c.roles),
    kycStatus: str(c.kycStatus),
    kycLevel: str(c.kycLevel),
    levelId: str(c.levelId),
    hasBlocked: str(c.hasBlocked),
    emailVerified: str(c.emailVerified),
    twoFactorActivated: str(c.twoFactorActivated),
    hasReferral: str(c.hasReferral),
    createdAfter: str(c.createdAfter),
    createdBefore: str(c.createdBefore),
    hasTags: Array.isArray(c.hasTags) ? c.hasTags.join(",") : str(c.hasTags),
    minTotalBalance: str(c.minTotalBalance),
    maxTotalBalance: str(c.maxTotalBalance),
    hasOrders: str(c.hasOrders),
    minOrderCount: str(c.minOrderCount),
    hasCompletedOrders: str(c.hasCompletedOrders),
    hasDeposits: str(c.hasDeposits),
    minDepositCount: str(c.minDepositCount),
    minDepositTotal: str(c.minDepositTotal),
    hasWithdraws: str(c.hasWithdraws),
    minWithdrawCount: str(c.minWithdrawCount),
    minWithdrawTotal: str(c.minWithdrawTotal),
  };
}

function formToCriteria(f: CriteriaForm): Record<string, any> {
  const c: Record<string, any> = {};
  const num = (v: string) => (v.trim() === "" ? undefined : Number(v));
  const bool = (v: string) => (v === "" ? undefined : v === "true");
  const csv = (v: string) => (v.trim() === "" ? undefined : v.split(",").map((s) => s.trim()).filter(Boolean));
  const date = (v: string) => (v.trim() === "" ? undefined : v);
  const r = num(f.roles); if (r !== undefined) c.roles = [r];
  const ks = num(f.kycStatus); if (ks !== undefined) c.kycStatus = ks;
  const kl = num(f.kycLevel); if (kl !== undefined) c.kycLevel = kl;
  if (f.levelId.trim()) c.levelId = f.levelId.trim();
  const hb = bool(f.hasBlocked); if (hb !== undefined) c.hasBlocked = hb;
  const ev = bool(f.emailVerified); if (ev !== undefined) c.emailVerified = ev;
  const ta = bool(f.twoFactorActivated); if (ta !== undefined) c.twoFactorActivated = ta;
  const hr = bool(f.hasReferral); if (hr !== undefined) c.hasReferral = hr;
  const ca = date(f.createdAfter); if (ca) c.createdAfter = ca;
  const cb = date(f.createdBefore); if (cb) c.createdBefore = cb;
  const ht = csv(f.hasTags); if (ht) c.hasTags = ht;
  const mib = num(f.minTotalBalance); if (mib !== undefined) c.minTotalBalance = mib;
  const mab = num(f.maxTotalBalance); if (mab !== undefined) c.maxTotalBalance = mab;
  const ho = bool(f.hasOrders); if (ho !== undefined) c.hasOrders = ho;
  const moc = num(f.minOrderCount); if (moc !== undefined) c.minOrderCount = moc;
  const hco = bool(f.hasCompletedOrders); if (hco !== undefined) c.hasCompletedOrders = hco;
  const hd = bool(f.hasDeposits); if (hd !== undefined) c.hasDeposits = hd;
  const mdc = num(f.minDepositCount); if (mdc !== undefined) c.minDepositCount = mdc;
  const mdt = num(f.minDepositTotal); if (mdt !== undefined) c.minDepositTotal = mdt;
  const hw = bool(f.hasWithdraws); if (hw !== undefined) c.hasWithdraws = hw;
  const mwc = num(f.minWithdrawCount); if (mwc !== undefined) c.minWithdrawCount = mwc;
  const mwt = num(f.minWithdrawTotal); if (mwt !== undefined) c.minWithdrawTotal = mwt;
  return c;
}

const fields: { key: keyof CriteriaForm; label: string; placeholder?: string }[] = [
  { key: "roles", label: "نقش کاربری (عدد)", placeholder: "0، 1، 3" },
  { key: "kycStatus", label: "وضعیت احراز هویت", placeholder: "0، 1، 2" },
  { key: "kycLevel", label: "سطح احراز هویت (حداقل)", placeholder: "0 تا 4" },
  { key: "levelId", label: "شناسه سطح کاربری", placeholder: "uuid" },
  { key: "hasTags", label: "برچسب‌ها (id، جدا شده)", placeholder: "tag1، tag2" },
  { key: "minTotalBalance", label: "حداقل مانده کل" },
  { key: "maxTotalBalance", label: "حداکثر مانده کل" },
  { key: "minOrderCount", label: "حداقل تعداد سفارش" },
  { key: "minDepositCount", label: "حداقل تعداد واریز" },
  { key: "minDepositTotal", label: "حداقل مبلغ واریز" },
  { key: "minWithdrawCount", label: "حداقل تعداد برداشت" },
  { key: "minWithdrawTotal", label: "حداقل مبلغ برداشت" },
  { key: "createdAfter", label: "تاریخ عضویت از", placeholder: "ISO" },
  { key: "createdBefore", label: "تاریخ عضویت تا", placeholder: "ISO" },
];

const boolFields: { key: keyof CriteriaForm; label: string }[] = [
  { key: "hasBlocked", label: "مسدود شده" },
  { key: "emailVerified", label: "ایمیل تأیید شده" },
  { key: "twoFactorActivated", label: "احراز دو مرحله‌ای فعال" },
  { key: "hasReferral", label: "دارای کد معرف" },
  { key: "hasOrders", label: "دارای سفارش" },
  { key: "hasCompletedOrders", label: "دارای سفارش تکمیل‌شده" },
  { key: "hasDeposits", label: "دارای واریز تکمیل‌شده" },
  { key: "hasWithdraws", label: "دارای برداشت تکمیل‌شده" },
];

const OPERATORS: SegmentOperator[] = ["UNION", "INTERSECT", "DIFFERENCE"];
const OP_LABELS: Record<SegmentOperator, string> = {
  UNION: "اجتماع (∪)",
  INTERSECT: "اشتراک (∩)",
  DIFFERENCE: "تفاضل (−)",
};

export default function CrmSegmentsPage() {
  const [segments, setSegments] = useState<CustomerSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<{ name: string; description: string; isDynamic: boolean }>({ name: "", description: "", isDynamic: false });
  const [criteria, setCriteria] = useState<CriteriaForm>(emptyCriteria);
  const [saving, setSaving] = useState(false);

  // Per-segment detail state.
  const [stats, setStats] = useState<Record<string, any>>({});
  const [members, setMembers] = useState<Record<string, { list: SegmentMember[]; total: number; expanded: boolean }>>({});

  // Combinations.
  const [combinations, setCombinations] = useState<SegmentCombination[]>([]);
  const [comboForm, setComboForm] = useState<{ name: string; description: string; segmentIds: string; operator: SegmentOperator }>({ name: "", description: "", segmentIds: "", operator: "UNION" });
  const [showComboForm, setShowComboForm] = useState(false);
  const [comboResult, setComboResult] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSegments(await crmApi.getSegments());
      setCombinations(await crmApi.getCombinations());
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createSegment = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await crmApi.createSegment({ ...form, criteria: formToCriteria(criteria) });
      setForm({ name: "", description: "", isDynamic: false });
      setCriteria(emptyCriteria);
      setShowForm(false);
      load();
    } catch (err: any) {
      alert(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const evaluate = async (id: string) => {
    try {
      const result = await crmApi.evaluateSegment(id);
      alert(`${result.length} کاربر با این معیارها یافت شد`);
    } catch (err: any) {
      alert(apiError(err));
    }
  };

  const sync = async (id: string) => {
    try {
      const res = await crmApi.syncSegment(id);
      alert(`همگام‌سازی انجام شد: ${res.memberCount} عضو`);
      load();
    } catch (err: any) {
      alert(apiError(err));
    }
  };

  const loadStats = async (id: string) => {
    try {
      const s = await crmApi.getSegmentStats(id);
      setStats((prev) => ({ ...prev, [id]: s }));
    } catch (err: any) {
      alert(apiError(err));
    }
  };

  const toggleMembers = async (id: string) => {
    setMembers((prev) => {
      const cur = prev[id];
      if (cur?.expanded) return { ...prev, [id]: { ...cur, expanded: false } };
      return { ...prev, [id]: { ...(cur || { list: [], total: 0 }), expanded: true } };
    });
    if (!members[id]?.expanded) {
      try {
        const res = await crmApi.getSegmentMembers(id, 1, 50);
        setMembers((prev) => ({ ...prev, [id]: { list: res.data, total: res.total, expanded: true } }));
      } catch (err: any) {
        alert(apiError(err));
      }
    }
  };

  const deleteSegment = async (id: string) => {
    if (!confirm("حذف شود؟")) return;
    try {
      await crmApi.deleteSegment(id);
      load();
    } catch (err: any) {
      alert(apiError(err));
    }
  };

  const clearSegment = async (id: string) => {
    if (!confirm("همه اعضا پاک شوند؟")) return;
    try {
      await crmApi.clearSegment(id);
      load();
    } catch (err: any) {
      alert(apiError(err));
    }
  };

  const createCombination = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const segmentIds = comboForm.segmentIds.split(",").map((s) => s.trim()).filter(Boolean);
      await crmApi.createCombination({ name: comboForm.name, description: comboForm.description, segmentIds, operator: comboForm.operator });
      setComboForm({ name: "", description: "", segmentIds: "", operator: "UNION" });
      setShowComboForm(false);
      load();
    } catch (err: any) {
      alert(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const evalCombo = async (id: string) => {
    try {
      setComboResult(await crmApi.evaluateCombination(id));
    } catch (err: any) {
      alert(apiError(err));
    }
  };

  const deleteCombo = async (id: string) => {
    if (!confirm("حذف شود؟")) return;
    try {
      await crmApi.deleteCombination(id);
      load();
    } catch (err: any) {
      alert(apiError(err));
    }
  };

  if (loading) return <Loading label="بارگذاری بخش‌بندی‌ها..." />;

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", gap: "0.5rem", flexWrap: "wrap" }}>
        <h2>بخش‌بندی مشتریان</h2>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button className="btn ghost" onClick={() => setShowComboForm(!showComboForm)}>
            {showComboForm ? "لغو" : "ترکیب بخش‌ها"}
          </button>
          <button className="btn" onClick={() => setShowForm(!showForm)}>
            {showForm ? "لغو" : "بخش جدید"}
          </button>
        </div>
      </div>

      {showForm && (
        <Card title="بخش جدید" style={{ marginBottom: "1rem" }}>
          <form onSubmit={createSegment} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label className="field-label">نام</label>
                <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <label className="field-label">شرح</label>
                <input className="input" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input type="checkbox" checked={form.isDynamic} onChange={(e) => setForm((f) => ({ ...f, isDynamic: e.target.checked }))} />
              پویا (همگام‌سازی خودکار بر اساس معیارها)
            </label>

            <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text-secondary)" }}>معیارها</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "0.75rem" }}>
              {fields.map((f) => (
                <div key={f.key}>
                  <label className="field-label">{f.label}</label>
                  <input className="input" placeholder={f.placeholder || "عدد"} value={criteria[f.key]}
                    onChange={(e) => setCriteria((c) => ({ ...c, [f.key]: e.target.value }))} />
                </div>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "0.5rem" }}>
              {boolFields.map((f) => (
                <label key={f.key} style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.85rem" }}>
                  <select className="input" value={criteria[f.key]} onChange={(e) => setCriteria((c) => ({ ...c, [f.key]: e.target.value }))} style={{ padding: "0.35rem" }}>
                    <option value="">—</option>
                    <option value="true">بله</option>
                    <option value="false">خیر</option>
                  </select>
                  {f.label}
                </label>
              ))}
            </div>

            <button className="btn" type="submit" disabled={saving}>{saving ? "..." : "ایجاد"}</button>
          </form>
        </Card>
      )}

      {showComboForm && (
        <Card title="ترکیب بخش‌ها" style={{ marginBottom: "1rem" }}>
          <form onSubmit={createCombination} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label className="field-label">نام</label>
                <input className="input" value={comboForm.name} onChange={(e) => setComboForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div>
                <label className="field-label">شرح</label>
                <input className="input" value={comboForm.description} onChange={(e) => setComboForm((f) => ({ ...f, description: e.target.value }))} />
              </div>
            </div>
            <div>
              <label className="field-label">بخش‌ها (id، جدا شده — به ترتیب)</label>
              <input className="input" value={comboForm.segmentIds} onChange={(e) => setComboForm((f) => ({ ...f, segmentIds: e.target.value }))} placeholder="id1، id2، id3" required />
            </div>
            <div>
              <label className="field-label">عملگر</label>
              <select className="input" value={comboForm.operator} onChange={(e) => setComboForm((f) => ({ ...f, operator: e.target.value as SegmentOperator }))}>
                {OPERATORS.map((o) => <option key={o} value={o}>{OP_LABELS[o]}</option>)}
              </select>
            </div>
            <button className="btn" type="submit" disabled={saving}>{saving ? "..." : "ایجاد"}</button>
          </form>
        </Card>
      )}

      {error && <div className="error-state">{error}</div>}

      <Card title={`بخش‌بندی‌ها (${segments.length})`} style={{ marginBottom: "1rem" }}>
        {segments.length === 0 ? (
          <div className="empty-state">بخش‌بندی‌ای تعریف نشده</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>نام</th><th>شرح</th><th>نوع</th><th>اعضا</th><th>عملیات</th></tr>
            </thead>
            <tbody>
              {segments.map((s) => {
                const st = stats[s.id];
                const mem = members[s.id];
                return (
                  <Fragment key={s.id}>
                    <tr>
                      <td style={{ fontWeight: 500 }}>{s.name}</td>
                      <td>{s.description || "—"}</td>
                      <td>{s.isDynamic ? "پویا" : "دستی"}</td>
                      <td>{st ? st.memberCount : <button className="btn ghost sm" onClick={() => loadStats(s.id)}>مشاهده</button>}</td>
                      <td style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                        <button className="btn ghost sm" onClick={() => evaluate(s.id)}>ارزیابی</button>
                        {s.isDynamic && <button className="btn ghost sm" onClick={() => sync(s.id)}>همگام</button>}
                        <button className="btn ghost sm" onClick={() => toggleMembers(s.id)}>{mem?.expanded ? "بستن اعضا" : "اعضا"}</button>
                        <button className="btn ghost sm" onClick={() => clearSegment(s.id)}>پاک کردن</button>
                        <button className="btn ghost sm" onClick={() => deleteSegment(s.id)}>حذف</button>
                      </td>
                    </tr>
                    {mem?.expanded && (
                      <tr>
                        <td colSpan={5}>
                          <div style={{ padding: "0.5rem" }}>
                            <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                              {mem.total} عضو — {st?.lastSyncedAt ? `آخرین همگام: ${new Date(st.lastSyncedAt).toLocaleString("fa-IR")}` : ""}
                            </div>
                            {mem.list.length === 0 ? (
                              <div className="empty-state">عضوی ندارد</div>
                            ) : (
                              <table className="data-table" style={{ fontSize: "0.85rem" }}>
                                <thead>
                                  <tr><th>نام</th><th>موبایل</th><th>ایمیل</th><th>KYC</th><th>مانده کل</th></tr>
                                </thead>
                                <tbody>
                                  {mem.list.map((m) => (
                                    <tr key={m.userId}>
                                      <td>{m.firstName || ""} {m.lastName || ""}</td>
                                      <td>{m.phone || "—"}</td>
                                      <td>{m.email || "—"}</td>
                                      <td>{m.kycStatus ?? "—"}</td>
                                      <td>{m.totalBalance ?? 0}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card title={`ترکیب‌ها (${combinations.length})`}>
        {combinations.length === 0 ? (
          <div className="empty-state">ترکیبی تعریف نشده</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>نام</th><th>عملگر</th><th>بخش‌ها</th><th>عملیات</th></tr>
            </thead>
            <tbody>
              {combinations.map((c) => (
                <tr key={c.id}>
                  <td style={{ fontWeight: 500 }}>{c.name}</td>
                  <td>{OP_LABELS[c.operator]}</td>
                  <td>{c.segmentIds.length} بخش</td>
                  <td style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="btn ghost sm" onClick={() => evalCombo(c.id)}>ارزیابی</button>
                    <button className="btn ghost sm" onClick={() => deleteCombo(c.id)}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {comboResult && (
        <Card title="نتیجه ترکیب" style={{ marginTop: "1rem" }}>
          <div>{comboResult.length} کاربر یافت شد</div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-faint)", maxHeight: 200, overflowY: "auto" }}>
            {comboResult.join(", ")}
          </div>
          <button className="btn ghost sm" onClick={() => setComboResult(null)} style={{ marginTop: "0.5rem" }}>بستن</button>
        </Card>
      )}
    </div>
  );
}

function Fragment({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}