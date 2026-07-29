import { useEffect, useState, useCallback } from "react";
import { api, unwrap, apiError } from "../api/client";
import { Loading, Card, Stat, Badge } from "../components/ui";

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const TYPE_LABELS: Record<string, string> = { INFO: "اطلاعیه", SUCCESS: "موفقیت", WARNING: "هشدار", ERROR: "خطا", PROMOTION: "تبلیغات", SYSTEM: "سیستم" };
const STATUS_CLASSES: Record<string, string> = { SENT: "badge-info", DELIVERED: "badge-success", READ: "badge-secondary", FAILED: "badge-danger", PENDING: "badge-warning" };
const STATUS_LABELS: Record<string, string> = { SENT: "ارسال شده", DELIVERED: "تحویل شده", READ: "خوانده شده", FAILED: "ناموفق", PENDING: "در انتظار" };

export default function NotificationsPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [tab, setTab] = useState<"stats" | "send" | "list">("stats");

  const [notifs, setNotifs] = useState<any[]>([]);
  const [notifTotal, setNotifTotal] = useState(0);
  const [notifPage, setNotifPage] = useState(1);
  const [notifLoading, setNotifLoading] = useState(false);
  const [filters, setFilters] = useState({ userId: "", type: "", channel: "", status: "" });

  const [form, setForm] = useState({ userId: "", title: "", body: "", type: "INFO", category: "SYSTEM", channels: ["IN_APP"] as string[] });
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState("");

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/admin/notifications/stats");
      setStats(unwrap(res.data));
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const loadNotifs = useCallback(async (page: number) => {
    setNotifLoading(true);
    try {
      const params: any = { pageNumber: page, pageSize: 50 };
      if (filters.userId) params.userId = filters.userId;
      if (filters.type) params.type = filters.type;
      if (filters.channel) params.channel = filters.channel;
      if (filters.status) params.status = filters.status;
      const res = await api.get("/admin/notifications", { params });
      const d: any = unwrap(res.data);
      setNotifs(d.data || []);
      setNotifTotal(d.total || 0);
    } catch { } finally {
      setNotifLoading(false);
    }
  }, [filters]);

  useEffect(() => { loadNotifs(notifPage); }, [loadNotifs, notifPage]);

  const sendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    setSending(true);
    setSendResult("");
    try {
      await api.post("/admin/notifications/send", form);
      setSendResult("success");
      setForm({ userId: "", title: "", body: "", type: "INFO", category: "SYSTEM", channels: ["IN_APP"] });
    } catch (err: any) {
      setSendResult(apiError(err));
    } finally {
      setSending(false);
    }
  };

  const channelToggle = (ch: string) => {
    setForm((f) => ({
      ...f,
      channels: f.channels.includes(ch) ? f.channels.filter((c) => c !== ch) : [...f.channels, ch],
    }));
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <button className={`btn ${tab === "stats" ? "" : "ghost"}`} onClick={() => setTab("stats")}>آمار</button>
        <button className={`btn ${tab === "send" ? "" : "ghost"}`} onClick={() => setTab("send")}>ارسال اعلان</button>
        <button className={`btn ${tab === "list" ? "" : "ghost"}`} onClick={() => setTab("list")}>لیست اعلان‌ها</button>
      </div>

      {tab === "stats" && (
        <>
          {loading ? <Loading label="بارگذاری آمار..." /> : error ? <div className="error-state">{error}</div> : (
            <>
              <h2 style={{ marginBottom: "1rem" }}>آمار اعلان‌ها</h2>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                <Stat label="کل اعلان‌ها" value={stats?.total ?? 0} />
                {Array.isArray(stats?.byChannel) && stats.byChannel.map((c: any) => (
                  <Stat key={c.channel} label={`کانال ${c.channel}`} value={c.count} />
                ))}
                {Array.isArray(stats?.byStatus) && stats.byStatus.map((s: any) => (
                  <Stat key={s.status} label={`وضعیت ${STATUS_LABELS[s.status] || s.status}`} value={s.count} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {tab === "send" && (
        <Card title="ارسال اعلان جدید">
          <form onSubmit={sendNotification} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
              <div>
                <label className="field-label">شناسه کاربر</label>
                <input className="input" value={form.userId} onChange={(e) => setForm((f) => ({ ...f, userId: e.target.value }))} required placeholder="UUID کاربر" />
              </div>
              <div>
                <label className="field-label">نوع</label>
                <select className="input" value={form.type} onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="field-label">عنوان</label>
              <input className="input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
            </div>
            <div>
              <label className="field-label">متن</label>
              <textarea className="input" rows={4} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} required style={{ width: "100%", resize: "vertical" }} />
            </div>
            <div>
              <label className="field-label">کانال‌های ارسال</label>
              <div style={{ display: "flex", gap: "1rem", marginTop: "0.5rem" }}>
                {["IN_APP", "EMAIL", "SMS", "TELEGRAM"].map((ch) => (
                  <label key={ch} style={{ display: "flex", alignItems: "center", gap: "0.25rem", fontSize: "0.85rem" }}>
                    <input type="checkbox" checked={form.channels.includes(ch)} onChange={() => channelToggle(ch)} />
                    {ch}
                  </label>
                ))}
              </div>
            </div>
            {sendResult === "success" ? (
              <div style={{ color: "var(--success)", padding: "0.5rem 0" }}>اعلان با موفقیت ارسال شد</div>
            ) : sendResult ? (
              <div style={{ color: "var(--danger)", padding: "0.5rem 0" }}>{sendResult}</div>
            ) : null}
            <button className="btn" type="submit" disabled={sending} style={{ alignSelf: "flex-start" }}>
              {sending ? "در حال ارسال..." : "ارسال"}
            </button>
          </form>
        </Card>
      )}

      {tab === "list" && (
        <>
          <Card title="فیلترها" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "0.75rem", alignItems: "flex-end" }}>
              <div>
                <label className="field-label">شناسه کاربر</label>
                <input className="input" value={filters.userId} onChange={(e) => setFilters((f) => ({ ...f, userId: e.target.value }))} placeholder="UUID" />
              </div>
              <div>
                <label className="field-label">نوع</label>
                <select className="input" value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))}>
                  <option value="">همه</option>
                  {Object.keys(TYPE_LABELS).map((k) => <option key={k} value={k}>{TYPE_LABELS[k]}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">کانال</label>
                <select className="input" value={filters.channel} onChange={(e) => setFilters((f) => ({ ...f, channel: e.target.value }))}>
                  <option value="">همه</option>
                  {["IN_APP", "EMAIL", "SMS", "TELEGRAM"].map((ch) => <option key={ch} value={ch}>{ch}</option>)}
                </select>
              </div>
              <div>
                <label className="field-label">وضعیت</label>
                <select className="input" value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
                  <option value="">همه</option>
                  {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <button className="btn" onClick={() => { setNotifPage(1); loadNotifs(1); }}>اعمال فیلتر</button>
            </div>
          </Card>

          {notifLoading ? <Loading label="بارگذاری اعلان‌ها..." /> : (
            <>
              <Card title={`اعلان‌ها (${notifTotal})`}>
                {notifs.length === 0 ? (
                  <div className="empty-state">اعلانی یافت نشد</div>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr><th>کاربر</th><th>نوع</th><th>عنوان</th><th>کانال</th><th>وضعیت</th><th>تاریخ</th></tr>
                    </thead>
                    <tbody>
                      {notifs.map((n: any) => (
                        <tr key={n.id}>
                          <td>{n.user?.phone || n.userId?.slice(0, 8) || "—"}</td>
                          <td><Badge kind="gray">{TYPE_LABELS[n.type] || n.type}</Badge></td>
                          <td style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{n.title}</td>
                          <td>{n.channel}</td>
                          <td><span className={`badge ${STATUS_CLASSES[n.status] || ""}`}>{STATUS_LABELS[n.status] || n.status}</span></td>
                          <td style={{ fontSize: "0.8rem" }}>{fmtDate(n.sentAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Card>

              {notifTotal > 50 && (
                <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1rem" }}>
                  <button className="btn ghost" disabled={notifPage <= 1} onClick={() => setNotifPage((p) => p - 1)}>قبلی</button>
                  <span style={{ padding: "0.5rem 1rem", color: "var(--text-muted)" }}>صفحه {notifPage} از {Math.ceil(notifTotal / 50)}</span>
                  <button className="btn ghost" disabled={notifPage >= Math.ceil(notifTotal / 50)} onClick={() => setNotifPage((p) => p + 1)}>بعدی</button>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}