import { useEffect, useState } from "react";
import { api, unwrap, apiError } from "../../api/client";
import { Loading, Card, Stat, ErrorState } from "../../components/ui";

export default function CrmDashboardPage() {
  const [ticketStats, setTicketStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/admin/crm/tickets/stats");
        setTicketStats(unwrap(res.data));
      } catch (err: any) {
        setError(apiError(err));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <Loading label="بارگذاری داشبورد CRM..." />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="animate-fade-in">
      <h2 style={{ marginBottom: "1rem" }}>داشبورد CRM</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <Stat label="کل تیکت‌ها" value={ticketStats?.total ?? 0} />
        <Stat label="باز" value={ticketStats?.open ?? 0} />
        <Stat label="در حال بررسی" value={ticketStats?.inProgress ?? 0} />
        <Stat label="حل شده" value={ticketStats?.resolved ?? 0} />
        <Stat label="بسته شده" value={ticketStats?.closed ?? 0} />
        <Stat label="میانگین رضایت" value={ticketStats?.avgSatisfaction?.toFixed(1) ?? "—"} />
      </div>

      {Array.isArray(ticketStats?.byCategory) && (
        <Card title="تیکت‌ها بر اساس دسته‌بندی">
          <table className="data-table">
            <thead>
              <tr><th>دسته‌بندی</th><th>تعداد</th></tr>
            </thead>
            <tbody>
              {ticketStats.byCategory.map((c: any) => (
                <tr key={c.category}>
                  <td>{c.category}</td>
                  <td>{c.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
