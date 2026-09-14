import { Empty, ErrorState, Loading } from "../../components/ui";
import { fmtDate, fmtNum } from "../../lib/format";
import { MOVEMENT_SOURCE_LABELS, PARTY_LABELS, partyName, type Movement } from "./api";

/**
 * The physical ledger as a table.
 *
 * Shows what crossed the door and who it was with — deliberately not the same
 * thing as the request lists beside it, which are paperwork that may never
 * have been fulfilled.
 */
export default function MovementsTable({
  movements,
  loading,
  error,
  showWarehouse = false,
}: {
  movements: Movement[];
  loading: boolean;
  error?: string;
  showWarehouse?: boolean;
}) {
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!movements.length) return <Empty label="هنوز حرکتی ثبت نشده" />;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>تاریخ</th>
            {showWarehouse && <th>انبار</th>}
            <th>جهت</th>
            <th>وزن باطنی</th>
            <th>طرف حساب</th>
            <th>منشأ</th>
            <th>بسته‌ها</th>
          </tr>
        </thead>
        <tbody>
          {movements.map((movement) => {
            const inbound = movement.direction === "IN";
            return (
              <tr key={movement.id}>
                <td className="muted">{fmtDate(movement.createAt)}</td>
                {showWarehouse && <td>{movement.warehouse?.name ?? "—"}</td>}
                <td>
                  <span style={{ color: inbound ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                    {inbound ? "↙ ورودی" : "↗ خروجی"}
                  </span>
                </td>
                <td className="mono" style={{ color: inbound ? "var(--green)" : "var(--red)", fontWeight: 700 }}>
                  {inbound ? "+" : "−"}
                  {fmtNum(movement.netWeight, 4)}g
                </td>
                <td>
                  {partyName(movement)}
                  <span style={{ fontSize: 10, color: "var(--text-muted)", marginRight: 6 }}>
                    {PARTY_LABELS[movement.partyType]}
                  </span>
                </td>
                <td className="muted">{MOVEMENT_SOURCE_LABELS[movement.source] ?? movement.source}</td>
                <td className="mono muted">{movement.packetIds?.length ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
