import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Stat, Badge, Loading, ErrorState, Empty, Modal } from "../components/ui";
import OtpConfirmModal, { otpError } from "../components/OtpConfirmModal";
import { fmtNum, fmtDate } from "../lib/format";
import { fmtToman } from "../lib/money";
import { EM_STATUS_KINDS, EM_STATUS_LABELS, EM_TYPE_LABELS, timeLeft } from "../lib/em";
import type {
  EmRequestDetail,
  EmRequestRow,
  EmSearchBy,
  EmStats,
  EmStatus,
  Paginated,
} from "../api/types";

const STATUS_FILTERS: { value: EmStatus | ""; label: string }[] = [
  { value: "", label: "همه وضعیت‌ها" },
  { value: "awaiting_account", label: EM_STATUS_LABELS.awaiting_account },
  { value: "awaiting_receipt", label: EM_STATUS_LABELS.awaiting_receipt },
  { value: "receipt_paid", label: EM_STATUS_LABELS.receipt_paid },
  { value: "rejected", label: EM_STATUS_LABELS.rejected },
];

const SEARCH_BY: { value: EmSearchBy; label: string }[] = [
  { value: "requester", label: "کاربر درخواست‌کننده" },
  { value: "performer", label: "کاربر انجام‌دهنده" },
  { value: "account", label: "شماره حساب" },
];

function DetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);

  const detail = useQuery({
    queryKey: ["em-request", id],
    queryFn: async () => unwrap<EmRequestDetail>((await api.get(`/admin/em/requests/${id}`)).data),
  });

  const decide = useMutation({
    mutationFn: (c: { challengeId: string; otp: string }) =>
      api.post(`/admin/em/requests/${id}/${decision}`, { note, ...c }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["em-requests"] });
      qc.invalidateQueries({ queryKey: ["em-stats"] });
      qc.invalidateQueries({ queryKey: ["em-request", id] });
      setConfirming(false);
      setDecision(null);
      setNote("");
    },
  });

  const setEnclosure = useMutation({
    mutationFn: (hasEnclosure: boolean) =>
      api.patch(`/admin/em/requests/${id}/enclosure`, { hasEnclosure }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["em-request", id] });
      qc.invalidateQueries({ queryKey: ["em-requests"] });
    },
  });

  if (confirming && decision) {
    return (
      <OtpConfirmModal
        title={decision === "approve" ? "تأیید پرداخت" : "رد پرداخت"}
        description="این تصمیم در پرونده ارجاع ثبت و به دفتر اعمال می‌شود."
        scope="em.approve"
        refId={id}
        // The scope hashes no body fields; the code is bound to this request.
        fields={[]}
        payload={{}}
        confirmLabel={decision === "approve" ? "تأیید" : "رد"}
        pending={decide.isPending}
        actionError={decide.isError ? decide.error : undefined}
        onConfirm={(c) => decide.mutate(c)}
        onClose={() => setConfirming(false)}
      />
    );
  }

  const d = detail.data;

  return (
    <Modal title={d ? `درخواست ${EM_TYPE_LABELS[d.type]}` : "درخواست"} onClose={onClose} wide>
      {detail.isLoading ? <Loading /> : detail.isError ? <ErrorState message={apiError(detail.error)} /> :
       !d ? <Empty label="یافت نشد" /> : (
        <>
          <div className="kv" style={{ marginBottom: 12 }}>
            <span className="k">وضعیت</span>
            <span><Badge kind={EM_STATUS_KINDS[d.status]}>{EM_STATUS_LABELS[d.status]}</Badge></span>
            <span className="k">مبلغ</span><span className="mono">{fmtToman(d.amount)}</span>
            <span className="k">درخواست‌کننده</span><span>{d.requester.name ?? d.requester.phone ?? "—"}</span>
            <span className="k">انجام‌دهنده</span><span>{d.performer?.name ?? d.performer?.phone ?? "—"}</span>
            <span className="k">حساب مقصد</span>
            <span style={{ direction: "ltr", textAlign: "right", overflowWrap: "anywhere" }}>
              {d.destinationAccount ?? "—"}
            </span>
            <span className="k">حساب داده شده</span>
            <span style={{ direction: "ltr", textAlign: "right", overflowWrap: "anywhere" }}>
              {d.assignedAccount ?? "—"}
            </span>
            <span className="k">زمان مانده تا انقضا</span><span>{timeLeft(d.expiresAt)}</span>
            <span className="k">دارای لف</span>
            <span className="row" style={{ gap: 8 }}>
              <Badge kind={d.hasEnclosure ? "green" : "gray"}>{d.hasEnclosure ? "بله" : "خیر"}</Badge>
              <button className="btn ghost sm" disabled={setEnclosure.isPending}
                onClick={() => setEnclosure.mutate(!d.hasEnclosure)}>
                تغییر
              </button>
            </span>
          </div>

          <div style={{ fontWeight: 600, margin: "12px 0 6px" }}>فیش‌ها ({fmtNum(d.proofs.length)})</div>
          {!d.proofs.length ? <Empty label="فیشی ثبت نشده است" /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>زمان پرداخت</th><th>مبلغ</th><th>مبدأ</th><th>مقصد</th><th>پیگیری</th><th>رسید</th></tr>
                </thead>
                <tbody>
                  {d.proofs.map((p) => (
                    <tr key={p.id}>
                      <td>{p.paidAt ? fmtDate(p.paidAt) : "—"}</td>
                      <td>{fmtToman(p.amount)}</td>
                      <td dir="ltr">{p.sourceAccount ?? "—"}</td>
                      <td dir="ltr">{p.destinationAccount ?? "—"}</td>
                      <td dir="ltr">{p.trackingCode ?? "—"}</td>
                      <td>
                        <div className="row" style={{ gap: 6, alignItems: "center" }}>
                          {p.receiptUrl
                            ? <a className="btn ghost sm" href={p.receiptUrl} target="_blank" rel="noreferrer">مشاهده</a>
                            : "—"}
                          {/* The OCR disagreed with what was typed — worth an
                              operator's eye before the payment is confirmed. */}
                          {p.ocrMismatch && <Badge kind="red">مغایرت OCR</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {!d.escalationId ? (
            <p className="muted" style={{ fontSize: 12, marginTop: 12 }}>
              پرونده ارجاع بازی برای این درخواست وجود ندارد؛ تأیید یا رد از این صفحه ممکن نیست.
            </p>
          ) : (
            <>
              <div className="field" style={{ marginTop: 12 }}>
                <label>دلیل تصمیم (در گزارش ثبت می‌شود)</label>
                <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              {setEnclosure.isError && <ErrorState message={apiError(setEnclosure.error)} />}
              {decide.isError && <ErrorState message={otpError(decide.error)} />}
              <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button className="btn ghost" onClick={onClose}>بستن</button>
                <button className="btn danger" disabled={!note.trim()}
                  onClick={() => { setDecision("reject"); setConfirming(true); }}>
                  رد پرداخت
                </button>
                <button className="btn" disabled={!note.trim()}
                  onClick={() => { setDecision("approve"); setConfirming(true); }}>
                  تأیید پرداخت
                </button>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}

export default function WithdrawalEmPage() {
  const [status, setStatus] = useState<EmStatus | "">("");
  const [searchBy, setSearchBy] = useState<EmSearchBy>("requester");
  const [q, setQ] = useState("");
  const [applied, setApplied] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  // Deadlines are rendered from timestamps, so the column has to be re-rendered
  // for the countdown to move; the server is not polled for it.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(t);
  }, []);

  const stats = useQuery({
    queryKey: ["em-stats"],
    queryFn: async () => unwrap<EmStats>((await api.get("/admin/em/stats")).data),
  });

  const rows = useQuery({
    queryKey: ["em-requests", status, searchBy, applied, page],
    queryFn: async () =>
      unwrap<Paginated<EmRequestRow>>(
        (await api.get("/admin/em/requests", {
          params: { status: status || undefined, searchBy, q: applied || undefined, page, pageSize: 10 },
        })).data,
      ),
  });

  const kpi = (label: string, value: number | undefined, target: EmStatus | "") => (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { setStatus(target); setPage(1); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { setStatus(target); setPage(1); } }}
      style={{
        cursor: "pointer",
        outline: status === target ? "1px solid var(--gold)" : undefined,
        borderRadius: "var(--radius)",
      }}
    >
      <Stat label={label} value={fmtNum(value ?? 0)} />
    </div>
  );

  const totalPages = rows.data?.totalPages ?? 0;

  return (
    <>
      <div className="grid grid-5" style={{ marginBottom: 16 }}>
        {kpi("کل درخواست‌ها", stats.data?.total, "")}
        {kpi(EM_STATUS_LABELS.awaiting_account, stats.data?.awaitingAccount, "awaiting_account")}
        {kpi(EM_STATUS_LABELS.awaiting_receipt, stats.data?.awaitingReceipt, "awaiting_receipt")}
        {kpi(EM_STATUS_LABELS.receipt_paid, stats.data?.receiptPaid, "receipt_paid")}
        {kpi(EM_STATUS_LABELS.rejected, stats.data?.rejected, "rejected")}
      </div>

      <Card
        title="درخواست‌های برداشت"
        action={
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <select className="select" style={{ width: 160 }} value={status}
              onChange={(e) => { setStatus(e.target.value as EmStatus | ""); setPage(1); }}>
              {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
            <select className="select" style={{ width: 170 }} value={searchBy}
              onChange={(e) => { setSearchBy(e.target.value as EmSearchBy); setPage(1); }}>
              {SEARCH_BY.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <input className="input" style={{ width: 180 }} value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { setApplied(q); setPage(1); } }}
              placeholder="جستجو…" />
            <button className="btn ghost" onClick={() => { setApplied(q); setPage(1); }}>جستجو</button>
          </div>
        }
      >
        {rows.isLoading ? <Loading /> : rows.isError ? <ErrorState message={apiError(rows.error)} /> :
         !rows.data?.items.length ? <Empty label="درخواستی یافت نشد" /> : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>نوع</th><th>وضعیت</th><th>مبلغ</th>
                    <th>درخواست‌کننده</th><th>انجام‌دهنده</th>
                    <th>حساب مقصد</th><th>فیش</th><th>لف</th><th>مانده تا انقضا</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.data.items.map((r) => (
                    <tr key={r.id}>
                      <td>{EM_TYPE_LABELS[r.type]}</td>
                      <td><Badge kind={EM_STATUS_KINDS[r.status]}>{EM_STATUS_LABELS[r.status]}</Badge></td>
                      <td>{fmtToman(r.amount)}</td>
                      <td>{r.requester.name ?? r.requester.phone ?? "—"}</td>
                      <td>{r.performer?.name ?? r.performer?.phone ?? "—"}</td>
                      <td dir="ltr">{r.destinationAccount ?? "—"}</td>
                      <td>{fmtNum(r.proofCount)}</td>
                      <td>{r.hasEnclosure ? "بله" : "خیر"}</td>
                      <td>{timeLeft(r.expiresAt)}</td>
                      <td>
                        <button className="btn ghost sm" onClick={() => setOpenId(r.id)}>جزئیات</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="row" style={{ gap: 8, justifyContent: "center", marginTop: 16 }}>
                <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>قبلی</button>
                <span className="muted" style={{ fontSize: 13 }}>
                  صفحه {fmtNum(page)} از {fmtNum(totalPages)}
                </span>
                <button className="btn ghost sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>بعدی</button>
              </div>
            )}
          </>
        )}
      </Card>

      {openId && <DetailModal id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
