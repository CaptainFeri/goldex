import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../../../api/client";
import { Loading, Empty, Badge } from "../../../components/ui";
import { useNotify } from "../../../notifications/NotifyProvider";
import type { Credit, CreditSettlement } from "../../../api/types";
import { SETTLEMENT_METHOD_LABELS, fmtNum } from "../labels";
import { SettlementPromptModal, ForceClearLiabilityModal } from "../SettlementModals";

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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <h4 style={{ margin: 0, fontSize: 14 }}>فرآیند تسویه تحویلی (Settlement Workflow)</h4>
          {credit.status === "ACTIVE" && (
            <button className="btn sm" onClick={async () => {
              await api.post(`/admin/credits/${credit.id}/settlement-workflow`, { notes: "admin requested" });
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
                          <button className="btn sm" disabled={actionBusy} onClick={() => setPrompt({ kind: "method", settlementId: s.id, currentMethod: s.settlementMethod, nettingEnabled: !!credit.nettingEnabled })}>روش</button>
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
