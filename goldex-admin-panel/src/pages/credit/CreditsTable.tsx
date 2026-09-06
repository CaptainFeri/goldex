import { Loading, ErrorState, Empty, Badge } from "../../components/ui";
import type { Credit } from "../../api/types";
import {
  STATUS_LABELS, STATUS_KINDS,
  SETTLEMENT_STATE_LABELS, SETTLEMENT_STATE_KINDS,
  RISK_STATE_LABELS, RISK_STATE_KINDS,
  fmtNum, fmtDate, isMarginCalled,
} from "./labels";
import { fmtBySymbol } from "../../lib/money";

export type CreditModalKind = "detail" | "user" | "settle" | "liquidate" | "extend" | "adjust" | "cancel";

export function CreditsTable({
  items,
  loading,
  error,
  onOpen,
  onSuspend,
  onReactivate,
}: {
  items: Credit[];
  loading: boolean;
  error: any;
  onOpen: (c: Credit, modal: CreditModalKind) => void;
  onSuspend: (c: Credit) => void;
  onReactivate: (c: Credit) => void;
}) {
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!items.length) return <Empty label="هیچ اعتباری یافت نشد" />;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>کد اعتبار</th>
            <th>کاربر</th>
            <th>مبلغ</th>
            <th>اهرم</th>
            <th>حد اعتبار</th>
            <th>استفاده‌شده</th>
            <th>موجود</th>
            <th>وثیقه قفل/آزاد</th>
            <th>محدودیت‌ها</th>
            <th>درادون</th>
            <th>وضعیت</th>
            <th>وضعیت تسویه</th>
            <th>وضعیت ریسک</th>
            <th>بازه اخطار</th>
            <th>انقضا</th>
            <th>فراخوان سرمایه</th>
            <th>عملیات</th>
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id}>
              <td><code>{c.creditCode}</code></td>
              <td>
                {c.user ? `${c.user.firstName ?? ""} ${c.user.lastName ?? ""}`.trim() || c.user.phone || c.user.email || c.userId : c.userId}
              </td>
              {/*
                Two units sit side by side on a credit and mixing them is the
                easy mistake: creditLimit, usedCredit and every *Value are money
                in creditBaseSymbol, while collateral is a quantity in
                collateralSymbol (grams of gold, say). Leverage is neither.
              */}
              <td>{fmtBySymbol(c.amount, c.creditBaseSymbol?.slug)}</td>
              <td className="mono">{c.leverage != null ? `${c.leverage}x` : "—"}</td>
              <td className="mono">{fmtBySymbol(c.creditLimit, c.creditBaseSymbol?.slug)}</td>
              <td className="mono">{fmtBySymbol(c.usedCredit, c.creditBaseSymbol?.slug)}</td>
              <td className="mono">{fmtBySymbol(c.availableCredit ?? Math.max(0, (c.creditLimit ?? 0) - (c.usedCredit ?? 0)), c.creditBaseSymbol?.slug)}</td>
              <td>
                {c.collateralLocked != null ? (
                  <span className="mono" style={{ fontSize: 12 }}>
                    {fmtBySymbol(c.collateralLocked, c.collateralSymbol?.slug)}
                    {" / "}
                    {fmtBySymbol(c.collateralAmount ?? 0, c.collateralSymbol?.slug)}
                  </span>
                ) : "—"}
              </td>
              <td style={{ fontSize: 12 }}>
                {c.maxTradeChainDepth != null || c.maxConcurrentOrders != null || c.maxCreditNotional != null ? (
                  <span className="mono">
                    {[
                      c.maxConcurrentOrders != null ? `موازی ${c.maxConcurrentOrders}` : null,
                      c.maxTradeChainDepth != null ? `عمق ${c.maxTradeChainDepth}` : null,
                      c.maxCreditNotional != null ? `حد ${fmtBySymbol(c.maxCreditNotional, c.creditBaseSymbol?.slug)}` : null,
                    ].filter(Boolean).join(" | ")}
                  </span>
                ) : "—"}
              </td>
              <td>
                {c.drawdownPercent != null ? (
                  <span style={{ color: Number(c.lastDrawdownPercent ?? 0) >= Number(c.drawdownPercent ?? 100) ? "var(--red)" : "inherit" }}>
                    {Number(c.lastDrawdownPercent ?? 0).toFixed(1)}% / {c.drawdownPercent}%
                  </span>
                ) : "—"}
              </td>
              <td>
                <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                  <Badge kind={STATUS_KINDS[c.status] as "green" | "red" | "gold" | "gray"}>{STATUS_LABELS[c.status]}</Badge>
                  {isMarginCalled(c) && <Badge kind="red">مسدود / فراخوان</Badge>}
                </div>
              </td>
              <td>
                <Badge kind={(SETTLEMENT_STATE_KINDS[c.settlementState] || "gray") as any}>
                  {SETTLEMENT_STATE_LABELS[c.settlementState] || c.settlementState || "—"}
                </Badge>
              </td>
              <td>
                <Badge kind={(RISK_STATE_KINDS[c.riskState] || "gray") as any}>
                  {RISK_STATE_LABELS[c.riskState] || c.riskState || "—"}
                </Badge>
              </td>
              <td>{c.reminderTimerHours}h</td>
              <td>{fmtDate(c.expireAt)}</td>
              <td>
                {c.hasCallMargin
                  ? <Badge kind="gold">{c.callMarginPercent ?? "—"}%</Badge>
                  : <Badge kind="gray">ندارد</Badge>}
              </td>
              <td>
                <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                  <button className="btn sm" onClick={() => onOpen(c, "detail")}>جزئیات</button>
                  <button className="btn sm" onClick={() => onOpen(c, "user")}>کاربر</button>
                  {(c.status === "ACTIVE" || c.status === "SUSPENDED") && (
                    <>
                      <button className="btn sm" onClick={() => onOpen(c, "settle")}>تسویه</button>
                      <button className="btn sm" onClick={() => onOpen(c, "liquidate")}>نقد اجباری</button>
                      <button className="btn sm" onClick={() => onOpen(c, "extend")}>تمدید</button>
                      <button className="btn sm" onClick={() => onOpen(c, "adjust")}>حد اعتبار</button>
                      <button className="btn sm" onClick={() => onOpen(c, "cancel")}>لغو</button>
                    </>
                  )}
                  {c.status === "SUSPENDED"
                    ? <button className="btn sm" onClick={() => onReactivate(c)}>رفع تعلیق</button>
                    : c.status === "ACTIVE" && (
                      <button className="btn sm" onClick={() => onSuspend(c)}>تعلیق</button>
                    )}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
