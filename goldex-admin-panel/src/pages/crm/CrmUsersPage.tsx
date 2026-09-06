import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { api, unwrap, apiError } from "../../api/client";
import { Loading, Card } from "../../components/ui";

export default function CrmUsersPage() {
  const navigate = useNavigate();
  const [users, setUsers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get("/admin/users/users", { params: { page, pageSize: 50, q: search || undefined } });
      const data: any = unwrap(res.data);
      setUsers(data.items || []);
      setTotal(data.total || 0);
    } catch (err: any) {
      setError(apiError(err));
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="animate-fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
        <h2>مشتریان CRM</h2>
        <input
          className="input"
          placeholder="جستجوی کاربر..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          style={{ width: 300 }}
        />
      </div>

      {loading ? <Loading label="بارگذاری..." /> : error ? <div className="error-state">{error}</div> : (
        <Card title={`کاربران (${total})`}>
          {users.length === 0 ? (
            <div className="empty-state">کاربری یافت نشد</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>نام</th>
                  <th>موبایل</th>
                  <th>ایمیل</th>
                  <th>نقش</th>
                  <th>وضعیت</th>
                  <th>تاریخ ثبت</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u: any) => (
                  <tr key={u.id}>
                    <td>{u.firstName} {u.lastName}</td>
                    <td>{u.phone || "—"}</td>
                    <td>{u.email || "—"}</td>
                    <td>{u.role === 0 ? "مشتری" : u.role === 3 ? "شریک" : "جدید"}</td>
                    <td>{u.blockedAt ? "مسدود" : "فعال"}</td>
                    <td>{u.createAt ? new Date(u.createAt).toLocaleDateString("fa-IR") : "—"}</td>
                    <td>
                      <button className="btn ghost sm" onClick={() => navigate(`/crm/users/${u.id}`)}>
                        نمای 360
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      )}
    </div>
  );
}
