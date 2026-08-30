import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../../../api/client";
import { Loading, Empty, Badge } from "../../../components/ui";
import { useNotify } from "../../../notifications/NotifyProvider";
import type { Credit, CreditSettlement } from "../../../api/types";
import { SETTLEMENT_METHOD_LABELS, fmtNum } from "../labels";
import { SettlementPromptModal, ForceClearLiabilityModal } from "../SettlementModals";
import { SettlementStageStepper } from "./SettlementStageStepper";

function valuationInfo(s: CreditSettlement): { text: string; tone: "green" | "gold" | "red" | "gray" } {
  if (!s.valuationState) return { text: "هنوز ارزش‌گذاری نشده", tone: "gray" };
  if (s.valuationState === "EXPOSURE_LT_COLLATERAL") return { text: "وثیقه کافی است و مازاد دارد", tone: "green" };
  if (s.valuationState === "EXPOSURE_GT_COLLATERAL") return { text: "کسری وجود دارد", tone: "red" };
  return { text: "بدهی و وثیقه دقیقاً برابرند", tone: "gold" };
}

/**
 * Delivery-based settlement workflow (handoff §6, §7): the request →
 * approve → valuate → method → fund → deliver → verify → clear-liability →
 * settle-asset → release-collateral → close pipeline for one credit
 * facility. Self-contained — owns its own settlements query and all the
 * step actions, so the parent detail modal only needs to render it.
 */
export function SettlementWorkflowPanel({ credit }: { credit: Credit }) {
  const notify = useNotify().notify;
  const [prompt, setPrompt] = useState<{ kind: "reject" | "method" | "fund" | "receive" | "fail"; settlementId: string; currentMethod?: string | null; nettingEnabled?: boolean } | null>(null);
  const [forceSettlementId, setForceSettlementId] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

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
      <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
          <h4 style={{ margin: 0, fontSize: 14 }}>فرآیند تسویه تحویلی</h4>
          {credit.status === "ACTIVE" && (
            <button className="btn sm" onClick={async () => {
              await api.post(`/admin/credits/${credit.id}/settlement-workflow`, { notes: "admin requested" });
              settlements.refetch();
            }}>
              درخواست تسویه تحویلی
            </button>
          )}
        </div>
        <p style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.7, margin: "0 0 14px 0" }}>
          هر بار که برای یک معامله اعتباری تسویه درخواست می‌شود، یک «تسویه» جدید در این لیست ساخته می‌شود و از مرحله
          درخواست تا بسته‌شدن پیش می‌رود. هر مرحله باید طبق ترتیب زیر تکمیل شود؛ دکمه‌های موجود در هر کارت فقط
          مرحله‌ای را نشان می‌دهند که اکنون قابل انجام است.
        </p>

        {settlements.isLoading ? <Loading /> : settlements.data?.length === 0 ? (
          <Empty label="هیچ تسویه تحویلی درخواست نشده" />
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(settlements.data || []).map((s) => {
              const val = valuationInfo(s);
              return (
                <div key={s.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: "10px 12px", background: "var(--bg-elev)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                    <SettlementStageStepper status={s.status} settlementMethod={s.settlementMethod} />
                    {s.settlementMethod && (
                      <span style={{ fontSize: 11, color: "var(--gold)", fontWeight: 600, whiteSpace: "nowrap" }}>
                        روش: {SETTLEMENT_METHOD_LABELS[s.settlementMethod] ?? s.settlementMethod}
                      </span>
                    )}
                  </div>

                  <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr", fontSize: 12, marginBottom: 10 }}>
                    <span className="k" title="مقایسه بدهی (Exposure) این معامله با ارزش فعلی وثیقه">ارزش‌گذاری</span>
                    <span className="v" style={{ gridColumn: "2 / -1" }}>
                      <Badge kind={val.tone}>{val.text}</Badge>
                      {(s.exposureValue != null || s.collateralValue != null) && (
                        <span className="mono" style={{ marginInlineStart: 8, fontSize: 11, color: "var(--text-faint)" }}>
                          (بدهی {fmtNum(s.exposureValue ?? 0)} / وثیقه {fmtNum(s.collateralValue ?? 0)} ریال)
                        </span>
                      )}
                    </span>

                    {Number(s.shortfall) > 0 && (
                      <>
                        <span className="k" title="مبلغی که وثیقه پوشش نمی‌دهد و باید نقداً تأمین شود">کسری تأمین‌نشده</span>
                        <span className="v mono" style={{ color: "var(--red)", fontWeight: 600 }}>{fmtNum(s.shortfall)} ریال</span>
                      </>
                    )}

                    <span className="k" title="مقدار داراییِ لازم برای این تسویه (بر اساس روش انتخابی)">موردنیاز</span>
                    <span className="v mono">{fmtNum(s.requiredAmount)}</span>

                    <span className="k" title="مقدار دارایی‌ای که تا الان از کاربر دریافت شده">دریافتی</span>
                    <span className="v mono">{fmtNum(s.receivedAmount)}</span>

                    <span className="k" title="مبلغی که کاربر تا الان برای پوشش کسری واریز کرده">تأمین‌شده</span>
                    <span className="v mono">{fmtNum(s.fundedAmount ?? 0)}</span>
                  </div>

                  <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                    {s.status === "PENDING_ADMIN_REVIEW" && (
                      <>
                        <button className="btn sm" disabled={actionBusy} onClick={() => runSettlementAction(() => api.post(`/admin/credits/settlements/${s.id}/approve`, { reason: "approved" }), "درخواست تسویه تأیید شد")}>تأیید درخواست</button>
                        <button className="btn sm ghost" disabled={actionBusy} onClick={() => setPrompt({ kind: "reject", settlementId: s.id })}>رد درخواست</button>
                      </>
                    )}
                    {(s.status === "APPROVED" || s.status === "VALUATED") && (
                      <button className="btn sm" disabled={actionBusy} onClick={() => runSettlementAction(() => api.post(`/admin/credits/settlements/${s.id}/valuate`), "ارزش‌گذاری انجام شد")}>ارزش‌گذاری بدهی/وثیقه</button>
                    )}
                    {(s.status === "APPROVED" || s.status === "VALUATED" || s.status === "METHOD_SELECTED" || s.status === "FUNDING_REQUIRED") && (
                      <button className="btn sm" disabled={actionBusy} onClick={() => setPrompt({ kind: "method", settlementId: s.id, currentMethod: s.settlementMethod, nettingEnabled: !!credit.nettingEnabled })}>انتخاب روش تسویه</button>
                    )}
                    {(s.status === "METHOD_SELECTED" || s.status === "FUNDING_REQUIRED" || s.status === "READY") && Number(s.shortfall) > 0 && (
                      <button className="btn sm" disabled={actionBusy} onClick={() => setPrompt({ kind: "fund", settlementId: s.id })}>ثبت تأمین کسری</button>
                    )}
                    {s.settlementMethod !== "TOPUP" && (s.status === "APPROVED" || s.status === "VALUATED" || s.status === "METHOD_SELECTED" || s.status === "FUNDING_REQUIRED" || s.status === "READY" || s.status === "ASSET_RECEIVED" || s.status === "ASSET_VERIFIED") && (
                      <button className="btn sm" disabled={actionBusy} onClick={() => setPrompt({ kind: "receive", settlementId: s.id })}>ثبت تحویل دارایی</button>
                    )}
                    {s.settlementMethod === "TOPUP" && s.status === "ASSET_VERIFIED" && (
                      <span style={{ fontSize: 11, color: "var(--text-faint)", alignSelf: "center" }}>بدون تحویل — آماده تسویه بدهی</span>
                    )}
                    {s.status === "ASSET_RECEIVED" && (
                      <button className="btn sm" disabled={actionBusy} onClick={() => runSettlementAction(() => api.post(`/admin/credits/settlements/${s.id}/verify`), "دارایی تأیید شد")}>تأیید کفایت دارایی</button>
                    )}
                    {s.status === "ASSET_VERIFIED" && (
                      <button className="btn sm" disabled={actionBusy} onClick={() => clearLiability(s.id)}>تسویه بدهی</button>
                    )}
                    {s.status === "LIABILITY_CLEARED" && (
                      <button className="btn sm" disabled={actionBusy} onClick={() => runSettlementAction(() => api.post(`/admin/credits/settlements/${s.id}/settle-asset`), "دارایی تسویه شد")}>انتقال دارایی به کیف‌پول</button>
                    )}
                    {s.status === "ASSET_SETTLED" && (
                      <button className="btn sm" disabled={actionBusy} onClick={() => runSettlementAction(() => api.post(`/admin/credits/settlements/${s.id}/release-collateral`), "وثیقه آزاد شد")}>آزادسازی وثیقه</button>
                    )}
                    {s.status === "COLLATERAL_RELEASED" && (
                      <button className="btn sm" disabled={actionBusy} onClick={() => runSettlementAction(() => api.post(`/admin/credits/settlements/${s.id}/close`), "تسویه با موفقیت بسته شد")}>بستن تسویه</button>
                    )}
                    {s.status !== "CLOSED" && s.status !== "REJECTED" && s.status !== "FAILED" && (
                      <button className="btn sm ghost" disabled={actionBusy} onClick={() => setPrompt({ kind: "fail", settlementId: s.id })}>ثبت شکست</button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
