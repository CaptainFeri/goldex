import { Loading, ErrorState, Empty } from "../../components/ui";
import { fmtNum } from "../../lib/format";
import type { WarehouseSummary } from "./api";

const STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: "فعال", tone: "var(--green)" },
  INACTIVE: { label: "غیرفعال", tone: "var(--text-muted)" },
  MAINTENANCE: { label: "تعمیرات", tone: "var(--gold)" },
  FULL: { label: "پر", tone: "var(--red)" },
};

/**
 * The warehouse picker.
 *
 * Each row carries what that warehouse holds, so choosing one is an informed
 * choice rather than a name in a list — which is the point of making the
 * overview warehouse-first.
 */
export default function WarehouseList({
  warehouses,
  selectedId,
  onSelect,
  onCreate,
  loading,
  error,
}: {
  warehouses: WarehouseSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  loading: boolean;
  error?: string;
}) {
  return (
    <div className="card" style={{ alignSelf: "start" }}>
      <div
        style={{
          padding: "16px 18px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>انبارها</div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 3 }}>
            برای دیدن جزئیات یک انبار را انتخاب کنید
          </div>
        </div>
        <button className="btn sm" onClick={onCreate}>
          + انبار جدید
        </button>
      </div>

      <div style={{ padding: 10, maxHeight: "70vh", overflowY: "auto" }}>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} />
        ) : warehouses.length === 0 ? (
          <Empty label="هنوز انباری ثبت نشده" />
        ) : (
          warehouses.map((warehouse) => {
            const status = STATUS_LABEL[warehouse.status] ?? { label: warehouse.status, tone: "var(--text-muted)" };
            const selected = warehouse.id === selectedId;

            return (
              <button
                key={warehouse.id}
                onClick={() => onSelect(warehouse.id)}
                style={{
                  width: "100%",
                  textAlign: "right",
                  background: selected ? "var(--surface-2, rgba(255,255,255,0.05))" : "transparent",
                  border: `1px solid ${selected ? "var(--border-strong, var(--border))" : "transparent"}`,
                  borderRadius: 12,
                  padding: 14,
                  marginBottom: 6,
                  cursor: "pointer",
                  color: "inherit",
                  font: "inherit",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{warehouse.name}</div>
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                      {warehouse.location || "بدون موقعیت"}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: status.tone, whiteSpace: "nowrap" }}>
                    ● {status.label}
                  </span>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>موجودی</div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>
                      {fmtNum(warehouse.inventoryWeight, 4)}g
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div style={{ fontSize: 10, color: "var(--text-muted)" }}>بسته‌ها</div>
                    <div className="mono" style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>
                      {fmtNum(warehouse.packetCount, 0)}
                      {warehouse.reservedCount > 0 && (
                        <span style={{ fontSize: 10, color: "var(--gold)", marginRight: 6 }}>
                          {fmtNum(warehouse.reservedCount, 0)} رزرو
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
