import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../../api/client";
import { Loading, ErrorState, Empty, Modal } from "../../components/ui";
import { useNotify } from "../../notifications/NotifyProvider";
import { fmtDate } from "./labels";
import type { Credit } from "../../api/types";

interface PendingSettlement {
  id: string;
  creditId: string;
  requiredAmount: number;
  requiredAssetSymbolId: string | null;
  requestedBy: string | null;
  requestedAt: string | null;
  notes: string | null;
  credit?: Credit;
}

/**
 * Admin-wide approval queue: every settlement currently sitting in
 * PENDING_ADMIN_REVIEW (i.e. the credit facility has
 * requireAdminApprovalForSettlement turned on), across all users, in one
 * place — instead of an admin needing to know which credit to open to find
 * something that needs their decision.
 */
export function PendingApprovals({ onOpenCredit }: { onOpenCredit: (credit: Credit) => void }) {
  const qc = useQueryClient();
  const notify = useNotify().notify;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<PendingSettlement | null>(null);
  const [reason, setReason] = useState("");

  const pending = useQuery({
    queryKey: ["credit-settlements-pending-review"],
    queryFn: async () => unwrap<PendingSettlement[]>((await api.get("/admin/credits/settlements/pending-review")).data),
    refetchInterval: 30000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["credit-settlements-pending-review"] });
    qc.invalidateQueries({ queryKey: ["credit-stats"] });
  };

  async function approve(id: string) {
    setBusyId(id);
    try {
      await api.post(`/admin/credits/settlements/${id}/approve`, { reason: "approved" });
      notify({ title: "درخواست تسویه تأیید شد", kind: "success" });
      refresh();
    } catch (e: any) {
      notify({ title: "خطا در تأیید تسویه", body: apiError(e), kind: "error" });
    } finally {
      setBusyId(null);
    }
  }

  async function submitReject() {
    if (!rejecting || !reason.trim()) return;
    setBusyId(rejecting.id);
    try {
      await api.post(`/admin/credits/settlements/${rejecting.id}/reject`, { reason: reason.trim() });
      notify({ title: "درخواست تسویه رد شد", kind: "success" });
      setRejecting(null);
      setReason("");
      refresh();
    } catch (e: any) {
      notify({ title: "خطا در رد تسویه", body: apiError(e), kind: "error" });
    } finally {
      setBusyId(null);
    }
  }

  const items = pending.data ?? [];
  if (!pending.isLoading && !pending.isError && items.length === 0) return null;

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16, border: items.length > 0 ? "1px solid var(--gold)" : undefined }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>در انتظار تأیید ادمین</span>
        {items.length > 0 && (
          <span style={{ background: "var(--gold)", color: "#000", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
            {items.length}
          </span>
        )}
      </div>

      {pending.isLoading ? (
        <Loading />
      ) : pending.isError ? (
        <ErrorState message={apiError(pending.error)} />
      ) : items.length === 0 ? (
        <Empty label="موردی برای تأیید وجود ندارد" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>اعتبار</th>
                <th>کاربر</th>
                <th>درخواست‌شده در</th>
                <th>یادداشت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((s) => {
                const user = s.credit?.user as any;
                return (
                  <tr key={s.id}>
                    <td>
                      <button className="btn sm ghost" onClick={() => s.credit && onOpenCredit(s.credit)}>
                        <code>{s.credit?.creditCode ?? s.creditId}</code>
                      </button>
                    </td>
                    <td>{user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.phone || user.email : "—"}</td>
                    <td>{fmtDate(s.requestedAt)}</td>
                    <td style={{ maxWidth: 220, whiteSpace: "normal", fontSize: 12, color: "var(--text-faint)" }}>{s.notes || "—"}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn sm" disabled={busyId === s.id} onClick={() => approve(s.id)}>تأیید</button>
                        <button className="btn sm ghost" disabled={busyId === s.id} onClick={() => { setRejecting(s); setReason(""); }}>رد</button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rejecting && (
        <Modal title="رد درخواست تسویه" onClose={() => setRejecting(null)}>
          <form className="modal-form" onSubmit={(e) => { e.preventDefault(); submitReject(); }}>
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label>دلیل رد</label>
              <textarea
                className="input"
                rows={3}
                autoFocus
                placeholder="دلیل رد را برای کاربر وارد کنید…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn ghost" onClick={() => setRejecting(null)}>انصراف</button>
              <button type="submit" className="btn" disabled={busyId === rejecting.id || !reason.trim()}>
                {busyId === rejecting.id ? <><span className="spin" /> در حال ثبت…</> : "رد کردن"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
