import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Badge, Loading, ErrorState, Empty, Modal } from "../components/ui";
import { DEPOSIT_TYPES } from "../lib/enums";
import type { DepositRequest } from "../api/types";

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
                  <td className="mono">{fmtNum(d.amount)}</td>
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

  return (
    <Modal title={`بررسی درخواست واریز`} onClose={onClose}>
      <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.8 }}>
        <div><strong>کاربر:</strong> {deposit.user ? `${deposit.user.firstName ?? ""} ${deposit.user.lastName ?? ""}`.trim() || deposit.user.phone || deposit.user.email : deposit.userId}</div>
        <div><strong>نماد:</strong> {deposit.symbol?.slug || deposit.symbol?.name}</div>
        <div><strong>نوع:</strong> {typeLabel(deposit.type)}</div>
        <div><strong>مبلغ:</strong> {fmtNum(deposit.amount)}</div>
        <div><strong>وضعیت:</strong> {STATUS_LABELS[deposit.status] ?? deposit.status}</div>
        {deposit.picturePath && <div><strong>تصویر:</strong> <img src={picUrl(deposit.picturePath)} alt="deposit-pic" style={{ maxWidth: "100%", maxHeight: 300, borderRadius: 6, marginTop: 4, cursor: "pointer" }} onClick={() => window.open(picUrl(deposit.picturePath), "_blank")} /></div>}
        {deposit.notes && <div><strong>توضیحات کاربر:</strong> {deposit.notes}</div>}
        {deposit.adminNotes && <div><strong>توضیحات ادمین:</strong> {deposit.adminNotes}</div>}
      </div>

      {readOnly ? (
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>بستن</button>
        </div>
      ) : (
        <form className="modal-form" onSubmit={(e) => { e.preventDefault(); onSave!({ status, notes: notes || undefined }); }}>
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
