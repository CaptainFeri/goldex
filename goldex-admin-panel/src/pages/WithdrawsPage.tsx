import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Badge, Loading, ErrorState, Empty, Modal } from "../components/ui";
import JalaliDatePicker from "../components/JalaliDatePicker";
import { WITHDRAW_TYPES } from "../lib/enums";
import type { WithdrawRequest } from "../api/types";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار",
  PROCESSING: "در حال پردازش",
  COMPLETED: "تکمیل شده",
  FAILED: "ناموفق",
  CANCELLED: "لغو شده",
};
const STATUS_KINDS: Record<string, string> = {
  PENDING: "gold",
  PROCESSING: "gold",
  COMPLETED: "green",
  FAILED: "red",
  CANCELLED: "gray",
};

const fmtNum = (n: any) => (n ?? 0).toLocaleString("fa-IR");
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const typeLabel = (t: string) => WITHDRAW_TYPES.find((x) => x.value === t)?.label ?? t;
const picUrl = (p: string | null | undefined) => p ? `/api/v1/admin/withdraw/picture/${encodeURIComponent(p)}` : "";

export default function WithdrawsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState<null | "process" | "detail">(null);
  const [selected, setSelected] = useState<WithdrawRequest | null>(null);
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["admin-withdraws", statusFilter],
    queryFn: async () => {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      return unwrap<{ items: WithdrawRequest[]; total: number; page: number; limit: number }>((await api.get("/admin/withdraw", { params })).data);
    },
  });

  const process = useMutation({
    mutationFn: ({ id, ...body }: any) => api.patch(`/admin/withdraw/${id}/process`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-withdraws"] }); setModal(null); setSelected(null); },
  });

  return (
    <Card
      title="درخواست‌های برداشت"
      action={
        <div className="row" style={{ gap: 8 }}>
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">همه وضعیت‌ها</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      }
    >
      {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={apiError(list.error)} /> :
      !list.data?.items?.length ? <Empty label="هیچ درخواست برداشتی یافت نشد" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>تصویر</th>
                <th>کاربر</th>
                <th>نماد</th>
                <th>نوع برداشت</th>
                <th>مبلغ</th>
                <th>وضعیت</th>
                <th>تاریخ</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {(list.data.items as WithdrawRequest[]).map((w) => (
                <tr key={w.id}>
                  <td>
                    {w.picturePath
                      ? <img src={picUrl(w.picturePath)} alt="pic" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, cursor: "pointer" }} onClick={() => window.open(picUrl(w.picturePath), "_blank")} />
                      : "—"}
                  </td>
                  <td>
                    {w.user ? `${w.user.firstName ?? ""} ${w.user.lastName ?? ""}`.trim() || w.user.phone || w.user.email || w.userId : w.userId}
                  </td>
                  <td>{w.symbol?.slug || w.symbol?.name || w.symbolId}</td>
                  <td>{typeLabel(w.type)}</td>
                  <td className="mono">{fmtNum(w.amount)}</td>
                  <td><Badge kind={(STATUS_KINDS[w.status] as "green" | "red" | "gold" | "gray")}>{STATUS_LABELS[w.status]}</Badge></td>
                  <td>{fmtDate(w.createAt)}</td>
                  <td>
                    {w.status === "PENDING" ? (
                      <button className="btn sm" onClick={() => { setSelected(w); setModal("process"); }}>
                        بررسی
                      </button>
                    ) : (
                      <button className="btn sm ghost" onClick={() => { setSelected(w); setModal("detail"); }}>
                        جزئیات
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal === "process" && selected && (
        <ProcessWithdrawModal
          withdraw={selected}
          onClose={() => { setModal(null); setSelected(null); }}
          onSave={(dto) => process.mutate({ id: selected.id, ...dto })}
          loading={process.isPending}
        />
      )}
      {modal === "detail" && selected && (
        <ProcessWithdrawModal
          withdraw={selected}
          onClose={() => { setModal(null); setSelected(null); }}
          readOnly
        />
      )}
    </Card>
  );
}

function ProcessWithdrawModal({
  withdraw,
  onClose,
  onSave,
  loading,
  readOnly,
}: {
  withdraw: WithdrawRequest;
  onClose: () => void;
  onSave?: (d: any) => void;
  loading?: boolean;
  readOnly?: boolean;
}) {
  const [status, setStatus] = useState<"COMPLETED" | "CANCELLED">("COMPLETED");
  const [notes, setNotes] = useState("");
  const [ocrEdits, setOcrEdits] = useState<Record<string, string>>(() => {
    const p = withdraw.metadata?.ocr?.parsed;
    return p ? { date: p.date || '', amount: p.amount || '', transactionId: p.transactionId || '', cardNumber: p.cardNumber || '', sourceIban: p.sourceIban || '', destinationIban: p.destinationIban || '' } : { date: '', amount: '', transactionId: '', cardNumber: '', sourceIban: '', destinationIban: '' };
  });
  const ocrData = withdraw.metadata?.ocr;

  return (
    <Modal title={`بررسی درخواست برداشت`} onClose={onClose}>
      <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.8 }}>
        <div><strong>کاربر:</strong> {withdraw.user ? `${withdraw.user.firstName ?? ""} ${withdraw.user.lastName ?? ""}`.trim() || withdraw.user.phone || withdraw.user.email : withdraw.userId}</div>
        <div><strong>نماد:</strong> {withdraw.symbol?.slug || withdraw.symbol?.name}</div>
        <div><strong>نوع:</strong> {typeLabel(withdraw.type)}</div>
        <div><strong>مبلغ:</strong> {fmtNum(withdraw.amount)}</div>
        <div><strong>وضعیت:</strong> {STATUS_LABELS[withdraw.status] ?? withdraw.status}</div>
        {withdraw.picturePath && <div><strong>تصویر:</strong> <img src={picUrl(withdraw.picturePath)} alt="withdraw-pic" style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 6, marginTop: 4, cursor: "pointer" }} onClick={() => window.open(picUrl(withdraw.picturePath), "_blank")} /></div>}
        {withdraw.notes && <div><strong>توضیحات کاربر:</strong> {withdraw.notes}</div>}
        {withdraw.adminNotes && <div><strong>توضیحات ادمین:</strong> {withdraw.adminNotes}</div>}
        {ocrData && (
          <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, marginTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
              <span>📄 داده‌های استخراج شده از رسید</span>
              {ocrData.processing_time_ms && (
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ocrData.processing_time_ms}ms</span>
              )}
            </div>
            {readOnly ? (
              <>
                <div>تاریخ: {ocrData.parsed?.date || '—'}</div>
                <div>مبلغ: {ocrData.parsed?.amount || '—'}</div>
                <div>کد پیگیری: {ocrData.parsed?.transactionId || '—'}</div>
                <div>شماره کارت: {ocrData.parsed?.cardNumber || '—'}</div>
                <div>شبا مبدأ: {ocrData.parsed?.sourceIban || '—'}</div>
                <div>شبا مقصد: {ocrData.parsed?.destinationIban || '—'}</div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>تاریخ</label>
                <JalaliDatePicker value={ocrEdits.date || ''} onChange={(v) => setOcrEdits((p) => ({ ...p, date: v }))} placeholder="تاریخ" />
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>مبلغ</label>
                <input className="input" value={ocrEdits.amount || ''} onChange={(e) => setOcrEdits((p) => ({ ...p, amount: e.target.value }))} placeholder="مبلغ" />
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>کد پیگیری</label>
                <input className="input" value={ocrEdits.transactionId || ''} onChange={(e) => setOcrEdits((p) => ({ ...p, transactionId: e.target.value }))} placeholder="کد پیگیری" />
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>شماره کارت</label>
                <input className="input" value={ocrEdits.cardNumber || ''} onChange={(e) => setOcrEdits((p) => ({ ...p, cardNumber: e.target.value }))} placeholder="شماره کارت" />
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>شبا مبدأ</label>
                <input className="input" value={ocrEdits.sourceIban || ''} onChange={(e) => setOcrEdits((p) => ({ ...p, sourceIban: e.target.value }))} placeholder="IRxxxxxxxxxxxxxxxxxxxxxxxx" dir="ltr" />
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>شبا مقصد</label>
                <input className="input" value={ocrEdits.destinationIban || ''} onChange={(e) => setOcrEdits((p) => ({ ...p, destinationIban: e.target.value }))} placeholder="IRxxxxxxxxxxxxxxxxxxxxxxxx" dir="ltr" />
              </div>
            )}
            {ocrData.raw_text && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12 }}>متن کامل OCR</summary>
                <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', marginTop: 4, maxHeight: 120, overflow: 'auto' }}>{ocrData.raw_text}</pre>
              </details>
            )}
          </div>
        )}
      </div>

      {readOnly ? (
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>بستن</button>
        </div>
      ) : (
        <form className="modal-form" onSubmit={(e) => {
          e.preventDefault();
          const payload: any = { status, notes: notes || undefined };
          if (ocrData) {
            payload.metadata = {
              ocr: {
                ...ocrData,
                parsed: { date: ocrEdits.date || null, amount: ocrEdits.amount || null, transactionId: ocrEdits.transactionId || null, cardNumber: ocrEdits.cardNumber || null, sourceIban: ocrEdits.sourceIban || null, destinationIban: ocrEdits.destinationIban || null },
              },
            };
          }
          onSave!(payload);
        }}>
          <div className="form-grid">
            <div className="field">
              <label>نتیجه بررسی</label>
              <select className="select" value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="COMPLETED">تأیید و تکمیل</option>
                <option value="CANCELLED">رد و لغو</option>
              </select>
            </div>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>توضیحات (اختیاری)</label>
              <textarea className="input" rows={3} placeholder="توضیحات بررسی…" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>

          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
            <button type="submit" className="btn" disabled={loading}>
              {loading ? <><span className="spin" /> در حال پردازش…</> : status === "COMPLETED" ? "تأیید برداشت" : "لغو درخواست"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
