import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiError } from "../api/client";
import { bankAccountsApi, p2pApi } from "../api/p2p";
import { Card, Stat, Badge, Loading, ErrorState, Empty, Modal } from "../components/ui";
import {
  P2P_ESCALATION_REASONS,
  P2P_ESCALATION_STATUS,
  P2P_MATCH_STATUS,
  P2P_RESOLUTIONS,
} from "../lib/enums";
import type { P2pEscalation, P2pResolutionType } from "../api/types";

const fmtNum = (n: any) => Number(n ?? 0).toLocaleString("fa-IR");
const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/** Age in whole minutes/hours — the number an operator triages on. */
function ageLabel(from?: string) {
  if (!from) return "—";
  const mins = Math.floor((Date.now() - new Date(from).getTime()) / 60000);
  if (mins < 60) return `${mins.toLocaleString("fa-IR")} دقیقه`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours.toLocaleString("fa-IR")} ساعت`;
  return `${Math.floor(hours / 24).toLocaleString("fa-IR")} روز`;
}

/** How close this case is to its deadline — red once it has passed. */
function DeadlineCell({ at }: { at?: string | null }) {
  if (!at) return <span>—</span>;
  const left = new Date(at).getTime() - Date.now();
  const mins = Math.round(left / 60000);
  if (left <= 0) return <Badge kind="red">گذشته</Badge>;
  if (mins < 30) return <Badge kind="red">{mins.toLocaleString("fa-IR")} دقیقه</Badge>;
  if (mins < 120) return <Badge kind="gold">{mins.toLocaleString("fa-IR")} دقیقه</Badge>;
  return <span style={{ fontSize: 12 }}>{fmtDateTime(at)}</span>;
}

const STATUS_KIND: Record<string, "green" | "red" | "gold" | "gray"> = {
  OPEN: "red",
  ASSIGNED: "gold",
  RESOLVED: "green",
  VOID: "gray",
};

export default function P2pEscalationsPage() {
  const [statusFilter, setStatusFilter] = useState("OPEN");
  const [reasonFilter, setReasonFilter] = useState("");
  const [selected, setSelected] = useState<P2pEscalation | null>(null);
  const qc = useQueryClient();

  const dashboard = useQuery({
    queryKey: ["p2p-dashboard"],
    queryFn: p2pApi.dashboard,
    // Escalations age fast; keep the header cards close to live.
    refetchInterval: 30_000,
  });

  const list = useQuery({
    queryKey: ["p2p-escalations", statusFilter, reasonFilter],
    queryFn: () =>
      p2pApi.listEscalations({
        status: statusFilter || undefined,
        reason: reasonFilter || undefined,
      }),
    refetchInterval: 30_000,
  });

  const resolve = useMutation({
    mutationFn: ({ id, ...body }: any) => p2pApi.resolveEscalation(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["p2p-escalations"] });
      qc.invalidateQueries({ queryKey: ["p2p-dashboard"] });
      setSelected(null);
    },
  });

  const d = dashboard.data;
  const rows = list.data?.items ?? [];

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="برداشت‌های در جریان" value={fmtNum(d?.pendingWithdrawals)} />
        <Stat label="واریزهای بدون تطبیق" value={fmtNum(d?.unmatchedDeposits)} />
        <Stat label="در انتظار تأیید برداشت‌کننده" value={fmtNum(d?.waitingConfirmation)} />
        <Stat label="ارجاع‌شده به ادمین" value={fmtNum(d?.escalated)} />
        <Stat label="نزدیک به مهلت" value={fmtNum(d?.timeoutRisk)} />
        <Stat
          label="نقدینگی حساب‌های مدیر"
          value={fmtNum(d?.adminLiquidity)}
          sub={
            d?.adminLiquidityBySymbol?.length
              ? d.adminLiquidityBySymbol.map((r) => `${r.slug ?? "—"}: ${fmtNum(r.balance)}`).join(" · ")
              : "کیف پول مدیر تنظیم نشده است"
          }
        />
        <Stat
          label="تسویه امروز"
          value={fmtNum(d?.todayCompletedCount)}
          sub={`${fmtNum(d?.todayCompletedAmount)} ریال`}
        />
      </div>

      <Card
        title="صف تعیین‌تکلیف (Escalation)"
        action={
          <div className="row" style={{ gap: 8 }}>
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">همه وضعیت‌ها</option>
              {Object.entries(P2P_ESCALATION_STATUS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
            <select className="select" value={reasonFilter} onChange={(e) => setReasonFilter(e.target.value)}>
              <option value="">همه علت‌ها</option>
              {Object.entries(P2P_ESCALATION_REASONS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        }
      >
        {list.isLoading ? <Loading /> :
         list.isError ? <ErrorState message={apiError(list.error)} /> :
         !rows.length ? <Empty label="موردی برای تعیین‌تکلیف وجود ندارد" /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>علت</th>
                  <th>مبلغ</th>
                  <th>واریزکننده</th>
                  <th>برداشت‌کننده</th>
                  <th>وضعیت تطبیق</th>
                  <th>سن</th>
                  <th>مهلت</th>
                  <th>وضعیت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td>{P2P_ESCALATION_REASONS[e.reason] ?? e.reason}</td>
                    <td className="mono">{fmtNum(e.match?.amount)}</td>
                    <td>{e.match?.depositor?.phone ?? e.match?.depositor?.email ?? "—"}</td>
                    <td>{e.match?.withdrawer?.phone ?? e.match?.withdrawer?.email ?? "—"}</td>
                    <td>{P2P_MATCH_STATUS[e.match?.status ?? ""] ?? e.match?.status ?? "—"}</td>
                    <td>{ageLabel(e.createAt)}</td>
                    <td><DeadlineCell at={e.deadlineAt} /></td>
                    <td><Badge kind={STATUS_KIND[e.status] ?? "gray"}>{P2P_ESCALATION_STATUS[e.status] ?? e.status}</Badge></td>
                    <td>
                      <button className="btn sm" onClick={() => setSelected(e)}>
                        {e.status === "RESOLVED" || e.status === "VOID" ? "جزئیات" : "بررسی"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selected && (
        <EscalationModal
          escalation={selected}
          readOnly={selected.status === "RESOLVED" || selected.status === "VOID"}
          loading={resolve.isPending}
          error={resolve.isError ? apiError(resolve.error) : ""}
          onClose={() => { setSelected(null); resolve.reset(); }}
          onResolve={(dto) => resolve.mutate({ id: selected.id, ...dto })}
        />
      )}
    </>
  );
}

function EscalationModal({
  escalation,
  readOnly,
  onClose,
  onResolve,
  loading,
  error,
}: {
  escalation: P2pEscalation;
  readOnly?: boolean;
  onClose: () => void;
  onResolve: (dto: any) => void;
  loading?: boolean;
  error?: string;
}) {
  const [resolution, setResolution] = useState<P2pResolutionType>("CONFIRM_PAYMENT");
  const [adminAccountId, setAdminAccountId] = useState("");
  const [note, setNote] = useState("");
  const m = escalation.match;
  const proof = m?.paymentProof;

  // Only needed for SETTLE_FROM_ADMIN, and only accounts open for withdraw
  // can be a payout source.
  const payoutAccounts = useQuery({
    queryKey: ["bank-accounts-withdraw"],
    queryFn: () => bankAccountsApi.list({ direction: "withdraw", status: "ACTIVE" }),
    enabled: resolution === "SETTLE_FROM_ADMIN",
  });

  const needsAccount = resolution === "SETTLE_FROM_ADMIN";
  const dest = m?.destinationSnapshotJson;

  return (
    <Modal title={`تعیین‌تکلیف — ${P2P_ESCALATION_REASONS[escalation.reason] ?? escalation.reason}`} onClose={onClose} wide>
      {error && <div style={{ marginBottom: 12 }}><ErrorState message={error} /></div>}

      <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.9 }}>
        <div><strong>مبلغ:</strong> <span className="mono">{fmtNum(m?.amount)}</span> ریال</div>
        <div><strong>وضعیت تطبیق:</strong> {P2P_MATCH_STATUS[m?.status ?? ""] ?? m?.status ?? "—"}</div>
        <div><strong>منبع تطبیق:</strong> {m?.source === "ADMIN" ? "حساب مدیر" : "مشتری"}</div>
        <div><strong>مهلت پاسخ برداشت‌کننده:</strong> {fmtDateTime(m?.responseDeadlineAt)}</div>
        <div><strong>مهلت تسویه:</strong> {fmtDateTime(m?.settlementDeadlineAt)}</div>
        {typeof m?.score === "number" && (
          <div>
            <strong>امتیاز تطبیق:</strong> <span className="mono">{m.score.toFixed(2)}</span>
            {m.scoreBreakdownJson && (
              <details style={{ marginTop: 4 }}>
                <summary style={{ cursor: "pointer", fontSize: 12 }}>اجزای امتیاز</summary>
                <pre style={{ fontSize: 11, marginTop: 4 }}>{JSON.stringify(m.scoreBreakdownJson, null, 2)}</pre>
              </details>
            )}
          </div>
        )}
      </div>

      {dest && (
        <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.9 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>مقصدی که به واریزکننده نمایش داده شد</div>
          <div><strong>بانک:</strong> {dest.bankName ?? "—"}</div>
          <div><strong>صاحب حساب:</strong> {dest.ownerName ?? "—"}</div>
          <div><strong>شبا:</strong> <span className="mono" dir="ltr">{dest.iban ?? "—"}</span></div>
          <div><strong>شماره کارت:</strong> <span className="mono" dir="ltr">{dest.cardNumber ?? "—"}</span></div>
        </div>
      )}

      {proof ? (
        <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.9 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>
            رسید پرداخت
            {proof.ocrMismatch && <Badge kind="red">مغایرت با OCR</Badge>}
          </div>
          <div><strong>مبلغ رسید:</strong> <span className="mono">{fmtNum(proof.amount)}</span></div>
          <div><strong>کد پیگیری:</strong> <span className="mono" dir="ltr">{proof.trackingCode ?? "—"}</span></div>
          <div><strong>حساب مبدأ:</strong> <span className="mono" dir="ltr">{proof.sourceAccount ?? "—"}</span></div>
          <div><strong>حساب مقصد:</strong> <span className="mono" dir="ltr">{proof.destinationAccount ?? "—"}</span></div>
          <div><strong>زمان پرداخت:</strong> {fmtDateTime(proof.paidAt)}</div>
          {proof.receiptUrl && (
            <div style={{ marginTop: 6 }}>
              <img
                src={proof.receiptUrl}
                alt="receipt"
                style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 6, cursor: "pointer" }}
                onClick={() => window.open(proof.receiptUrl, "_blank")}
              />
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>رسیدی ثبت نشده است.</div>
      )}

      {escalation.timeline?.length ? (
        <details style={{ marginBottom: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 13 }}>تاریخچه رویدادها</summary>
          <ul style={{ fontSize: 12, lineHeight: 2, marginTop: 6 }}>
            {escalation.timeline.map((ev, i) => (
              <li key={i}>
                <span style={{ color: "var(--text-muted)" }}>{fmtDateTime(ev.at)}</span> — {ev.actor}: {ev.action}
                {ev.note ? ` (${ev.note})` : ""}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {readOnly ? (
        <>
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, fontSize: 13, lineHeight: 1.9 }}>
            <div><strong>تصمیم:</strong> {P2P_RESOLUTIONS.find((r) => r.value === escalation.resolutionType)?.label ?? "—"}</div>
            <div><strong>توضیح:</strong> {escalation.resolutionNote ?? "—"}</div>
            <div><strong>زمان:</strong> {fmtDateTime(escalation.resolvedAt)}</div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>بستن</button>
          </div>
        </>
      ) : (
        <form
          className="modal-form"
          onSubmit={(e) => {
            e.preventDefault();
            onResolve({ resolution, note, adminAccountId: needsAccount ? adminAccountId : undefined });
          }}
        >
          <div className="form-grid">
            <div className="field">
              <label>تصمیم</label>
              <select className="select" value={resolution} onChange={(e) => setResolution(e.target.value as P2pResolutionType)}>
                {P2P_RESOLUTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
            {needsAccount && (
              <div className="field">
                <label>حساب مدیر (منبع پرداخت)</label>
                <select className="select" value={adminAccountId} onChange={(e) => setAdminAccountId(e.target.value)} required>
                  <option value="">انتخاب کنید…</option>
                  {(payoutAccounts.data?.items ?? []).map((a) => (
                    <option key={a.id} value={a.id}>{a.title} — {a.bankName}</option>
                  ))}
                </select>
                {payoutAccounts.data && !payoutAccounts.data.items.length && (
                  <small style={{ color: "#f0857d" }}>
                    هیچ حسابی برای برداشت فعال نیست. ابتدا در «حساب‌های بانکی شرکت» یک حساب را برای برداشت باز کنید.
                  </small>
                )}
              </div>
            )}
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>دلیل تصمیم (الزامی — در Audit ثبت می‌شود)</label>
              <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} required
                placeholder="بررسی رسید و تطبیق اطلاعات…" />
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
            <button type="submit" className="btn" disabled={loading || !note.trim() || (needsAccount && !adminAccountId)}>
              {loading ? <><span className="spin" /> در حال ثبت…</> : "ثبت تصمیم"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
