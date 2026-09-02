import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiError } from "../api/client";
import { p2pApi } from "../api/p2p";
import { Card, Badge, Loading, ErrorState, Empty, Modal } from "../components/ui";
import { P2P_ESCALATION_REASONS, P2P_MATCH_STATUS } from "../lib/enums";
import type { P2pWithdrawDetail, P2pWithdrawPart, P2pWithdrawRow } from "../api/types";

const fmtNum = (n: any) => Number(n ?? 0).toLocaleString("fa-IR");
const fmtDateTime = (d?: string | null) =>
  d ? new Date(d).toLocaleString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const STATE_LABELS: Record<string, string> = {
  DRAFT: "پیش‌نویس",
  PENDING_MATCHING: "در انتظار تطبیق",
  PARTIALLY_MATCHED: "تطبیق جزئی",
  ADMIN_SETTLEMENT: "تسویه توسط مدیر",
  COMPLETED: "تکمیل‌شده",
  EXPIRED: "منقضی",
  CANCELLED: "لغو شده",
};
const STATE_KIND: Record<string, "green" | "red" | "gold" | "gray"> = {
  PENDING_MATCHING: "gold",
  PARTIALLY_MATCHED: "gold",
  ADMIN_SETTLEMENT: "red",
  COMPLETED: "green",
  EXPIRED: "red",
  CANCELLED: "gray",
};
const PART_KIND: Record<string, "green" | "red" | "gold" | "gray"> = {
  OPEN: "gray",
  RESERVED: "gold",
  PAID_PENDING: "gold",
  CONFIRMED: "green",
  CANCELLED: "gray",
  EXPIRED: "red",
};
const PART_LABELS: Record<string, string> = {
  OPEN: "آزاد",
  RESERVED: "رزروشده",
  PAID_PENDING: "در انتظار تأیید برداشت‌کننده",
  CONFIRMED: "تأییدشده",
  CANCELLED: "لغو شده",
  EXPIRED: "منقضی",
};

const userLabel = (u: any) =>
  u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.phone || u.email || u.id : "—";

export default function P2pWithdrawalsPage() {
  const [stateFilter, setStateFilter] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["p2p-withdrawals", stateFilter],
    queryFn: () => p2pApi.listWithdrawals({ state: stateFilter || undefined }),
    refetchInterval: 30_000,
  });

  const rows = list.data?.items ?? [];

  return (
    <>
      <Card
        title="درخواست‌های برداشت همتا به همتا"
        action={
          <select className="select" value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">همه وضعیت‌ها</option>
            {Object.entries(STATE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        }
      >
        {list.isLoading ? <Loading /> :
         list.isError ? <ErrorState message={apiError(list.error)} /> :
         !rows.length ? <Empty label="درخواستی یافت نشد" /> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>کاربر</th>
                  <th>مبلغ کل</th>
                  <th>تسویه‌شده</th>
                  <th>باقی‌مانده</th>
                  <th>قفل‌شده</th>
                  <th>مراحل</th>
                  <th>وضعیت</th>
                  <th>ایجاد</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: P2pWithdrawRow) => (
                  <tr key={r.id}>
                    <td>{userLabel(r.user)}</td>
                    <td className="mono">{fmtNum(r.totalAmount)}</td>
                    <td className="mono">{fmtNum(r.completedAmount)}</td>
                    <td className="mono">{fmtNum(r.remainingAmount)}</td>
                    <td className="mono">{fmtNum(r.lockedAmount)}</td>
                    <td className="mono">
                      {fmtNum(r.partsConfirmed ?? 0)} / {fmtNum(r.partsTotal ?? 0)}
                    </td>
                    <td>
                      <Badge kind={STATE_KIND[r.state] ?? "gray"}>{STATE_LABELS[r.state] ?? r.state}</Badge>
                    </td>
                    <td>{fmtDateTime(r.createAt)}</td>
                    <td>
                      <button className="btn sm" onClick={() => setOpenId(r.id)}>جزئیات</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openId && <WithdrawalDetailModal id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}

function WithdrawalDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [escalating, setEscalating] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ["p2p-withdrawal", id],
    queryFn: () => p2pApi.getWithdrawal(id),
  });

  const escalate = useMutation({
    mutationFn: ({ matchId, ...body }: any) => p2pApi.escalateMatch(matchId, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["p2p-withdrawal", id] });
      qc.invalidateQueries({ queryKey: ["p2p-escalations"] });
      setEscalating(null);
    },
  });

  const d = detail.data as P2pWithdrawDetail | undefined;

  return (
    <Modal title="جزئیات درخواست برداشت همتا به همتا" onClose={onClose} wide>
      {detail.isLoading ? <Loading /> :
       detail.isError ? <ErrorState message={apiError(detail.error)} /> :
       !d ? null : (
        <>
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, fontSize: 13, lineHeight: 1.9 }}>
            <div><strong>کاربر:</strong> {userLabel(d.request.user)}</div>
            <div><strong>مبلغ کل:</strong> <span className="mono">{fmtNum(d.request.totalAmount)}</span> ریال</div>
            <div><strong>تسویه‌شده:</strong> <span className="mono">{fmtNum(d.request.completedAmount)}</span></div>
            <div><strong>باقی‌مانده:</strong> <span className="mono">{fmtNum(d.request.remainingAmount)}</span></div>
            <div><strong>موجودی قفل‌شده:</strong> <span className="mono">{fmtNum(d.request.lockedAmount)}</span></div>
            <div><strong>سیاست تقسیم:</strong> {d.request.splitPolicy}</div>
            <div><strong>وضعیت:</strong> {STATE_LABELS[d.request.state] ?? d.request.state}</div>
            <div><strong>انقضا:</strong> {fmtDateTime(d.request.expiresAt)}</div>
            {d.request.destinationSnapshotJson && (
              <div style={{ marginTop: 6 }}>
                <strong>حساب مقصد اعلام‌شده:</strong>{" "}
                <span className="mono" dir="ltr">{d.request.destinationSnapshotJson.iban ?? "—"}</span>
                {d.request.destinationSnapshotJson.bankName ? ` — ${d.request.destinationSnapshotJson.bankName}` : ""}
              </div>
            )}
          </div>

          <h4>مراحل</h4>
          {!d.parts.length ? <Empty label="مرحله‌ای ثبت نشده است" /> : d.parts.map((part: P2pWithdrawPart) => (
            <div key={part.id} style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                <strong>مرحله {part.sequenceNo} — <span className="mono">{fmtNum(part.targetAmount)}</span></strong>
                <Badge kind={PART_KIND[part.status] ?? "gray"}>{PART_LABELS[part.status] ?? part.status}</Badge>
              </div>

              {part.match ? (
                <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.9 }}>
                  <div><strong>واریزکننده:</strong> {userLabel(part.match.depositor)}</div>
                  <div>
                    <strong>وضعیت تطبیق:</strong>{" "}
                    {P2P_MATCH_STATUS[part.match.status] ?? part.match.status}
                    {part.match.source === "ADMIN" && <Badge kind="gold">حساب مدیر</Badge>}
                  </div>
                  <div><strong>مهلت پاسخ برداشت‌کننده:</strong> {fmtDateTime(part.match.responseDeadlineAt)}</div>
                  <div><strong>مهلت تسویه:</strong> {fmtDateTime(part.match.settlementDeadlineAt)}</div>

                  {part.match.paymentProof ? (
                    <div style={{ background: "var(--bg)", padding: 10, borderRadius: 6, marginTop: 8 }}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>
                        رسید پرداخت
                        {part.match.paymentProof.ocrMismatch && <Badge kind="red">مغایرت با OCR</Badge>}
                      </div>
                      <div><strong>مبلغ رسید:</strong> <span className="mono">{fmtNum(part.match.paymentProof.amount)}</span></div>
                      <div><strong>کد پیگیری:</strong> <span className="mono" dir="ltr">{part.match.paymentProof.trackingCode ?? "—"}</span></div>
                      <div><strong>حساب مبدأ:</strong> <span className="mono" dir="ltr">{part.match.paymentProof.sourceAccount ?? "—"}</span></div>
                      <div><strong>زمان پرداخت:</strong> {fmtDateTime(part.match.paymentProof.paidAt)}</div>
                      {part.match.paymentProof.receiptUrl && (
                        <img
                          src={part.match.paymentProof.receiptUrl}
                          alt="receipt"
                          style={{ maxWidth: "100%", maxHeight: 260, borderRadius: 6, marginTop: 6, cursor: "pointer" }}
                          onClick={() => window.open(part.match!.paymentProof!.receiptUrl!, "_blank")}
                        />
                      )}
                    </div>
                  ) : (
                    <div style={{ color: "var(--text-muted)" }}>رسیدی ثبت نشده است.</div>
                  )}

                  {part.match.escalation ? (
                    <div style={{ marginTop: 8 }}>
                      <Badge kind={part.match.escalation.status === "RESOLVED" ? "green" : "red"}>
                        {P2P_ESCALATION_REASONS[part.match.escalation.reason] ?? part.match.escalation.reason}
                        {" — "}
                        {part.match.escalation.status === "RESOLVED" ? "تعیین‌تکلیف شده" : "در صف ادمین"}
                      </Badge>
                      <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>
                        تصمیم‌گیری از صفحه «تسویه همتا به همتا» انجام می‌شود.
                      </div>
                    </div>
                  ) : (
                    <div style={{ marginTop: 8 }}>
                      {escalating === part.match.id ? (
                        <EscalateForm
                          loading={escalate.isPending}
                          error={escalate.isError ? apiError(escalate.error) : ""}
                          onCancel={() => { setEscalating(null); escalate.reset(); }}
                          onSubmit={(body) => escalate.mutate({ matchId: part.match!.id, ...body })}
                        />
                      ) : (
                        <button className="btn sm" onClick={() => setEscalating(part.match!.id)}>
                          ارجاع به صف تعیین‌تکلیف
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ marginTop: 8, color: "var(--text-muted)", fontSize: 13 }}>
                  هنوز واریزکننده‌ای این مرحله را نگرفته است.
                </div>
              )}

              {part.history?.length ? (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: "pointer", fontSize: 12 }}>
                    تطبیق‌های پیشین ({part.history.length})
                  </summary>
                  <ul style={{ fontSize: 12, lineHeight: 2, marginTop: 4 }}>
                    {part.history.map((h) => (
                      <li key={h.id}>
                        {fmtDateTime(h.createAt)} — {P2P_MATCH_STATUS[h.status] ?? h.status} — <span className="mono">{fmtNum(h.amount)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ))}
        </>
      )}

      <div className="modal-actions">
        <button type="button" className="btn" onClick={onClose}>بستن</button>
      </div>
    </Modal>
  );
}

/** Opening a case needs a reason and a note — both land in the audit log. */
function EscalateForm({
  onSubmit,
  onCancel,
  loading,
  error,
}: {
  onSubmit: (body: { reason: string; note: string }) => void;
  onCancel: () => void;
  loading?: boolean;
  error?: string;
}) {
  const [reason, setReason] = useState("RECEIPT_MISMATCH");
  const [note, setNote] = useState("");

  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 6, padding: 10 }}>
      {error && <ErrorState message={error} />}
      <div className="form-grid">
        <div className="field">
          <label>علت ارجاع</label>
          <select className="select" value={reason} onChange={(e) => setReason(e.target.value)}>
            {Object.entries(P2P_ESCALATION_REASONS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ gridColumn: "1 / -1" }}>
          <label>توضیح</label>
          <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="چرا این پرونده نیاز به تصمیم دارد؟" />
        </div>
      </div>
      <div className="row" style={{ gap: 6, marginTop: 8 }}>
        <button className="btn sm" disabled={loading || !note.trim()} onClick={() => onSubmit({ reason, note })}>
          {loading ? <><span className="spin" /> در حال ارجاع…</> : "ارجاع"}
        </button>
        <button className="btn sm ghost" onClick={onCancel}>انصراف</button>
      </div>
    </div>
  );
}
