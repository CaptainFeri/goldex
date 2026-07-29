import { useEffect, useState } from "react";
import { api, unwrap, apiError } from "../api/client";
import { Loading, Card, Stat, Badge } from "../components/ui";

const fmtDate = (d: string) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function NotificationsPage() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get("/admin/notifications/stats");
        setStats(unwrap(res.data));
      } catch (err: any) {
        setError(apiError(err));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <Loading label="بارگذاری آمار..." />;
  if (error) return <div className="error-state">{error}</div>;

  return (
    <div className="animate-fade-in">
      <h2 style={{ marginBottom: "1rem" }}>آمار اعلان‌ها</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        <Stat label="کل اعلان‌ها" value={stats?.total ?? 0} />
        {Array.isArray(stats?.byChannel) && stats.byChannel.map((c: any) => (
          <Stat key={c.channel} label={`کانال ${c.channel}`} value={c.count} />
        ))}
        {Array.isArray(stats?.byStatus) && stats.byStatus.map((s: any) => (
          <Stat key={s.status} label={`وضعیت ${s.status}`} value={s.count} />
        ))}
      </div>
    </div>
  );
}
