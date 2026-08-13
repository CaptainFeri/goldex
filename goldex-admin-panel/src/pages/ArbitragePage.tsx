import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";
import { Card, Loading, ErrorState, Empty, Stat } from "../components/ui";

interface ArbitrageLeg {
  providerKey: string;
  itemId: number;
  action: "buy" | "sell";
  price: number;
  priceStr: string;
  timestamp: string;
}

interface ArbitrageSignal {
  id: string;
  key: string;
  itemId: number;
  itemName: string;
  groupId: number;
  groupName: string;
  unit: string;
  buyLeg: ArbitrageLeg;
  sellLeg: ArbitrageLeg;
  legs: ArbitrageLeg[];
  profitToman: number;
  profitPercent: number;
  profitGold: number;
  goldPriceRef: number;
  deadline: string;
  detectedAt: string;
}

interface LastScan {
  scannedAt?: string;
  trigger?: string;
  totalProviders?: number;
  totalItems?: number;
  bestProfitToman?: number;
}

const toman = (n: number | undefined) =>
  (n ?? 0).toLocaleString("en-US");

function useOpportunities() {
  return useQuery({
    queryKey: ["arbitrage-opportunities"],
    queryFn: () =>
      api.get("/admin/arbitrage/opportunities").then((r) => unwrap<ArbitrageSignal[]>(r)),
    refetchInterval: 5000,
  });
}

function useAlerts() {
  return useQuery({
    queryKey: ["arbitrage-alerts"],
    queryFn: () => api.get("/admin/arbitrage/alerts").then((r) => unwrap<ArbitrageSignal[]>(r)),
    refetchInterval: 5000,
  });
}

function useLastScan() {
  return useQuery({
    queryKey: ["arbitrage-last-scan"],
    queryFn: () => api.get("/admin/arbitrage/last-scan").then((r) => unwrap<LastScan>(r)),
    refetchInterval: 5000,
  });
}

function deadlineState(deadline?: string) {
  if (!deadline) return { cls: "", label: "—" };
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { cls: "text-red", label: "منقضی" };
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return {
    cls: diff < 30_000 ? "text-red" : diff < 120_000 ? "text-gold" : "",
    label: `${m}:${String(sec).padStart(2, "0")}`,
  };
}

export default function ArbitragePage() {
  const opp = useOpportunities();
  const alerts = useAlerts();
  const scan = useLastScan();

  const loading = opp.isLoading || alerts.isLoading || scan.isLoading;
  const error = opp.error || alerts.error || scan.error;

  if (loading) return <Loading label="در حال دریافت فرصت‌های آربیتراژ…" />;
  if (error) return <ErrorState message={(error as any)?.message ?? "خطا در دریافت داده‌ها"} />;

  const opps = opp.data ?? [];
  const alertList = alerts.data ?? [];
  const last = scan.data ?? {};
  const best = opps.reduce((m, s) => Math.max(m, s.profitToman ?? 0), 0);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="stat-grid">
        <Stat label="فرصت فعال" value={opps.length} />
        <Stat label="بهترین سود (تومان)" value={toman(best)} />
        <Stat label="هشدارهای جدید" value={alertList.length} />
        <Stat
          label="آخرین اسکن"
          value={last.scannedAt ? new Date(last.scannedAt).toLocaleTimeString("fa-IR") : "—"}
          sub={`${last.totalProviders ?? 0} تأمین‌کننده • ${last.totalItems ?? 0} قلم`}
        />
      </div>

      {alertList.length > 0 && (
        <Card title="هشدارهای فرصت آربیتراژ" action={<BadgeDots n={alertList.length} />}>
          <div style={{ display: "grid", gap: 8 }}>
            {alertList.slice(0, 8).map((s) => (
              <div key={s.id ?? s.key} className="row spread" style={{ background: "var(--bg-soft)", padding: "8px 12px", borderRadius: 8 }}>
                <div>
                  <b>{s.itemName}</b>{" "}
                  <span className="text-faint" style={{ fontSize: 12 }}>
                    ({s.buyLeg.providerKey} → {s.sellLeg.providerKey})
                  </span>
                </div>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <span className="mono text-green">+{toman(s.profitToman)} تومان</span>
                  <span className="mono text-gold">({s.profitPercent?.toFixed(2)}٪)</span>
                  <span className="text-faint" style={{ fontSize: 12 }}>
                    {new Date(s.detectedAt).toLocaleTimeString("fa-IR")}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      <Card title="فرصت‌های آربیتراژ فعال">
        {opps.length === 0 ? (
          <Empty label="در حال حاضر فرصت فعالی وجود ندارد." />
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>قلم</th>
                <th>خرید (ارزان‌ترین)</th>
                <th>فروش (گران‌ترین)</th>
                <th>سود (تومان)</th>
                <th>سود ٪</th>
                <th>انقضا</th>
              </tr>
            </thead>
            <tbody>
              {opps.map((s) => {
                const ds = deadlineState(s.deadline);
                return (
                  <tr key={s.id ?? s.key}>
                    <td>
                      <b>{s.itemName}</b>
                      <div className="text-faint" style={{ fontSize: 12 }}>
                        {s.groupName} • {s.unit}
                      </div>
                    </td>
                    <td className="mono">
                      {s.buyLeg.providerKey}
                      <div className="text-faint mono" style={{ fontSize: 12 }}>
                        {s.buyLeg.priceStr ?? toman(s.buyLeg.price)}
                      </div>
                    </td>
                    <td className="mono">
                      {s.sellLeg.providerKey}
                      <div className="text-faint mono" style={{ fontSize: 12 }}>
                        {s.sellLeg.priceStr ?? toman(s.sellLeg.price)}
                      </div>
                    </td>
                    <td className="mono text-green">+{toman(s.profitToman)}</td>
                    <td className="mono text-gold">{s.profitPercent?.toFixed(2)}٪</td>
                    <td className={`mono ${ds.cls}`}>{ds.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function BadgeDots({ n }: { n: number }) {
  return (
    <span className="badge red" style={{ marginInlineStart: 8 }}>
      {n} جدید
    </span>
  );
}
