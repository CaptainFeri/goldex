import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../../api/client";
import { Loading, ErrorState, Empty, Modal } from "../../components/ui";
import { useNotify } from "../../notifications/NotifyProvider";
import { fmtDate } from "./labels";
import { fmtBySymbol } from "../../lib/money";
import type { Credit } from "../../api/types";

/**
 * Credit requests waiting on admin sign-off — levels with
 * creditRequireAdminApprovalForCreation turned on create the facility PENDING
 * with the user's collateral already frozen and no credit line issued.
 *
 * Separate from PendingApprovals (which queues *settlements* awaiting review):
 * nothing has been lent here yet, and every row is collateral the user cannot
 * touch until someone decides, so it leads the page.
 */
export function PendingCreditRequests({ onOpenCredit }: { onOpenCredit: (credit: Credit) => void }) {
  const qc = useQueryClient();
  const notify = useNotify().notify;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Credit | null>(null);
  const [reason, setReason] = useState("");

  const pending = useQuery({
    queryKey: ["credit-requests-pending"],
    queryFn: async () =>
      unwrap<{ items: Credit[]; total: number }>(
        (await api.get("/admin/credits", { params: { status: "PENDING", page: 1, limit: 50 } })).data,
      ),
    refetchInterval: 30000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["credit-requests-pending"] });
    qc.invalidateQueries({ queryKey: ["credits"] });
    qc.invalidateQueries({ queryKey: ["credit-stats"] });
  };

  async function approve(c: Credit) {
    setBusyId(c.id);
    try {
      await api.post(`/admin/credits/${c.id}/approve`, {});
      notify({ title: `اعتبار ${c.creditCode} تأیید و صادر شد`, kind: "success" });
      refresh();
    } catch (e: any) {
      notify({ title: "خطا در تأیید درخواست اعتبار", body: apiError(e), kind: "error" });
    } finally {
      setBusyId(null);
    }
  }

  async function submitReject() {
    if (!rejecting || !reason.trim()) return;
    setBusyId(rejecting.id);
    try {
      await api.post(`/admin/credits/${rejecting.id}/reject`, { reason: reason.trim() });
      notify({ title: "درخواست رد شد و وثیقه بازگشت", kind: "success" });
      setRejecting(null);
      setReason("");
      refresh();
    } catch (e: any) {
      notify({ title: "خطا در رد درخواست اعتبار", body: apiError(e), kind: "error" });
    } finally {
      setBusyId(null);
    }
  }

  const items = pending.data?.items ?? [];
  if (!pending.isLoading && !pending.isError && items.length === 0) return null;

  return (
    <div
      className="card"
      style={{ padding: 16, marginBottom: 16, border: items.length > 0 ? "1px solid var(--gold)" : undefined }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>درخواست‌های اعتبار در انتظار تأیید</span>
        {items.length > 0 && (
          <span style={{ background: "var(--gold)", color: "#000", borderRadius: 999, padding: "1px 8px", fontSize: 11, fontWeight: 700 }}>
            {items.length}
          </span>
        )}
      </div>
      <p style={{ fontSize: 12, color: "var(--text-faint)", marginTop: 0, marginBottom: 10 }}>
        وثیقه‌ی این درخواست‌ها فریز شده و تا تصمیم شما در دسترس کاربر نیست. حد اعتبار در لحظه‌ی تأیید با قیمت
        همان لحظه بازمحاسبه می‌شود.
      </p>

      {pending.isLoading ? (
        <Loading />
      ) : pending.isError ? (
        <ErrorState message={apiError(pending.error)} />
      ) : items.length === 0 ? (
        <Empty label="درخواستی در انتظار تأیید نیست" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کد درخواست</th>
                <th>کاربر</th>
                <th>وثیقه فریزشده</th>
                <th>اهرم</th>
                <th>حد اعتبار درخواستی</th>
                <th>ثبت‌شده در</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const user = c.user;
                return (
                  <tr key={c.id}>
                    <td>
                      <button className="btn sm ghost" onClick={() => onOpenCredit(c)}>
                        <code>{c.creditCode}</code>
                      </button>
                    </td>
                    <td>
                      {user
                        ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.phone || user.email || c.userId
                        : c.userId}
                    </td>
                    {/* Collateral is a quantity in collateralSymbol; the credit
                        limit is money in creditBaseSymbol. */}
                    <td className="mono">{fmtBySymbol(c.collateralAmount ?? 0, c.collateralSymbol?.slug)}</td>
                    <td className="mono">{c.leverage != null ? `${c.leverage}x` : "—"}</td>
                    <td className="mono">{fmtBySymbol(c.creditLimit, c.creditBaseSymbol?.slug)}</td>
                    <td>{fmtDate(c.createAt)}</td>
                    <td>
                      <div className="row" style={{ gap: 4 }}>
                        <button className="btn sm" disabled={busyId === c.id} onClick={() => approve(c)}>
                          {busyId === c.id ? <span className="spin" /> : "تأیید و صدور"}
                        </button>
                        <button
                          className="btn sm ghost"
                          disabled={busyId === c.id}
                          onClick={() => { setRejecting(c); setReason(""); }}
                        >
                          رد
                        </button>
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
        <Modal title={`رد درخواست اعتبار ${rejecting.creditCode}`} onClose={() => setRejecting(null)}>
          <form className="modal-form" onSubmit={(e) => { e.preventDefault(); submitReject(); }}>
            <p style={{ gridColumn: "1 / -1", fontSize: 12, color: "var(--text-faint)", margin: 0 }}>
              با رد درخواست، {fmtBySymbol(rejecting.collateralAmount ?? 0, rejecting.collateralSymbol?.slug)} وثیقه به
              کیف‌پول واریزی کاربر برمی‌گردد و دلیل زیر برای او ثبت می‌شود.
            </p>
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
                {busyId === rejecting.id ? <><span className="spin" /> در حال ثبت…</> : "رد و بازگشت وثیقه"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
