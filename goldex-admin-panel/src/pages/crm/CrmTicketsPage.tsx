import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { apiError } from "../../api/client";
import { crmApi, SupportTicket } from "../../api/crm";
import { Loading, Card, Badge } from "../../components/ui";

const STATUS_LABELS: Record<string, string> = {
  OPEN: "باز",
  IN_PROGRESS: "در حال بررسی",
  WAITING_ON_CUSTOMER: "منتظر مشتری",
  RESOLVED: "حل شده",
  CLOSED: "بسته شده",
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "کم",
  MEDIUM: "متوسط",
  HIGH: "زیاد",
  URGENT: "فوری",
};

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function CrmTicketsPage() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filters, setFilters] = useState<{ status?: string; priority?: string; search?: string }>({});
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await crmApi.getTickets({ pageNumber: page, pageSize: 20, status: filters.status, priority: filters.priority, search: filters.search });
      setTickets(data.data || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load]);

  const priorityKind = (p: string): "red" | "gold" | "green" | "gray" => {
    if (p === "URGENT") return "red";
    if (p === "HIGH") return "gold";
    return "green";
  };

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>مدیریت تیکت‌ها</h2>
      </div>

      <Card>
        <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
          <select className="input" value={filters.status || ""} onChange={(e) => { setFilters((f) => ({ ...f, status: e.target.value || undefined })); setPage(1); }}>
            <option value="">همه وضعیت‌ها</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select className="input" value={filters.priority || ""} onChange={(e) => { setFilters((f) => ({ ...f, priority: e.target.value || undefined })); setPage(1); }}>
            <option value="">همه اولویت‌ها</option>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            className="input"
            placeholder="جستجو در عنوان یا نام کاربر..."
            value={filters.search || ""}
            onChange={(e) => { setFilters((f) => ({ ...f, search: e.target.value || undefined })); setPage(1); }}
            style={{ flex: 1, minWidth: 200 }}
          />
        </div>
      </Card>

      {loading ? <Loading label="بارگذاری تیکت‌ها..." /> : error ? <div className="error-state">{error}</div> : (
        <Card title={`تیکت‌ها (${total})`}>
          {tickets.length === 0 ? (
            <div className="empty-state">تیکتی یافت نشد</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>موضوع</th>
                  <th>کاربر</th>
                  <th>اولویت</th>
                  <th>وضعیت</th>
                  <th>دسته‌بندی</th>
                  <th>اختصاص به</th>
                  <th>تاریخ</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id}>
                    <td style={{ fontWeight: 500 }}>{t.subject}</td>
                    <td>{t.user?.firstName} {t.user?.lastName}</td>
                    <td><Badge kind={priorityKind(t.priority)}>{PRIORITY_LABELS[t.priority] || t.priority}</Badge></td>
                    <td>{STATUS_LABELS[t.status] || t.status}</td>
                    <td>{t.category}</td>
                    <td>{t.assignedTo?.phone || "—"}</td>
                    <td>{fmtDate(t.createAt)}</td>
                    <td>
                      <button className="btn ghost sm" onClick={() => navigate(`/crm/tickets/${t.id}`)}>
                        جزئیات
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {total > 20 && (
        <div style={{ display: "flex", justifyContent: "center", gap: "0.5rem", marginTop: "1rem" }}>
          <button className="btn ghost" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>قبلی</button>
          <span style={{ padding: "0.5rem" }}>صفحه {page} از {Math.ceil(total / 20)}</span>
          <button className="btn ghost" disabled={page >= Math.ceil(total / 20)} onClick={() => setPage((p) => p + 1)}>بعدی</button>
        </div>
      )}
    </div>
  );
}
