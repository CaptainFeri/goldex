import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, unwrap, apiError } from "../../api/client";
import { Loading, Card, Badge } from "../../components/ui";

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function CrmUser360Page() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/admin/crm/users/${userId}/360`);
        setData(unwrap(res.data));
      } catch (err: any) {
        setError(apiError(err));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [userId]);

  const addNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await api.post(`/admin/crm/users/${userId}/notes`, { content: noteText });
      setNoteText("");
      const res = await api.get(`/admin/crm/users/${userId}/360`);
      setData(unwrap(res.data));
    } catch (err: any) {
      alert(apiError(err));
    } finally {
      setAddingNote(false);
    }
  };

  if (loading) return <Loading label="بارگذاری اطلاعات کاربر..." />;
  if (error) return <div className="error-state">{error}</div>;
  if (!data) return <div className="error-state">کاربر یافت نشد</div>;

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
        <button className="btn ghost" onClick={() => navigate("/crm/users")}>← بازگشت</button>
        <h2 style={{ margin: 0 }}>{data.user?.firstName} {data.user?.lastName}</h2>
        {data.tags?.map((t: any) => (
          <span key={t.id} className="badge" style={{ background: t.color, color: "#fff" }}>{t.name}</span>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <Card title="اطلاعات کاربر">
          <div style={{ fontSize: "0.9rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <div><strong>موبایل:</strong> {data.user?.phone || "—"}</div>
            <div><strong>ایمیل:</strong> {data.user?.email || "—"}</div>
            <div><strong>نقش:</strong> {data.user?.role}</div>
            <div><strong>وضعیت:</strong> {data.user?.blockedAt ? "مسدود" : "فعال"}</div>
            <div><strong>تاریخ ثبت‌نام:</strong> {fmtDate(data.user?.registeredAt)}</div>
          </div>
        </Card>

        <Card title="احراز هویت">
          {data.kyc ? (
            <div style={{ fontSize: "0.9rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div><strong>وضعیت:</strong> {data.kyc.status === 1 ? "تأیید شده" : data.kyc.status === 0 ? "در انتظار" : "رد شده"}</div>
              <div><strong>سطح:</strong> {data.kyc.level}</div>
              <div><strong>کد ملی:</strong> {data.kyc.nationalId || "—"}</div>
              {data.kyc.verifiedAt && <div><strong>تأیید در:</strong> {fmtDate(data.kyc.verifiedAt)}</div>}
            </div>
          ) : <div className="empty-state">احراز هویت نشده</div>}
        </Card>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <Card title="کیف‌پول‌ها">
          {data.wallets?.length === 0 ? <div className="empty-state">بدون کیف‌پول</div> : (
            <table className="data-table">
              <thead>
                <tr><th>نماد</th><th>آزاد</th><th>مسدود</th><th>کل</th></tr>
              </thead>
              <tbody>
                {data.wallets?.map((w: any, i: number) => (
                  <tr key={i}>
                    <td>{w.symbol}</td>
                    <td>{w.free}</td>
                    <td>{w.locked}</td>
                    <td>{w.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="تیکت‌های اخیر">
          {data.tickets?.length === 0 ? <div className="empty-state">بدون تیکت</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {data.tickets?.map((t: any) => (
                <div key={t.id} style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                  onClick={() => navigate(`/crm/tickets/${t.id}`)}>
                  <div style={{ fontWeight: 500 }}>{t.subject}</div>
                  <div style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>{fmtDate(t.createAt)}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
        <Card title="یادداشت‌ها">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
            {data.notes?.length === 0 ? <div className="empty-state">بدون یادداشت</div> : (
              data.notes?.map((n: any) => (
                <div key={n.id} style={{ padding: "0.5rem", background: "var(--bg-active)", borderRadius: 4, fontSize: "0.85rem" }}>
                  <div style={{ color: "var(--text-faint)", marginBottom: 4 }}>{fmtDate(n.createAt)}</div>
                  <div>{n.content}</div>
                </div>
              ))
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <input className="input" value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="یادداشت جدید..." style={{ flex: 1 }} />
            <button className="btn" onClick={addNote} disabled={!noteText.trim() || addingNote}>{addingNote ? "..." : "افزودن"}</button>
          </div>
        </Card>

        <Card title="تاریخچه ارتباطات">
          {data.communications?.length === 0 ? <div className="empty-state">بدون ارتباط</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: 300, overflowY: "auto" }}>
              {data.communications?.map((c: any) => (
                <div key={c.id} style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)", fontSize: "0.85rem" }}>
                  <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                    <Badge kind={c.channel === "EMAIL" ? "green" : c.channel === "PHONE" ? "gold" : "gray"}>{c.channel}</Badge>
                    <span style={{ color: "var(--text-faint)", marginRight: "auto" }}>{fmtDate(c.sentAt)}</span>
                  </div>
                  {c.subject && <div style={{ fontWeight: 500, marginTop: 4 }}>{c.subject}</div>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
