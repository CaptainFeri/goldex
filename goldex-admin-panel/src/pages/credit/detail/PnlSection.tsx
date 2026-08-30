import { Loading, Empty, Badge } from "../../../components/ui";
import { ORDER_STATUS_LABELS, CREDIT_ORDER_STATUS_LABELS, fmtNum } from "../labels";

export interface CreditPnl {
  totalPnL: number;
  realizedPnL: number;
  unrealizedPnL: number;
  orders: Array<{
    orderId: string;
    side: string;
    entryPrice: number;
    currentPrice: number | null;
    quantity: number;
    executedQuantity: number;
    pnl: number;
    status: string;
    pairKey: string;
  }>;
}

/** Realized/unrealized P&L summary plus the per-order breakdown behind it. */
export function PnlSection({
  isLoading,
  pnlData,
  creditOrders,
}: {
  isLoading: boolean;
  pnlData?: CreditPnl;
  creditOrders?: Array<{ orderId: string; status: string }>;
}) {
  return (
    <>
      {isLoading ? (
        <Loading />
      ) : pnlData ? (
        <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
          <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>سود و زیان</h4>
          <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <span className="k">کل سود/زیان</span>
            <span className="v mono" style={{ color: pnlData.totalPnL >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
              {pnlData.totalPnL >= 0 ? "+" : ""}{fmtNum(pnlData.totalPnL)} ریال
            </span>

            <span className="k">سود/زیان محقق شده</span>
            <span className="v mono" style={{ color: pnlData.realizedPnL >= 0 ? "var(--green)" : "var(--red)" }}>
              {pnlData.realizedPnL >= 0 ? "+" : ""}{fmtNum(pnlData.realizedPnL)} ریال
            </span>

            <span className="k">سود/زیان محقق نشده</span>
            <span className="v mono" style={{ color: pnlData.unrealizedPnL >= 0 ? "var(--green)" : "var(--red)" }}>
              {pnlData.unrealizedPnL >= 0 ? "+" : ""}{fmtNum(pnlData.unrealizedPnL)} ریال
            </span>
          </div>
        </div>
      ) : null}

      <div>
        <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>سفارشات اعتباری ({pnlData?.orders.length || 0})</h4>
        {pnlData?.orders.length === 0 ? (
          <Empty label="هیچ سفارشی ثبت نشده" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>جفت</th>
                  <th>جهت</th>
                  <th>قیمت ورود</th>
                  <th>قیمت فعلی</th>
                  <th>مقدار</th>
                  <th>انجام شده</th>
                  <th>سود/زیان</th>
                  <th>وضعیت سفارش</th>
                  <th>وضعیت اعتبار</th>
                </tr>
              </thead>
              <tbody>
                {pnlData?.orders.map((o) => {
                  const co = creditOrders?.find((x) => x.orderId === o.orderId);
                  return (
                    <tr key={o.orderId}>
                      <td className="mono">{o.pairKey}</td>
                      <td>
                        <Badge kind={o.side === "BUY" ? "green" : "red"}>
                          {o.side === "BUY" ? "خرید" : "فروش"}
                        </Badge>
                      </td>
                      <td className="mono">{fmtNum(o.entryPrice)}</td>
                      <td className="mono">{o.currentPrice ? fmtNum(o.currentPrice) : "—"}</td>
                      <td className="mono">{fmtNum(o.quantity)}</td>
                      <td className="mono">{fmtNum(o.executedQuantity)}</td>
                      <td className="mono" style={{ color: o.pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500 }}>
                        {o.pnl >= 0 ? "+" : ""}{fmtNum(o.pnl)}
                      </td>
                      <td>
                        <Badge kind={o.status === "COMPLETED" ? "green" : o.status === "CANCELLED" ? "gray" : "gold"}>
                          {ORDER_STATUS_LABELS[o.status] || o.status}
                        </Badge>
                      </td>
                      <td>
                        <Badge kind={
                          co?.status === "ACTIVE" ? "green" :
                          co?.status === "MARGIN_CALLED" ? "red" :
                          co?.status === "COMPLETED" ? "gold" : "gray"
                        }>
                          {CREDIT_ORDER_STATUS_LABELS[co?.status || ""] || "—"}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
