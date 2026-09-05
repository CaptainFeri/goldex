import { KpiCard } from "./KpiCard";

export interface CreditStats {
  totals: { credits: number; active: number; settled: number; cancelled: number; expired: number };
  exposure: { activeCreditLimit: number; activeUsedCredit: number; activeCollateralValue: number; activeCollateralAmount: number };
  risk: { inDefault: number; marginCall: number; warning: number; adminReview: number; suspended: number };
  settlementDistribution: Record<string, number>;
  riskDistribution: Record<string, number>;
  pendingApproval: number;
  /** Cash-out volume and the platform profit booked on it. */
  cashout?: {
    count: number;
    volume: number;
    fees: number;
    spreadProfit: number;
    systemProfit: number;
    collateralConsumed: number;
    creditLimitReduction: number;
    byDeposit: number;
    byCollateral: number;
  };
}

export function CreditKpis({ stats, onPendingApprovalClick }: { stats: CreditStats; onPendingApprovalClick?: () => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
      <KpiCard label="کل اعتبارات" value={stats.totals.credits} tone="blue" />
      <KpiCard label="فعال" value={stats.totals.active} tone="green" />
      <KpiCard label="تسویه‌شده" value={stats.totals.settled} tone="gray" />
      <KpiCard label="لغو شده" value={stats.totals.cancelled} tone="gray" />
      <KpiCard label="حد اعتبار فعال" value={stats.exposure.activeCreditLimit} tone="gold" currency />
      <KpiCard label="اعتبار استفاده‌شده" value={stats.exposure.activeUsedCredit} tone="gold" currency />
      <KpiCard label="ارزش وثیقه فعال" value={stats.exposure.activeCollateralValue} tone="gold" currency />
      <KpiCard label="پیش‌فرض" value={stats.risk.inDefault} tone="red" />
      <KpiCard label="فراخوان سرمایه" value={stats.risk.marginCall} tone="red" />
      <KpiCard label="هشدار" value={stats.risk.warning} tone="gold" />
      <KpiCard label="بررسی ادمین" value={stats.risk.adminReview} tone="blue" />
      <KpiCard label="تعلیق شده" value={stats.risk.suspended} tone="red" />
      {stats.cashout && (
        <>
          <KpiCard label="نقد کردن اعتبار" value={stats.cashout.count} tone="blue" />
          <KpiCard label="مبلغ نقدشده" value={stats.cashout.volume} tone="gold" currency />
          <KpiCard label="سود سیستم از نقد کردن" value={stats.cashout.systemProfit} tone="green" currency />
        </>
      )}
      {onPendingApprovalClick ? (
        <button
          type="button"
          onClick={onPendingApprovalClick}
          style={{ all: "unset", cursor: stats.pendingApproval > 0 ? "pointer" : "default" }}
          title={stats.pendingApproval > 0 ? "مشاهده صف تأیید ادمین" : undefined}
        >
          <KpiCard label="در انتظار تأیید ادمین" value={stats.pendingApproval} tone={stats.pendingApproval > 0 ? "gold" : "gray"} />
        </button>
      ) : (
        <KpiCard label="در انتظار تأیید ادمین" value={stats.pendingApproval} tone={stats.pendingApproval > 0 ? "gold" : "gray"} />
      )}
    </div>
  );
}
