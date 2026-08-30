import { useQuery } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../../api/client";
import { Modal, Loading, ErrorState, Empty, Badge } from "../../components/ui";
import type { Credit } from "../../api/types";
import { STATUS_LABELS, STATUS_KINDS, RISK_STATE_LABELS, RISK_STATE_KINDS, fmtNum, fmtDate } from "./labels";

export function UserCreditsModal({ userId, credit, onClose }: { userId: string; credit: Credit; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["user-credits", userId],
    queryFn: async () => unwrap<any>((await api.get(`/admin/credits/user/${userId}`)).data),
  });
  const data = q.data;
  const user = credit.user;
  return (
    <Modal title={`اعتبارات کاربر ${user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.phone || user.email : userId}`} onClose={onClose} wide>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={apiError(q.error)} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {data?.activeOverview && (
            <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, border: "1px solid var(--gold)" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: 14, color: "var(--gold)" }}>اعتبار فعال</h4>
              <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <span className="k">حد اعتبار</span><span className="v mono">{fmtNum(data.activeOverview.creditLimit)} ریال</span>
                <span className="k">استفاده‌شده</span><span className="v mono">{fmtNum(data.activeOverview.usedCredit)} ریال</span>
                <span className="k">موجود</span><span className="v mono">{fmtNum(data.activeOverview.availableCredit)} ریال</span>
                <span className="k">ارزش وثیقه</span><span className="v mono">{fmtNum(data.activeOverview.currentCollateralValue)} ریال</span>
                <span className="k">درادون</span><span className="v mono">{Number(data.activeOverview.lastDrawdownPercent ?? 0).toFixed(1)}% / {data.activeOverview.drawdownPercent}%</span>
                <span className="k">ریسک</span>
                <span className="v"><Badge kind={(RISK_STATE_KINDS[data.activeOverview.riskState] || "gray") as any}>{RISK_STATE_LABELS[data.activeOverview.riskState] || data.activeOverview.riskState}</Badge></span>
              </div>
            </div>
          )}
          <div>
            <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>سابقه اعتبارات ({data?.credits?.length || 0})</h4>
            {!data?.credits?.length ? <Empty label="بدون اعتبار" /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>کد</th><th>مبلغ</th><th>حد</th><th>وضعیت</th><th>تسویه</th><th>ساخته‌شده</th></tr></thead>
                  <tbody>
                    {data.credits.map((c: any) => (
                      <tr key={c.id}>
                        <td><code>{c.creditCode}</code></td>
                        <td className="mono">{fmtNum(c.amount)}</td>
                        <td className="mono">{fmtNum(c.creditLimit)}</td>
                        <td><Badge kind={(STATUS_KINDS[c.status] || "gray") as any}>{STATUS_LABELS[c.status] || c.status}</Badge></td>
                        <td>{fmtDate(c.settledAt)}</td>
                        <td>{fmtDate(c.createAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
