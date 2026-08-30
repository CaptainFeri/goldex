import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../../../api/client";
import { Loading, Empty, Badge } from "../../../components/ui";
import { useNotify } from "../../../notifications/NotifyProvider";
import type { Credit, CashoutOptions, CashoutSource, CashoutTotals, CreditCashout } from "../../../api/types";
import { fmtNum, fmtDate, CASHOUT_SOURCE_LABELS, CASHOUT_REASON_LABELS } from "../labels";

/**
 * Cash-out of credit purchases: what the user (or an admin on their behalf)
 * paid off without closing the facility, what the platform earned on it, and
 * the fee rate that earning is driven by.
 */
export function CashoutPanel({ credit, onChanged }: { credit: Credit; onChanged?: () => void }) {
  const qc = useQueryClient();
  const notify = useNotify().notify;
  const [feeDraft, setFeeDraft] = useState<string>(String(credit.cashoutFeePercent ?? 0));

  const history = useQuery({
    queryKey: ["credit-cashouts", credit.id],
    queryFn: async () =>
      unwrap<{ items: CreditCashout[]; totals: CashoutTotals }>(
        (await api.get(`/admin/credits/${credit.id}/cashouts`)).data,
      ),
  });

  const options = useQuery({
    queryKey: ["credit-cashout-options", credit.id],
    queryFn: async () =>
      unwrap<CashoutOptions>((await api.get(`/admin/credits/${credit.id}/cashout-options`)).data),
    enabled: credit.status === "ACTIVE",
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["credit-cashouts", credit.id] });
    qc.invalidateQueries({ queryKey: ["credit-cashout-options", credit.id] });
    qc.invalidateQueries({ queryKey: ["credit-detail", credit.id] });
    qc.invalidateQueries({ queryKey: ["credit-stats"] });
    onChanged?.();
  };

  const cashout = useMutation({
    mutationFn: (body: { creditOrderId: string; source: CashoutSource }) =>
      api.post(`/admin/credits/${credit.id}/cashout`, body),
    onSuccess: () => {
      notify({ title: "خرید اعتباری نقد شد", kind: "success" });
      refresh();
    },
    onError: (e: any) => notify({ title: "خطا در نقد کردن خرید", body: apiError(e), kind: "error" }),
  });

  const saveFee = useMutation({
    mutationFn: (cashoutFeePercent: number) =>
      api.post(`/admin/credits/${credit.id}/settlement-policy`, { cashoutFeePercent }),
    onSuccess: () => {
      notify({ title: "کارمزد نقد کردن ذخیره شد", kind: "success" });
      refresh();
    },
    onError: (e: any) => notify({ title: "خطا در ذخیره کارمزد", body: apiError(e), kind: "error" }),
  });

  const totals = history.data?.totals;
  const opts = options.data;

  return (
    <>
      {/* ── Platform profit on this facility's cash-outs ───────────────── */}
      <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
        <h4 style={{ margin: "0 0 4px 0", fontSize: 14 }}>سود سیستم از نقد کردن</h4>
        <p style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.7, margin: "0 0 12px 0" }}>
          هر بار که کاربر یک خرید اعتباری را نقد می‌کند، سیستم دو منبع درآمد دارد: کارمزد نقد کردن (به ارز اعتبار)
          و کمیسیون تبدیل وثیقه، وقتی پرداخت از محل طلای بلوکه‌شده انجام شود.
        </p>
        {history.isLoading ? (
          <Loading />
        ) : (
          <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <span className="k">تعداد نقد کردن</span>
            <span className="v mono">{fmtNum(totals?.count ?? 0)}</span>
            <span className="k">مبلغ نقدشده</span>
            <span className="v mono">{fmtNum(totals?.volume ?? 0)}</span>
            <span className="k">کارمزد دریافتی</span>
            <span className="v mono">{fmtNum(totals?.fees ?? 0)}</span>
            <span className="k">کمیسیون تبدیل وثیقه</span>
            <span className="v mono">{fmtNum(totals?.spreadProfit ?? 0)}</span>
            <span className="k">سود کل سیستم</span>
            <span className="v mono" style={{ color: "var(--gold)", fontWeight: 700 }}>{fmtNum(totals?.systemProfit ?? 0)}</span>
            <span className="k">وثیقه مصرف‌شده</span>
            <span className="v mono">{fmtNum(totals?.collateralConsumed ?? 0)}</span>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "flex-end", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <label style={{ fontSize: 12.5 }}>
            <div style={{ marginBottom: 4, fontWeight: 600 }}>کارمزد نقد کردن (٪)</div>
            <input
              className="input"
              type="number"
              min={0}
              max={100}
              step={0.01}
              value={feeDraft}
              onChange={(e) => setFeeDraft(e.target.value)}
              style={{ width: 120 }}
            />
          </label>
          <button
            className="btn sm"
            disabled={saveFee.isPending || !(Number(feeDraft) >= 0 && Number(feeDraft) <= 100)}
            onClick={() => saveFee.mutate(Number(feeDraft))}
          >
            ذخیره کارمزد
          </button>
          <span style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
            روی هر نقد کردن بعدی این اعتبار اعمال می‌شود؛ کارمزد ۰ یعنی نقد کردن رایگان.
          </span>
        </div>
      </div>

      {/* ── Purchases that can still be cashed out ──────────────────────── */}
      {credit.status === "ACTIVE" && (
        <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
          <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>خریدهای قابل نقد کردن</h4>
          {options.isLoading ? (
            <Loading />
          ) : !opts?.supported ? (
            <Empty label={CASHOUT_REASON_LABELS[opts?.reason ?? ""] ?? "نقد کردن برای این اعتبار در دسترس نیست"} />
          ) : opts.trades.length === 0 ? (
            <Empty label="خرید اعتباری قابل نقد کردنی وجود ندارد" />
          ) : (
            <>
              <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
                <span className="k">موجودی کیف واریزی</span>
                <span className="v mono">{fmtNum(opts.depositBalance)}</span>
                <span className="k">وثیقه آزاد</span>
                <span className="v mono">{fmtNum(opts.collateralAvailable)}</span>
                <span className="k">کارمزد فعلی</span>
                <span className="v mono">{fmtNum(opts.feePercent)}٪</span>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>معامله</th>
                      <th>مقدار</th>
                      <th>مبلغ قابل پرداخت</th>
                      <th>کارمزد</th>
                      <th>دارایی آزادشده</th>
                      <th>سود سیستم</th>
                      <th>اقدام</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opts.trades.map((t) => (
                      <tr key={t.creditOrderId}>
                        <td>
                          <div className="mono" style={{ fontSize: 12 }}>{t.orderCode}</div>
                          <div style={{ fontSize: 11, color: "var(--text-faint)" }}>{t.pairKey}</div>
                        </td>
                        <td className="mono">{fmtNum(t.executedQuantity)}</td>
                        <td className="mono">{fmtNum(t.totalDue)}</td>
                        <td className="mono">{fmtNum(t.feeAmount)}</td>
                        <td className="mono">{fmtNum(t.assetAmount)} {t.assetSymbolSlug}</td>
                        <td className="mono" style={{ color: "var(--gold)" }}>{fmtNum(t.systemProfitValue)}</td>
                        <td>
                          {!t.eligible ? (
                            <Badge kind="gray">{CASHOUT_REASON_LABELS[t.reason ?? ""] ?? "غیرقابل نقد"}</Badge>
                          ) : (
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                              <button
                                className="btn sm"
                                disabled={!t.deposit.sufficient || cashout.isPending}
                                title={!t.deposit.sufficient ? `موجودی واریزی کافی نیست (${fmtNum(t.deposit.required)} لازم است)` : undefined}
                                onClick={() => cashout.mutate({ creditOrderId: t.creditOrderId, source: "DEPOSIT" })}
                              >
                                از کیف واریزی
                              </button>
                              <button
                                className="btn sm"
                                disabled={!t.collateral.sufficient || cashout.isPending}
                                title={
                                  t.collateral.blockedReason
                                    ? CASHOUT_REASON_LABELS[t.collateral.blockedReason] ?? "غیرفعال"
                                    : !t.collateral.sufficient
                                      ? `وثیقه آزاد کافی نیست (${fmtNum(t.collateral.requiredUnits)} لازم است)`
                                      : `کاهش سقف اعتبار: ${fmtNum(t.collateral.creditLimitReduction)}`
                                }
                                onClick={() => cashout.mutate({ creditOrderId: t.creditOrderId, source: "COLLATERAL" })}
                              >
                                از وثیقه ({fmtNum(t.collateral.requiredUnits)})
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Cash-out history ────────────────────────────────────────────── */}
      <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
        <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>سوابق نقد کردن</h4>
        {history.isLoading ? (
          <Loading />
        ) : (history.data?.items ?? []).length === 0 ? (
          <Empty label="تاکنون نقد کردنی ثبت نشده" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>تاریخ</th>
                  <th>منبع پرداخت</th>
                  <th>مبلغ</th>
                  <th>کارمزد</th>
                  <th>کمیسیون وثیقه</th>
                  <th>سود سیستم</th>
                  <th>دارایی آزادشده</th>
                  <th>کاهش سقف</th>
                </tr>
              </thead>
              <tbody>
                {(history.data?.items ?? []).map((h) => (
                  <tr key={h.id}>
                    <td>{fmtDate(h.createAt)}</td>
                    <td>
                      <Badge kind={h.source === "DEPOSIT" ? "green" : "gold"}>
                        {CASHOUT_SOURCE_LABELS[h.source] ?? h.source}
                      </Badge>
                    </td>
                    <td className="mono">{fmtNum(h.amount)}</td>
                    <td className="mono">{fmtNum(h.feeAmount)}</td>
                    <td className="mono">{fmtNum(h.spreadProfit)}</td>
                    <td className="mono" style={{ color: "var(--gold)", fontWeight: 600 }}>{fmtNum(h.systemProfitValue)}</td>
                    <td className="mono">{fmtNum(h.assetAmount)}</td>
                    <td className="mono">{fmtNum(h.creditLimitReduction)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
