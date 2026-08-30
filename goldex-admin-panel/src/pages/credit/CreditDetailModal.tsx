import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../../api/client";
import { Modal, Loading, Empty, Badge } from "../../components/ui";
import { useNotify } from "../../notifications/NotifyProvider";
import type { Credit, CreditSettlement } from "../../api/types";
import {
  STATUS_LABELS, STATUS_KINDS,
  SETTLEMENT_STATE_LABELS, SETTLEMENT_STATE_KINDS,
  SETTLEMENT_METHOD_LABELS,
  RISK_STATE_LABELS, RISK_STATE_KINDS,
  ORDER_STATUS_LABELS, CREDIT_ORDER_STATUS_LABELS,
  fmtNum, fmtDate,
} from "./labels";
import { SettlementPromptModal, ForceClearLiabilityModal } from "./SettlementModals";

export function CreditDetailModal({ credit, onClose }: { credit: Credit; onClose: () => void }) {
  const notify = useNotify().notify;
  const [prompt, setPrompt] = useState<{ kind: "reject" | "method" | "fund" | "receive" | "fail"; settlementId: string; currentMethod?: string | null; nettingEnabled?: boolean } | null>(null);
  const [forceSettlementId, setForceSettlementId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const creditDetail = useQuery({
    queryKey: ["credit-detail", credit.id],
    queryFn: async () => unwrap<Credit>((await api.get(`/admin/credits/${credit.id}`)).data),
  });

  // Fetch PnL calculation
  const pnl = useQuery({
    queryKey: ["credit-pnl", credit.id],
    queryFn: async () => unwrap<{
      totalPnL: number;
      realizedPnL: number;
      unrealizedPnL: number;
      orders: Array<{
        orderId: string;
        side: string;
        entryPrice: number;
        currentPrice: number | null;
        quantity: number;
        executedQuantity: number;
        pnl: number;
        status: string;
        pairKey: string;
      }>;
    }>((await api.get(`/admin/credits/${credit.id}/pnl`)).data),
  });

  const c = creditDetail.data || credit;
  const pnlData = pnl.data;

  const risk = useQuery({
    queryKey: ["credit-risk", credit.id],
    queryFn: async () => unwrap<any>((await api.get(`/admin/credits/${credit.id}/risk`)).data),
  });

  const riskData = risk.data;

  // Per-trade collateral locks (handoff §13).
  const locks = useQuery({
    queryKey: ["credit-locks", credit.id],
    queryFn: async () => unwrap<{ summary: any; locks: any[] }>((await api.get(`/admin/credits/${credit.id}/locks`)).data),
  });

  // Delivery-based settlement workflows (handoff §7).
  const settlements = useQuery({
    queryKey: ["credit-settlements", credit.id],
    queryFn: async () => unwrap<CreditSettlement[]>((await api.get(`/admin/credits/${credit.id}/settlements`)).data),
  });

  // Runs a settlement-workflow step and reports the outcome as a toast
  // instead of leaving the admin guessing (the previous version had no
  // success feedback at all, and errors were silently swallowed).
  async function runSettlementAction(fn: () => Promise<any>, successTitle: string) {
    setActionBusy(true);
    try {
      await fn();
      notify({ title: successTitle, kind: "success" });
      settlements.refetch();
    } catch (e: any) {
      notify({ title: "خطا در عملیات تسویه", body: apiError(e), kind: "error" });
      throw e;
    } finally {
      setActionBusy(false);
    }
  }

  // Separate from runSettlementAction: a negative-position rejection here
  // isn't a generic error, it's a decision point (offer the force-settle
  // modal), so it gets its own message instead of a duplicate error toast.
  async function clearLiability(settlementId: string, force?: boolean) {
    setActionBusy(true);
    try {
      await api.post(`/admin/credits/settlements/${settlementId}/clear-liability`, force ? { force: true } : undefined);
      notify({ title: force ? "تسویه بدهی به‌صورت اجباری ثبت شد" : "بدهی تسویه شد", kind: "success" });
      settlements.refetch();
      setForceSettlementId(null);
    } catch (e: any) {
      const msg = apiError(e);
      if (!force && String(msg).includes("CREDIT_NOT_SETTLEABLE_NEGATIVE_POSITION")) {
        setForceSettlementId(settlementId);
      } else {
        notify({ title: "خطا در تسویه بدهی", body: msg, kind: "error" });
      }
    } finally {
      setActionBusy(false);
    }
  }

  function submitPrompt(value: string) {
    if (!prompt) return;
    const { kind, settlementId } = prompt;
    const actions: Record<"reject" | "method" | "fund" | "receive" | "fail", { fn: () => Promise<any>; success: string }> = {
      reject: {
        fn: () => api.post(`/admin/credits/settlements/${settlementId}/reject`, { reason: value }),
        success: "درخواست تسویه رد شد",
      },
      method: {
        fn: () => api.post(`/admin/credits/settlements/${settlementId}/select-method`, { method: value }),
        success: "روش تسویه ثبت شد",
      },
      fund: {
        fn: () => api.post(`/admin/credits/settlements/${settlementId}/fund`, { amount: Number(value) }),
        success: "تأمین کسری ثبت شد",
      },
      receive: {
        fn: () => api.post(`/admin/credits/settlements/${settlementId}/receive`, { amount: Number(value) }),
        success: "تحویل دارایی ثبت شد",
      },
      fail: {
        fn: () => api.post(`/admin/credits/settlements/${settlementId}/fail`, { reason: value }),
        success: "تسویه به‌عنوان ناموفق ثبت شد",
      },
    };
    runSettlementAction(actions[kind].fn, actions[kind].success)
      .then(() => setPrompt(null))
      .catch(() => {});
  }

  return (
    <>
    <Modal title={`جزئیات اعتبار ${c.creditCode}`} onClose={onClose} wide>
      {creditDetail.isLoading ? (
        <Loading />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Risk / Valuation */}
          {riskData && (
            <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
              <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>ارزیابی ریسک (Mark-to-Market)</h4>
              {riskData.eligible === false && (
                <div style={{ background: "var(--red-bg, #3a1414)", color: "var(--red)", padding: "8px 10px", borderRadius: 6, fontSize: 12.5, marginBottom: 10, fontWeight: 600 }}>
                  تسویه داوطلبانه مسدود است: کسری {fmtNum(riskData.valuation?.shortfall)} ریال پس از وثیقه باقی می‌ماند.
                  کاربر باید موقعیت منفی را بازخرید کند یا کیف‌پول واریز را شارژ کند (یا از گزینه «تسویه اجباری» استفاده کنید).
                </div>
              )}
              {riskData.stateError ? (
                <div style={{ color: "var(--red)", fontSize: 13 }}>قیمت مارک در دسترس نیست ({riskData.stateError})</div>
              ) : riskData.valuation ? (
                <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <span className="k">ارزش خالص</span>
                  <span className="v mono" style={{ color: riskData.valuation.netEquity >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                    {fmtNum(riskData.valuation.netEquity)} ریال
                  </span>
                  <span className="k">سرمایه (Equity)</span>
                  <span className="v mono">{fmtNum(riskData.valuation.equity)} ریال</span>
                  <span className="k">نسبت مارجین</span>
                  <span className="v mono">{riskData.valuation.marginRatio != null ? (riskData.valuation.marginRatio * 100).toFixed(2) + "%" : "—"}</span>
                  <span className="k">قرض گرفته (IRR)</span>
                  <span className="v mono">{fmtNum(riskData.valuation.borrowedIr)} ریال</span>
                  <span className="k">ارزش وثیقه</span>
                  <span className="v mono">{fmtNum(riskData.valuation.collateralValue)} ریال</span>
                  <span className="k">در معرض (Exposure)</span>
                  <span className="v mono">{fmtNum(riskData.valuation.exposure)} ریال</span>
                  <span className="k">استفاده‌شده</span>
                  <span className="v mono">{fmtNum(riskData.usedCredit)} ریال</span>
                  <span className="k">موجود</span>
                  <span className="v mono">{fmtNum(riskData.availableCredit)} ریال</span>
                </div>
              ) : null}

              {(riskData.valuation?.positions || []).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>پوزیشن‌ها</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>نماد</th><th>خالص (g)</th><th>قیمت مارک</th></tr></thead>
                      <tbody>
                        {riskData.valuation.positions.map((p: any, i: number) => (
                          <tr key={i}>
                            <td className="mono">{p.baseSymbolSlug}</td>
                            <td className="mono" style={Number(p.netXau) < 0 ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                              {fmtNum(p.netXau)}
                            </td>
                            <td className="mono">{fmtNum(p.markPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {riskData.balances?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>موجودی کیف‌پول اعتبار</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>نماد</th><th>آزاد</th><th>مسدود</th><th>اعتبار</th></tr></thead>
                      <tbody>
                        {riskData.balances.map((b: any, i: number) => (
                          <tr key={i}>
                            <td className="mono">{b.symbolSlug}</td>
                            <td className="mono">{fmtNum(b.freeBalance)}</td>
                            <td className="mono">{fmtNum(b.lockedBalance)}</td>
                            <td className="mono">{fmtNum(b.creditBalance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
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

          {/* PnL Section */}
          {pnl.isLoading ? (
            <Loading />
          ) : pnlData ? (
            <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
              <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>سود و زیان</h4>
              <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <span className="k">کل سود/زیان</span>
                <span className="v mono" style={{ color: pnlData.totalPnL >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                  {pnlData.totalPnL >= 0 ? "+" : ""}{fmtNum(pnlData.totalPnL)} ریال
                </span>

                <span className="k">سود/زیان محقق شده</span>
                <span className="v mono" style={{ color: pnlData.realizedPnL >= 0 ? "var(--green)" : "var(--red)" }}>
                  {pnlData.realizedPnL >= 0 ? "+" : ""}{fmtNum(pnlData.realizedPnL)} ریال
                </span>

                <span className="k">سود/زیان محقق نشده</span>
                <span className="v mono" style={{ color: pnlData.unrealizedPnL >= 0 ? "var(--green)" : "var(--red)" }}>
                  {pnlData.unrealizedPnL >= 0 ? "+" : ""}{fmtNum(pnlData.unrealizedPnL)} ریال
                </span>
              </div>
            </div>
          ) : null}

          {/* Orders Section */}
          <div>
            <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>سفارشات اعتباری ({pnlData?.orders.length || 0})</h4>
            {pnlData?.orders.length === 0 ? (
              <Empty label="هیچ سفارشی ثبت نشده" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>جفت</th>
                      <th>جهت</th>
                      <th>قیمت ورود</th>
                      <th>قیمت فعلی</th>
                      <th>مقدار</th>
                      <th>انجام شده</th>
                      <th>سود/زیان</th>
                      <th>وضعیت سفارش</th>
                      <th>وضعیت اعتبار</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnlData?.orders.map((o) => (
                      <tr key={o.orderId}>
                        <td className="mono">{o.pairKey}</td>
                        <td>
                          <Badge kind={o.side === "BUY" ? "green" : "red"}>
                            {o.side === "BUY" ? "خرید" : "فروش"}
                          </Badge>
                        </td>
                        <td className="mono">{fmtNum(o.entryPrice)}</td>
                        <td className="mono">{o.currentPrice ? fmtNum(o.currentPrice) : "—"}</td>
                        <td className="mono">{fmtNum(o.quantity)}</td>
                        <td className="mono">{fmtNum(o.executedQuantity)}</td>
                        <td className="mono" style={{ color: o.pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500 }}>
                          {o.pnl >= 0 ? "+" : ""}{fmtNum(o.pnl)}
                        </td>
                        <td>
                          <Badge kind={o.status === "COMPLETED" ? "green" : o.status === "CANCELLED" ? "gray" : "gold"}>
                            {ORDER_STATUS_LABELS[o.status] || o.status}
                          </Badge>
                        </td>
                        <td>
                          <Badge kind={
                            c.creditOrders?.find(co => co.orderId === o.orderId)?.status === "ACTIVE" ? "green" :
                            c.creditOrders?.find(co => co.orderId === o.orderId)?.status === "MARGIN_CALLED" ? "red" :
                            c.creditOrders?.find(co => co.orderId === o.orderId)?.status === "COMPLETED" ? "gold" : "gray"
                          }>
                            {CREDIT_ORDER_STATUS_LABELS[c.creditOrders?.find(co => co.orderId === o.orderId)?.status || ""] || "—"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Collateral Locks (handoff §3, §13) */}
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>قفل وثیقه (Collateral Locks)</h4>
            {locks.isLoading ? <Loading /> : locks.data ? (
              <>
                <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
                  <span className="k">وثیقه کل</span>
                  <span className="v mono">{fmtNum(c.collateralAmount ?? 0)}</span>
                  <span className="k">قفل‌شده</span>
                  <span className="v mono" style={{ color: "var(--gold)", fontWeight: 600 }}>{fmtNum(locks.data.summary.totalLocked)}</span>
                  <span className="k">آزاد (Available)</span>
                  <span className="v mono">{fmtNum(locks.data.summary.available)}</span>
                  <span className="k">آزادشده (Released)</span>
                  <span className="v mono">{fmtNum(locks.data.summary.released)}</span>
                  <span className="k">مصرف‌شده (Consumed)</span>
                  <span className="v mono" style={{ color: locks.data.summary.consumed > 0 ? "var(--red)" : "inherit" }}>{fmtNum(locks.data.summary.consumed)}</span>
                </div>
                {(locks.data.locks || []).length === 0 ? (
                  <Empty label="هیچ قفلی ثبت نشده" />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>مبلغ (g)</th><th>مبلغ اسمی</th><th>وضعیت</th><th>فعال‌شده</th><th>تاریخ</th></tr></thead>
                      <tbody>
                        {locks.data.locks.map((l: any) => (
                          <tr key={l.id}>
                            <td className="mono">{fmtNum(l.amount)}</td>
                            <td className="mono">{fmtNum(l.notionalValue)}</td>
                            <td>
                              <Badge kind={l.status === "ACTIVE" ? "green" : l.status === "RELEASED" ? "gold" : l.status === "CONSUMED" ? "red" : "gray"}>
                                {l.status === "ACTIVE" ? "فعال" : l.status === "RELEASED" ? "آزاد" : l.status === "CONSUMED" ? "مصرف" : l.status}
                              </Badge>
                            </td>
                            <td className="mono">{l.creditOrder ? l.creditOrder.order?.orderCode || l.creditOrder.id?.slice(0, 8) : "—"}</td>
                            <td>{fmtDate(l.activatedAt || l.releasedAt || l.consumedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Delivery-based settlement workflows (handoff §6, §7) */}
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 14 }}>فرآیند تسویه تحویلی (Settlement Workflow)</h4>
              {c.status === "ACTIVE" && (
                <button className="btn sm" onClick={async () => {
                  await api.post(`/admin/credits/${c.id}/settlement-workflow`, { notes: "admin requested" });
                  settlements.refetch();
                }}>
                  درخواست تسویه تحویلی
                </button>
              )}
            </div>
            {settlements.isLoading ? <Loading /> : settlements.data?.length === 0 ? (
              <Empty label="هیچ تسویه تحویلی درخواست نشده" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr>
                    <th>وضعیت</th><th>ارزش‌گذاری</th><th>Exposure/وثیقه</th><th>کسری</th>
                    <th>روش</th><th>موردنیاز</th><th>دریافتی</th><th>تأمین</th><th>عملیات</th>
                  </tr></thead>
                  <tbody>
                    {(settlements.data || []).map((s: any) => (
                      <tr key={s.id}>
                        <td>
                          <Badge kind={s.status === "CLOSED" ? "green" : s.status === "REJECTED" || s.status === "FAILED" ? "red" : s.status === "PENDING_ADMIN_REVIEW" ? "gold" : "gray"}>
                            {s.status}
                          </Badge>
                        </td>
                        <td className="mono" style={{ fontSize: 11 }}>
                          {s.valuationState ? (
                            <>
                              {s.valuationState === "EXPOSURE_LT_COLLATERAL" ? "exposure<وثیقه" :
                               s.valuationState === "EXPOSURE_GT_COLLATERAL" ? "exposure>وثیقه" : "exposure=وثیقه"}
                            </>
                          ) : "—"}
                        </td>
                        <td className="mono" style={{ fontSize: 11 }}>
                          {s.exposureValue != null || s.collateralValue != null
                            ? `${fmtNum(s.exposureValue ?? 0)} / ${fmtNum(s.collateralValue ?? 0)}`
                            : "—"}
                        </td>
                        <td className="mono" style={{ fontSize: 11, color: Number(s.shortfall) > 0 ? "var(--red)" : "inherit" }}>
                          {Number(s.shortfall) > 0 ? fmtNum(s.shortfall) : "—"}
                        </td>
                        <td className="mono">{s.settlementMethod ? SETTLEMENT_METHOD_LABELS[s.settlementMethod] ?? s.settlementMethod : "—"}</td>
                        <td className="mono">{fmtNum(s.requiredAmount)}</td>
                        <td className="mono">{fmtNum(s.receivedAmount)}</td>
                        <td className="mono">{fmtNum(s.fundedAmount ?? 0)}</td>
                        <td>
                          <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                            {s.status === "PENDING_ADMIN_REVIEW" && (
                              <>
                                <button className="btn sm" disabled={actionBusy} onClick={() => runSettlementAction(() => api.post(`/admin/credits/settlements/${s.id}/approve`, { reason: "approved" }), "درخواست تسویه تأیید شد")}>تأیید</button>
                                <button className="btn sm ghost" disabled={actionBusy} onClick={() => setPrompt({ kind: "reject", settlementId: s.id })}>رد</button>
                              </>
                            )}
                            {(s.status === "APPROVED" || s.status === "VALUATED") && (
                              <button className="btn sm" disabled={actionBusy} onClick={() => runSettlementAction(() => api.post(`/admin/credits/settlements/${s.id}/valuate`), "ارزش‌گذاری انجام شد")}>ارزش‌گذاری</button>
                            )}
                            {(s.status === "APPROVED" || s.status === "VALUATED" || s.status === "METHOD_SELECTED" || s.status === "FUNDING_REQUIRED") && (
                              <button className="btn sm" disabled={actionBusy} onClick={() => setPrompt({ kind: "method", settlementId: s.id, currentMethod: s.settlementMethod, nettingEnabled: !!c.nettingEnabled })}>روش</button>
                            )}
                            {(s.status === "METHOD_SELECTED" || s.status === "FUNDING_REQUIRED" || s.status === "READY") && Number(s.shortfall) > 0 && (
                              <button className="btn sm" disabled={actionBusy} onClick={() => setPrompt({ kind: "fund", settlementId: s.id })}>تأمین</button>
                            )}
                            {s.settlementMethod !== "TOPUP" && (s.status === "APPROVED" || s.status === "VALUATED" || s.status === "METHOD_SELECTED" || s.status === "FUNDING_REQUIRED" || s.status === "READY" || s.status === "ASSET_RECEIVED" || s.status === "ASSET_VERIFIED") && (
                              <button className="btn sm" disabled={actionBusy} onClick={() => setPrompt({ kind: "receive", settlementId: s.id })}>تحویل</button>
                            )}
                            {s.settlementMethod === "TOPUP" && s.status === "ASSET_VERIFIED" && (
                              <span style={{ fontSize: 11, color: "var(--text-faint)", alignSelf: "center" }}>بدون تحویل — آماده تسویه بدهی</span>
                            )}
                            {s.status === "ASSET_RECEIVED" && (
                              <button className="btn sm" disabled={actionBusy} onClick={() => runSettlementAction(() => api.post(`/admin/credits/settlements/${s.id}/verify`), "دارایی تأیید شد")}>تأیید دارایی</button>
                            )}
                            {s.status === "ASSET_VERIFIED" && (
                              <button className="btn sm" disabled={actionBusy} onClick={() => clearLiability(s.id)}>تسویه بدهی</button>
                            )}
                            {s.status === "LIABILITY_CLEARED" && (
                              <button className="btn sm" disabled={actionBusy} onClick={() => runSettlementAction(() => api.post(`/admin/credits/settlements/${s.id}/settle-asset`), "دارایی تسویه شد")}>تسویه دارایی</button>
                            )}
                            {s.status === "ASSET_SETTLED" && (
                              <button className="btn sm" disabled={actionBusy} onClick={() => runSettlementAction(() => api.post(`/admin/credits/settlements/${s.id}/release-collateral`), "وثیقه آزاد شد")}>آزادسازی وثیقه</button>
                            )}
                            {s.status === "COLLATERAL_RELEASED" && (
                              <button className="btn sm" disabled={actionBusy} onClick={() => runSettlementAction(() => api.post(`/admin/credits/settlements/${s.id}/close`), "تسویه با موفقیت بسته شد")}>بستن</button>
                            )}
                            {s.status !== "CLOSED" && s.status !== "REJECTED" && s.status !== "FAILED" && (
                              <button className="btn sm ghost" disabled={actionBusy} onClick={() => setPrompt({ kind: "fail", settlementId: s.id })}>شکست</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Settlement policy (handoff §6.3, §6.5) */}
          {c.status === "ACTIVE" && (
            <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
              <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>سیاست تسویه (Settlement Policy)</h4>
              <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <span className="k">تأیید ادمین (approval)</span>
                <span className="v"><Badge kind={c.requireAdminApprovalForSettlement ? "gold" : "green"}>{c.requireAdminApprovalForSettlement ? "ON" : "OFF"}</Badge></span>
                <span className="k">روش‌های مجاز</span>
                <span className="v mono" style={{ fontSize: 12 }}>{(c.settlementMethods || []).join(", ") || "FULL, NET, TOPUP"}</span>
                <span className="k">Netting</span>
                <span className="v"><Badge kind={c.nettingEnabled ? "green" : "gray"}>{c.nettingEnabled ? "فعال" : "غیرفعال"}</Badge></span>
              </div>
              <div className="row" style={{ gap: 6, marginTop: 10 }}>
                <button className="btn sm" onClick={async () => {
                  await api.post(`/admin/credits/${c.id}/settlement-policy`, { requireAdminApprovalForSettlement: !c.requireAdminApprovalForSettlement });
                  creditDetail.refetch();
                }}>
                  {c.requireAdminApprovalForSettlement ? "خاموش‌کردن تأیید ادمین" : "فعال‌کردن تأیید ادمین"}
                </button>
                <button className="btn sm" onClick={async () => {
                  await api.post(`/admin/credits/${c.id}/settlement-policy`, { nettingEnabled: !c.nettingEnabled });
                  creditDetail.refetch();
                }}>
                  {c.nettingEnabled ? "غیرفعال‌کردن Netting" : "فعال‌کردن Netting"}
                </button>
              </div>
            </div>
          )}

          {/* Metadata */}
          {c.metadata && Object.keys(c.metadata).length > 0 && (
            <details style={{ fontSize: 12 }}>
              <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>متادیتا</summary>
              <pre style={{ background: "var(--bg)", padding: 8, borderRadius: 4, overflow: "auto", fontSize: 11, direction: "ltr" }}>
                {JSON.stringify(c.metadata, null, 2)}
              </pre>
            </details>
          )}

          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>بستن</button>
          </div>
        </div>
      )}
    </Modal>

    {prompt && (
      <SettlementPromptModal
        kind={prompt.kind}
        currentMethod={prompt.currentMethod}
        nettingEnabled={prompt.nettingEnabled}
        submitting={actionBusy}
        onClose={() => setPrompt(null)}
        onSubmit={submitPrompt}
      />
    )}

    {forceSettlementId && (
      <ForceClearLiabilityModal
        creditId={credit.id}
        submitting={actionBusy}
        onClose={() => setForceSettlementId(null)}
        onConfirm={() => clearLiability(forceSettlementId, true)}
      />
    )}
    </>
  );
}
