import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, unwrap, apiError } from "../../api/client";
import { Loading, Card } from "../../components/ui";

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function CrmTicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [ticket, setTicket] = useState<any>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newMsg, setNewMsg] = useState("");
  const [isInternal, setIsInternal] = useState(false);
  const [sending, setSending] = useState(false);
  const [newStatus, setNewStatus] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/admin/crm/tickets/${id}`);
        const data: any = unwrap(res.data);
        setTicket(data);
        setMessages(data.messages || []);
        setNewStatus(data.status);
      } catch (err: any) {
        setError(apiError(err));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [id]);

  const sendMessage = async () => {
    if (!newMsg.trim()) return;
    setSending(true);
    try {
      const res = await api.post(`/admin/crm/tickets/${id}/messages`, { message: newMsg, isInternal });
      const msg: any = unwrap(res.data);
      setMessages((prev) => [...prev, msg]);
      setNewMsg("");
    } catch (err: any) {
      alert(apiError(err));
    } finally {
      setSending(false);
    }
  };

  const updateStatus = async (status: string) => {
    try {
      await api.patch(`/admin/crm/tickets/${id}/status`, { status });
      setTicket((prev: any) => ({ ...prev, status }));
      setNewStatus(status);
    } catch (err: any) {
      alert(apiError(err));
    }
  };

  const assignToMe = async () => {
    try {
      await api.patch(`/admin/crm/tickets/${id}/assign`);
      alert("تیکت به شما اختصاص یافت");
    } catch (err: any) {
      alert(apiError(err));
    }
  };

  if (loading) return <Loading label="بارگذاری تیکت..." />;
  if (error) return <div className="error-state">{error}</div>;
  if (!ticket) return <div className="error-state">تیکت یافت نشد</div>;

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
        <button className="btn ghost" onClick={() => navigate("/crm/tickets")}>← بازگشت</button>
        <h2 style={{ margin: 0 }}>{ticket.subject}</h2>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "1rem" }}>
        <div>
          <Card title="پیام‌ها">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", maxHeight: 400, overflowY: "auto", marginBottom: "1rem" }}>
              {messages.filter((m: any) => !m.isInternal).length === 0 ? (
                <div className="empty-state">هنوز پیامی ثبت نشده</div>
              ) : (
                messages.filter((m: any) => !m.isInternal).map((m: any) => (
                  <div key={m.id} style={{
                    padding: "0.75rem",
                    background: m.senderType === "ADMIN" ? "var(--bg-active)" : "var(--bg)",
                    borderRadius: 8,
                    border: "1px solid var(--border)",
                    alignSelf: m.senderType === "USER" ? "flex-end" : "flex-start",
                    maxWidth: "85%",
                  }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-faint)", marginBottom: 4 }}>
                      {m.senderType === "ADMIN" ? "اپراتور" : "کاربر"} · {fmtDate(m.createAt)}
                    </div>
                    <div>{m.message}</div>
                  </div>
                ))
              )}
            </div>

            <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
              <div style={{ flex: 1 }}>
                <textarea
                  className="input"
                  rows={3}
                  value={newMsg}
                  onChange={(e) => setNewMsg(e.target.value)}
                  placeholder="متن پیام..."
                  style={{ width: "100%", resize: "vertical" }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem", fontSize: "0.85rem" }}>
                  <input type="checkbox" checked={isInternal} onChange={(e) => setIsInternal(e.target.checked)} />
                  یادداشت داخلی (فقط اپراتورها می‌بینند)
                </label>
              </div>
              <button className="btn" onClick={sendMessage} disabled={!newMsg.trim() || sending}>
                {sending ? "..." : "ارسال"}
              </button>
            </div>
          </Card>

          {messages.some((m: any) => m.isInternal) && (
            <Card title="یادداشت‌های داخلی" style={{ marginTop: "1rem" }}>
              {messages.filter((m: any) => m.isInternal).map((m: any) => (
                <div key={m.id} style={{ padding: "0.5rem 0", borderBottom: "1px solid var(--border)", fontSize: "0.85rem", color: "var(--text-faint)" }}>
                  <div>{fmtDate(m.createAt)}</div>
                  <div>{m.message}</div>
                </div>
              ))}
            </Card>
          )}
        </div>

        <div>
          <Card title="جزئیات تیکت">
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.9rem" }}>
              <div><strong>کاربر:</strong> {ticket.user?.firstName} {ticket.user?.lastName}</div>
              <div><strong>موبایل:</strong> {ticket.user?.phone || "—"}</div>
              <div><strong>ایمیل:</strong> {ticket.user?.email || "—"}</div>
              <div><strong>دسته‌بندی:</strong> {ticket.category}</div>
              <div><strong>اولویت:</strong> {ticket.priority}</div>
              <div><strong>وضعیت:</strong> {ticket.status}</div>
              <div><strong>اختصاص به:</strong> {ticket.assignedTo?.phone || "—"}</div>
              <div><strong>ایجاد:</strong> {fmtDate(ticket.createAt)}</div>
              {ticket.resolvedAt && <div><strong>حل شده:</strong> {fmtDate(ticket.resolvedAt)}</div>}
              {ticket.satisfactionScore && <div><strong>رضایت:</strong> {ticket.satisfactionScore}/5</div>}
              {ticket.description && <div><strong>توضیحات:</strong><p style={{ margin: "0.25rem 0 0 0", whiteSpace: "pre-wrap", background: "var(--bg)", padding: "0.5rem", borderRadius: 6, fontSize: "0.85rem" }}>{ticket.description}</p></div>}
            </div>
          </Card>

          <Card title="عملیات" style={{ marginTop: "1rem" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <button className="btn" onClick={assignToMe}>اختصاص به من</button>
              <select className="input" value={newStatus} onChange={(e) => updateStatus(e.target.value)}>
                <option value="OPEN">باز</option>
                <option value="IN_PROGRESS">در حال بررسی</option>
                <option value="WAITING_ON_CUSTOMER">منتظر مشتری</option>
                <option value="RESOLVED">حل شده</option>
                <option value="CLOSED">بسته شده</option>
              </select>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
