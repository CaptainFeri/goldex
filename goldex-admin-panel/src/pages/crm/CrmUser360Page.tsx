import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { apiError } from "../../api/client";
import { crmApi, Customer360, CustomerTag, CustomerSegment } from "../../api/crm";
import { Loading, Card, Badge } from "../../components/ui";

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function CrmUser360Page() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Customer360 | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [noteText, setNoteText] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const [allTags, setAllTags] = useState<CustomerTag[]>([]);
  const [allSegments, setAllSegments] = useState<CustomerSegment[]>([]);
  const [selectedTagId, setSelectedTagId] = useState("");
  const [selectedSegmentId, setSelectedSegmentId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await crmApi.getCustomer360(userId!));
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    crmApi.getTags().then(setAllTags).catch(() => {});
    crmApi.getSegments().then(setAllSegments).catch(() => {});
  }, []);

  const addNote = async () => {
    if (!noteText.trim()) return;
    setAddingNote(true);
    try {
      await crmApi.addNote(userId!, { content: noteText });
      setNoteText("");
      load();
    } catch (err: any) {
      alert(apiError(err));
    } finally {
      setAddingNote(false);
    }
  };

  const assignTag = async () => {
    if (!selectedTagId) return;
    try {
      await crmApi.assignTag(userId!, selectedTagId);
      setSelectedTagId("");
      load();
    } catch (err: any) {
      alert(apiError(err));
    }
  };

  const unassignTag = async (tagId: string) => {
    try {
      await crmApi.unassignTag(userId!, tagId);
      load();
    } catch (err: any) {
      alert(apiError(err));
    }
  };

  const assignSegment = async () => {
    if (!selectedSegmentId) return;
    try {
      await crmApi.assignUserToSegment(userId!, selectedSegmentId);
      setSelectedSegmentId("");
      load();
    } catch (err: any) {
      alert(apiError(err));
    }
  };

  const unassignSegment = async (segmentId: string) => {
    try {
      await crmApi.unassignUserFromSegment(userId!, segmentId);
      load();
    } catch (err: any) {
      alert(apiError(err));
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
          {data.creditExposure && (
            <div style={{
              marginBottom: "0.75rem",
              padding: "8px 10px",
              borderRadius: 6,
              fontSize: 12.5,
              fontWeight: 600,
              background: data.creditExposure.settlementEligible === false ? "var(--red-bg, #3a1414)" : "var(--bg)",
              color: data.creditExposure.settlementEligible === false ? "var(--red)" : "var(--text-faint)",
            }}>
              {data.creditExposure.settlementEligible === false
                ? `کاربر موقعیت منفی دارد و نمی‌تواند تسویه داوطلبانه کند (کسری ${data.creditExposure.settlementShortfall} پس از وثیقه).`
                : "اعتبار فعال این کاربر قابل تسویه است (بدون کسری)."}
              {(data.creditExposure.positions || []).filter((p) => p.netXau < 0).length > 0 && (
                <ul style={{ margin: "4px 0 0", paddingInlineStart: 18, fontWeight: 400 }}>
                  {data.creditExposure.positions.filter((p) => p.netXau < 0).map((p) => (
                    <li key={p.symbolId}>بدهکار {Math.abs(p.netXau)} {p.baseSymbolSlug}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {data.wallets?.length === 0 ? <div className="empty-state">بدون کیف‌پول</div> : (
            <table className="data-table">
              <thead>
                <tr><th>نماد</th><th>نوع</th><th>آزاد</th><th>مسدود</th><th>کل</th></tr>
              </thead>
              <tbody>
                {data.wallets?.map((w, i) => {
                  const negative = w.walletType === "CREDIT" &&
                    (data.creditExposure?.positions || []).some((p) => p.baseSymbolSlug === w.symbol && p.netXau < 0);
                  return (
                    <tr key={i}>
                      <td>{w.symbol}</td>
                      <td>
                        {w.walletType === "CREDIT" ? <Badge kind="gold">اعتبار</Badge>
                          : w.walletType === "COLLATERAL" ? <Badge kind="gray">وثیقه</Badge>
                          : <Badge kind="green">واریز</Badge>}
                      </td>
                      <td style={negative ? { color: "var(--red)", fontWeight: 600 } : undefined}>{w.free}</td>
                      <td>{w.locked}</td>
                      <td>{w.total}</td>
                    </tr>
                  );
                })}
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

      <div className="row" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1rem" }}>
        <Card title="برچسب‌ها">
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1rem" }}>
            {data.tags?.length === 0 ? (
              <div className="empty-state">بدون برچسب</div>
            ) : (
              data.tags?.map((t: any) => (
                <span key={t.id} style={{
                  display: "inline-flex", alignItems: "center", gap: "0.25rem",
                  background: t.color, color: "#fff", padding: "0.25rem 0.5rem", borderRadius: 4, fontSize: "0.85rem",
                }}>
                  {t.name}
                  <button onClick={() => unassignTag(t.id)} style={{
                    background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "1rem", lineHeight: 1, padding: 0,
                  }} title="حذف برچسب">×</button>
                </span>
              ))
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select className="input" value={selectedTagId} onChange={(e) => setSelectedTagId(e.target.value)} style={{ flex: 1 }}>
              <option value="">انتخاب برچسب...</option>
              {allTags.filter((t: any) => !data.tags?.some((ut: any) => ut.id === t.id)).map((t: any) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button className="btn" onClick={assignTag} disabled={!selectedTagId}>افزودن</button>
          </div>
        </Card>

        <Card title="بخش‌بندی‌ها">
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1rem" }}>
            {data.segments?.length === 0 ? (
              <div className="empty-state">بدون بخش‌بندی</div>
            ) : (
              data.segments?.map((s: any) => (
                <div key={s.id} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "0.5rem", background: "var(--bg-active)", borderRadius: 4, fontSize: "0.85rem",
                }}>
                  <div>
                    <strong>{s.name}</strong>
                    {s.description && <span style={{ color: "var(--text-faint)", marginRight: "0.5rem" }}>— {s.description}</span>}
                  </div>
                  <button onClick={() => unassignSegment(s.id)} style={{
                    background: "none", border: "none", color: "var(--text-danger, red)", cursor: "pointer", fontSize: "1.2rem", lineHeight: 1, padding: "0 0.25rem",
                  }} title="حذف از بخش">×</button>
                </div>
              ))
            )}
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <select className="input" value={selectedSegmentId} onChange={(e) => setSelectedSegmentId(e.target.value)} style={{ flex: 1 }}>
              <option value="">انتخاب بخش...</option>
              {allSegments.filter((s: any) => !data.segments?.some((us: any) => us.id === s.id)).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <button className="btn" onClick={assignSegment} disabled={!selectedSegmentId}>افزودن</button>
          </div>
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