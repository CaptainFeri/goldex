import { Badge } from "../../../components/ui";
import type { Credit } from "../../../api/types";
import {
  STATUS_LABELS, STATUS_KINDS,
  SETTLEMENT_STATE_LABELS, SETTLEMENT_STATE_KINDS,
  RISK_STATE_LABELS, RISK_STATE_KINDS,
  fmtNum, fmtDate,
} from "../labels";

/** The core key/value facts of a credit facility — user, amount, limits, dates, states. */
export function CreditSummary({ c }: { c: Credit }) {
  return (
    <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
      <span className="k">کاربر</span>
      <span className="v" style={{ gridColumn: "2 / -1" }}>
        {c.user ? `${c.user.firstName ?? ""} ${c.user.lastName ?? ""}`.trim() || c.user.phone || c.user.email : c.userId}
      </span>

      <span className="k">وضعیت</span>
      <span className="v">
        <Badge kind={STATUS_KINDS[c.status] as any}>{STATUS_LABELS[c.status]}</Badge>
      </span>

      <span className="k">مبلغ اعتبار</span>
      <span className="v mono">{fmtNum(c.amount)} ریال</span>

      {c.leverage != null && (
        <>
          <span className="k">اهرم</span>
          <span className="v mono">{c.leverage}x</span>
        </>
      )}

      {c.creditLimit != null && (
        <>
          <span className="k">حد اعتبار</span>
          <span className="v mono">{fmtNum(c.creditLimit)} ریال</span>
        </>
      )}

      {c.creditLimit != null && (
        <>
          <span className="k">استفاده‌شده / موجود</span>
          <span className="v mono">
            {fmtNum(c.usedCredit)} / {fmtNum(c.availableCredit ?? Math.max(0, (c.creditLimit ?? 0) - (c.usedCredit ?? 0)))} ریال
          </span>
        </>
      )}

      {c.collateralAmount != null && (
        <>
          <span className="k">وثیقه</span>
          <span className="v mono">{fmtNum(c.collateralAmount)}</span>
        </>
      )}

      {c.drawdownPercent != null && (
        <>
          <span className="k">درادون</span>
          <span className="v">
            <span style={{ color: Number(c.lastDrawdownPercent ?? 0) >= Number(c.drawdownPercent ?? 100) ? "var(--red)" : "inherit" }}>
              {Number(c.lastDrawdownPercent ?? 0).toFixed(1)}% / {c.drawdownPercent}%
            </span>
          </span>
        </>
      )}

      <span className="k">وضعیت ریسک</span>
      <span className="v">
        <Badge kind={RISK_STATE_KINDS[c.riskState] as any}>{RISK_STATE_LABELS[c.riskState] || c.riskState}</Badge>
      </span>

      <span className="k">وضعیت تسویه</span>
      <span className="v">
        <Badge kind={SETTLEMENT_STATE_KINDS[c.settlementState] as any}>{SETTLEMENT_STATE_LABELS[c.settlementState] || c.settlementState}</Badge>
      </span>

      <span className="k">ایجاد</span>
      <span className="v">{fmtDate(c.createAt)}</span>

      <span className="k">انقضا</span>
      <span className="v">{fmtDate(c.expireAt)}</span>

      {c.settledAt && (
        <>
          <span className="k">تسویه</span>
          <span className="v">{fmtDate(c.settledAt)}</span>
        </>
      )}
    </div>
  );
}
