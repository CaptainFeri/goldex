import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Badge, Loading, ErrorState, Empty, Modal } from "../components/ui";
import { DEPOSIT_TYPES } from "../lib/enums";
import type { DepositRequest } from "../api/types";
import { fmtBySymbol } from "../lib/money";

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


const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const typeLabel = (t: string) => DEPOSIT_TYPES.find((x) => x.value === t)?.label ?? t;
const picUrl = (p: string | null | undefined) => p ? `/api/v1/admin/deposit/picture/${encodeURIComponent(p)}` : "";

export default function DepositsPage() {
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState<null | "process" | "detail">(null);
  const [selected, setSelected] = useState<DepositRequest | null>(null);
  const qc = useQueryClient();

  const list = useQuery({
    queryKey: ["admin-deposits", statusFilter],
    queryFn: async () => {
      const params: any = {};
      if (statusFilter) params.status = statusFilter;
      return unwrap<{ items: DepositRequest[]; total: number; page: number; limit: number }>((await api.get("/admin/deposit", { params })).data);
    },
  });

  const process = useMutation({
    mutationFn: ({ id, ...body }: any) => api.patch(`/admin/deposit/${id}/process`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-deposits"] }); setModal(null); setSelected(null); },
  });

  return (
    <Card
      title="درخواست‌های واریز"
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
      !list.data?.items?.length ? <Empty label="هیچ درخواست واریزی یافت نشد" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>تصویر</th>
                <th>کاربر</th>
                <th>نماد</th>
                <th>نوع واریز</th>
                <th>درگاه</th>
                <th>مبلغ</th>
                <th>وضعیت</th>
                <th>تاریخ</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {(list.data.items as DepositRequest[]).map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.picturePath
                      ? <img src={picUrl(d.picturePath)} alt="pic" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 4, cursor: "pointer" }} onClick={() => window.open(picUrl(d.picturePath), "_blank")} />
                      : "—"}
                  </td>
                  <td>
                    {d.user ? `${d.user.firstName ?? ""} ${d.user.lastName ?? ""}`.trim() || d.user.phone || d.user.email || d.userId : d.userId}
                  </td>
                  <td>{d.symbol?.slug || d.symbol?.name || d.symbolId}</td>
                  <td>{typeLabel(d.type)}</td>
                  <td>{d.gatewayCode || (d.metadata?.payment?.gatewayCode ? <Badge kind="gold">{d.metadata.payment.gatewayCode}</Badge> : "—")}</td>
                  <td className="mono">{fmtBySymbol(d.amount, d.symbol?.slug)}</td>
                  <td><Badge kind={(STATUS_KINDS[d.status] as "green" | "red" | "gold" | "gray")}>{STATUS_LABELS[d.status]}</Badge></td>
                  <td>{fmtDate(d.createAt)}</td>
                  <td>
                    {d.status === "PENDING" ? (
                      <button className="btn sm" onClick={() => { setSelected(d); setModal("process"); }}>
                        بررسی
                      </button>
                    ) : (
                      <button className="btn sm ghost" onClick={() => { setSelected(d); setModal("detail"); }}>
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
        <ProcessDepositModal
          deposit={selected}
          onClose={() => { setModal(null); setSelected(null); }}
          onSave={(dto) => process.mutate({ id: selected.id, ...dto })}
          loading={process.isPending}
        />
      )}
      {modal === "detail" && selected && (
        <ProcessDepositModal
          deposit={selected}
          onClose={() => { setModal(null); setSelected(null); }}
          readOnly
        />
      )}
    </Card>
  );
}

function ProcessDepositModal({
  deposit,
  onClose,
  onSave,
  loading,
  readOnly,
}: {
  deposit: DepositRequest;
  onClose: () => void;
  onSave?: (d: any) => void;
  loading?: boolean;
  readOnly?: boolean;
}) {
  const [status, setStatus] = useState<"COMPLETED" | "CANCELLED">("COMPLETED");
  const [notes, setNotes] = useState("");
  const [ocrEdits, setOcrEdits] = useState<Record<string, string>>(() => {
    const p = deposit.metadata?.ocr?.parsed;
    return p ? { date: p.date || '', amount: p.amount || '', transactionId: p.transactionId || '', sourceIban: p.sourceIban || '', destinationIban: p.destinationIban || '' } : { date: '', amount: '', transactionId: '', sourceIban: '', destinationIban: '' };
  });
  const ocrData = deposit.metadata?.ocr;

  return (
    <Modal title={`بررسی درخواست واریز`} onClose={onClose}>
      <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.8 }}>
        <div><strong>کاربر:</strong> {deposit.user ? `${deposit.user.firstName ?? ""} ${deposit.user.lastName ?? ""}`.trim() || deposit.user.phone || deposit.user.email : deposit.userId}</div>
        <div><strong>نماد:</strong> {deposit.symbol?.slug || deposit.symbol?.name}</div>
        <div><strong>نوع:</strong> {typeLabel(deposit.type)}</div>
        <div><strong>مبلغ:</strong> {fmtBySymbol(deposit.amount, deposit.symbol?.slug)}</div>
        <div><strong>وضعیت:</strong> {STATUS_LABELS[deposit.status] ?? deposit.status}</div>
        {deposit.picturePath && <div><strong>تصویر:</strong> <img src={picUrl(deposit.picturePath)} alt="deposit-pic" style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 6, marginTop: 4, cursor: "pointer" }} onClick={() => window.open(picUrl(deposit.picturePath), "_blank")} /></div>}
        {deposit.notes && <div><strong>توضیحات کاربر:</strong> {deposit.notes}</div>}
        {deposit.adminNotes && <div><strong>توضیحات ادمین:</strong> {deposit.adminNotes}</div>}
        {deposit.metadata?.payment && (
          <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 8, marginTop: 8 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>💳 پرداخت درگاهی</div>
            <div><strong>درگاه:</strong> {deposit.metadata.payment.gatewayCode || "—"}</div>
            <div><strong>شناسه پرداخت:</strong> <code>{deposit.metadata.payment.paymentId || "—"}</code></div>
            <div><strong>شناسه تراکنش:</strong> <code>{deposit.metadata.payment.identifier || "—"}</code></div>
            {deposit.metadata.payment.ipgReference && <div><strong>IPG Reference:</strong> <code>{deposit.metadata.payment.ipgReference}</code></div>}
            {deposit.metadata.payment.error && <div style={{ color: "var(--danger)" }}><strong>خطا:</strong> {deposit.metadata.payment.error}</div>}
            {deposit.metadata.payment.gatewayUrl && (
              <div style={{ marginTop: 8 }}>
                <button type="button" className="btn sm" onClick={() => window.open(deposit.metadata.payment.gatewayUrl, "_blank", "noopener")}>
                  باز کردن درگاه پرداخت
                </button>
              </div>
            )}
          </div>
        )}
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
                <div>شبا مبدأ: {ocrData.parsed?.sourceIban || '—'}</div>
                <div>شبا مقصد: {ocrData.parsed?.destinationIban || '—'}</div>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>تاریخ</label>
                <input className="input" value={ocrEdits.date || ''} onChange={(e) => setOcrEdits((p) => ({ ...p, date: e.target.value }))} placeholder="تاریخ 1402/06/15" />
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>مبلغ</label>
                <input className="input" value={ocrEdits.amount || ''} onChange={(e) => setOcrEdits((p) => ({ ...p, amount: e.target.value }))} placeholder="مبلغ" />
                <label style={{ fontSize: 12, color: 'var(--text-muted)' }}>کد پیگیری</label>
                <input className="input" value={ocrEdits.transactionId || ''} onChange={(e) => setOcrEdits((p) => ({ ...p, transactionId: e.target.value }))} placeholder="کد پیگیری" />
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
                parsed: { date: ocrEdits.date || null, amount: ocrEdits.amount || null, transactionId: ocrEdits.transactionId || null, sourceIban: ocrEdits.sourceIban || null, destinationIban: ocrEdits.destinationIban || null },
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
              {loading ? <><span className="spin" /> در حال پردازش…</> : status === "COMPLETED" ? "تأیید واریز" : "لغو درخواست"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
