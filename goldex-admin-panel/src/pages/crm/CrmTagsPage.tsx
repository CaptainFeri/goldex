import { useEffect, useState, useCallback } from "react";
import { apiError } from "../../api/client";
import { crmApi, CustomerTag } from "../../api/crm";
import { Loading, Card } from "../../components/ui";

export default function CrmTagsPage() {
  const [tags, setTags] = useState<CustomerTag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", color: "#6366f1" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTags(await crmApi.getTags());
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createTag = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await crmApi.createTag(form);
      setForm({ name: "", color: "#6366f1" });
      setShowForm(false);
      load();
    } catch (err: any) {
      alert(apiError(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteTag = async (id: string) => {
    if (!confirm("حذف شود؟")) return;
    try {
      await crmApi.deleteTag(id);
      load();
    } catch (err: any) {
      alert(apiError(err));
    }
  };

  if (loading) return <Loading label="بارگذاری برچسب‌ها..." />;

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>برچسب‌های مشتریان</h2>
        <button className="btn" onClick={() => setShowForm(!showForm)}>
          {showForm ? "لغو" : "برچسب جدید"}
        </button>
      </div>

      {showForm && (
        <Card title="برچسب جدید" style={{ marginBottom: "1rem" }}>
          <form onSubmit={createTag} style={{ display: "flex", gap: "1rem", alignItems: "flex-end" }}>
            <div>
              <label className="field-label">نام</label>
              <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div>
              <label className="field-label">رنگ</label>
              <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} style={{ width: 60, height: 38 }} />
            </div>
            <button className="btn" type="submit" disabled={saving}>{saving ? "..." : "ایجاد"}</button>
          </form>
        </Card>
      )}

      {error && <div className="error-state">{error}</div>}

      <Card title={`برچسب‌ها (${tags.length})`}>
        {tags.length === 0 ? (
          <div className="empty-state">برچسبی تعریف نشده</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr><th>نام</th><th>رنگ</th><th>عملیات</th></tr>
            </thead>
            <tbody>
              {tags.map((t) => (
                <tr key={t.id}>
                  <td style={{ fontWeight: 500 }}>{t.name}</td>
                  <td><span style={{ background: t.color, padding: "2px 12px", borderRadius: 4, color: "#fff" }}>{t.color}</span></td>
                  <td>
                    <button className="btn ghost sm" onClick={() => deleteTag(t.id)}>حذف</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
