import { Loading, Empty, Badge } from "../../../components/ui";
import { fmtNum, fmtDate } from "../labels";

/** Per-trade collateral lock lifecycle (handoff §3, §13): locked/available/released/consumed. */
export function CollateralLocksPanel({
  isLoading,
  data,
  collateralAmount,
}: {
  isLoading: boolean;
  data?: { summary: any; locks: any[] };
  collateralAmount?: number;
}) {
  return (
    <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
      <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>قفل وثیقه (Collateral Locks)</h4>
      {isLoading ? <Loading /> : data ? (
        <>
          <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
            <span className="k">وثیقه کل</span>
            <span className="v mono">{fmtNum(collateralAmount ?? 0)}</span>
            <span className="k">قفل‌شده</span>
            <span className="v mono" style={{ color: "var(--gold)", fontWeight: 600 }}>{fmtNum(data.summary.totalLocked)}</span>
            <span className="k">آزاد (Available)</span>
            <span className="v mono">{fmtNum(data.summary.available)}</span>
            <span className="k">آزادشده (Released)</span>
            <span className="v mono">{fmtNum(data.summary.released)}</span>
            <span className="k">مصرف‌شده (Consumed)</span>
            <span className="v mono" style={{ color: data.summary.consumed > 0 ? "var(--red)" : "inherit" }}>{fmtNum(data.summary.consumed)}</span>
          </div>
          {(data.locks || []).length === 0 ? (
            <Empty label="هیچ قفلی ثبت نشده" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>مبلغ (g)</th><th>مبلغ اسمی</th><th>وضعیت</th><th>فعال‌شده</th><th>تاریخ</th></tr></thead>
                <tbody>
                  {data.locks.map((l: any) => (
                    <tr key={l.id}>
                      <td className="mono">{fmtNum(l.amount)}</td>
                      <td className="mono">{fmtNum(l.notionalValue)}</td>
                      <td>
                        <Badge kind={l.status === "ACTIVE" ? "green" : l.status === "RELEASED" ? "gold" : l.status === "CONSUMED" ? "red" : "gray"}>
                          {l.status === "ACTIVE" ? "فعال" : l.status === "RELEASED" ? "آزاد" : l.status === "CONSUMED" ? "مصرف" : l.status}
                        </Badge>
                      </td>
                      <td className="mono">{l.creditOrder ? l.creditOrder.order?.orderCode || l.creditOrder.id?.slice(0, 8) : "—"}</td>
                      <td>{fmtDate(l.activatedAt || l.releasedAt || l.consumedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
