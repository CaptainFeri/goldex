import { useEffect, useState, useCallback } from "react";
import { apiError } from "../../api/client";
import { crmApi, CustomerSegment } from "../../api/crm";
import { Loading, Card } from "../../components/ui";

export default function CrmSegmentsPage() {
  const [segments, setSegments] = useState<CustomerSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", criteria: "{}", isDynamic: false });
  const [saving, setSaving] = useState(false);
  const [evalResult, setEvalResult] = useState<string[] | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setSegments(await crmApi.getSegments());
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
      let criteria: any = {};
      try { criteria = JSON.parse(form.criteria); } catch { criteria = {}; }
      await crmApi.createSegment({ ...form, criteria });
      setForm({ name: "", description: "", criteria: "{}", isDynamic: false });
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
      setEvalResult(await crmApi.evaluateSegment(id));
    } catch (err: any) {
      alert(apiError(err));
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

  if (loading) return <Loading label="بارگذاری بخش‌بندی‌ها..." />;

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>بخش‌بندی مشتریان</h2>
        <button className="btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? "لغو" : "بخش جدید"}
        </button>
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
            <div>
              <label className="field-label">معیارها (JSON)</label>
              <textarea className="input" rows={4} value={form.criteria} onChange={(e) => setForm((f) => ({ ...f, criteria: e.target.value }))} style={{ width: "100%", fontFamily: "monospace" }} />
              <div style={{ fontSize: "0.8rem", color: "var(--text-faint)", marginTop: 4 }}>
                مثال: {`{"roles": [0], "hasBlocked": false}`}
              </div>
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <input type="checkbox" checked={form.isDynamic} onChange={(e) => setForm((f) => ({ ...f, isDynamic: e.target.checked }))} />
              پویا (بروزرسانی خودکار)
            </label>
            <button className="btn" type="submit" disabled={saving}>{saving ? "..." : "ایجاد"}</button>
          </form>
        </Card>
      )}

      {error && <div className="error-state">{error}</div>}

      <Card title={`بخش‌بندی‌ها (${segments.length})`}>
        {segments.length === 0 ? (
          <div className="empty-state">بخش‌بندی‌ای تعریف نشده</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>نام</th><th>شرح</th><th>نوع</th><th>عملیات</th></tr>
            </thead>
            <tbody>
              {segments.map((s) => (
                <tr key={s.id}>
                  <td style={{ fontWeight: 500 }}>{s.name}</td>
                  <td>{s.description || "—"}</td>
                  <td>{s.isDynamic ? "پویا" : "دستی"}</td>
                  <td style={{ display: "flex", gap: "0.5rem" }}>
                    <button className="btn ghost sm" onClick={() => evaluate(s.id)}>ارزیابی</button>
                    <button className="btn ghost sm" onClick={() => deleteSegment(s.id)}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {evalResult && (
        <Card title="نتیجه ارزیابی" style={{ marginTop: "1rem" }}>
          <div>{Array.isArray(evalResult) ? evalResult.length : 0} کاربر یافت شد</div>
          <div style={{ fontSize: "0.85rem", color: "var(--text-faint)", maxHeight: 200, overflowY: "auto" }}>
            {Array.isArray(evalResult) ? evalResult.join(", ") : String(evalResult)}
          </div>
          <button className="btn ghost sm" onClick={() => setEvalResult(null)} style={{ marginTop: "0.5rem" }}>بستن</button>
        </Card>
      )}
    </div>
  );
}
