import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiError } from "../api/client";
import { Card, Loading, ErrorState } from "../components/ui";
import { fmtNum } from "../lib/format";
import type { Warehouse, WarehouseRequest } from "../api/types";
import { warehouseApi } from "./warehouse/api";
import WarehouseList from "./warehouse/WarehouseList";
import WarehouseDetail from "./warehouse/WarehouseDetail";
import MovementsTable from "./warehouse/MovementsTable";
import RecordMovementModal from "./warehouse/RecordMovementModal";
import {
  WarehouseForm,
  PacketForm,
  RequestProcessModal,
  ConfirmMaterialModal,
  SettlementReleaseForm,
  PacketDetailsModal,
  RequestDetailsModal,
  WarehouseDetailsModal,
  AssignPacketModal,
  downloadCSV,
} from "./warehouse/parts";

type Section = "warehouses" | "movements" | "settlement";

const SECTIONS: { key: Section; label: string; note: string }[] = [
  { key: "warehouses", label: "انبارها", note: "موجودی، بسته‌ها و درخواست‌های هر انبار" },
  { key: "movements", label: "ورود و خروج", note: "جابه‌جایی فیزیکی واقعی، جدا از درخواست‌ها" },
  { key: "settlement", label: "مواد تسویه", note: "طلای تسویه‌شده با تامین‌کننده و مانده بسته‌بندی‌نشده" },
];

/**
 * The warehouse screen, organised around warehouses rather than around record
 * types.
 *
 * The old page put every packet, every request and every warehouse in flat
 * lists side by side, which answered "how many requests are pending" but not
 * "what is going on in Tehran" — the question an operator actually has. Here a
 * warehouse is chosen first and everything else is read in its context.
 *
 * Movements keep a section of their own as well as a tab inside each warehouse.
 * They are the physical fact, and they are worth being able to scan across the
 * whole operation, which is also where metal that moved with no paperwork
 * behind it becomes visible.
 */
export default function WarehousePage() {
  const qc = useQueryClient();
  const [section, setSection] = useState<Section>("warehouses");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [movementDirection, setMovementDirection] = useState<"IN" | "OUT" | null>(null);
  const [showWarehouseForm, setShowWarehouseForm] = useState(false);
  const [editWarehouse, setEditWarehouse] = useState<Warehouse | null>(null);
  const [showPacketForm, setShowPacketForm] = useState(false);
  const [showSettlementForm, setShowSettlementForm] = useState(false);
  const [processReq, setProcessReq] = useState<WarehouseRequest | null>(null);
  const [confirmMaterialReq, setConfirmMaterialReq] = useState<WarehouseRequest | null>(null);
  const [requestDetailId, setRequestDetailId] = useState<string | null>(null);
  const [packetDetailId, setPacketDetailId] = useState<string | null>(null);
  const [warehouseDetailId, setWarehouseDetailId] = useState<string | null>(null);
  const [assignFor, setAssignFor] = useState<WarehouseRequest | null>(null);

  const summary = useQuery({
    queryKey: ["warehouse-summary"],
    queryFn: warehouseApi.summary,
  });

  const totals = useQuery({
    queryKey: ["movement-totals", "all"],
    queryFn: () => warehouseApi.movementTotals(),
    refetchInterval: 30000,
  });

  const movements = useQuery({
    queryKey: ["warehouse-movements", "all"],
    queryFn: () => warehouseApi.movements(),
    enabled: section === "movements",
  });

  const warehouses = useMemo(() => summary.data?.warehouses ?? [], [summary.data]);

  // Land on a warehouse rather than an empty panel, and let go of one that has
  // been deleted underneath us.
  useEffect(() => {
    if (!warehouses.length) return;
    if (!selectedId || !warehouses.some((w) => w.id === selectedId)) {
      setSelectedId(warehouses[0].id);
    }
  }, [warehouses, selectedId]);

  const totalInventory = warehouses.reduce((sum, w) => sum + Number(w.inventoryWeight || 0), 0);
  const totalPackets = warehouses.reduce((sum, w) => sum + Number(w.packetCount || 0), 0);
  const activeCount = warehouses.filter((w) => w.status === "ACTIVE").length;

  const exportToday = async () => {
    const { api, unwrap } = await import("../api/client");
    const data = unwrap<{ deliveries: Record<string, any>[]; withdraws: Record<string, any>[] }>(
      (await api.get("/admin/warehouse/today-export")).data,
    );
    const today = new Date().toISOString().slice(0, 10);
    if (data.deliveries?.length) downloadCSV(data.deliveries, `warehouse-deliveries-${today}.csv`);
    if (data.withdraws?.length) downloadCSV(data.withdraws, `warehouse-withdraws-${today}.csv`);
  };

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ["warehouse-summary"] });
    qc.invalidateQueries({ queryKey: ["warehouse-stats"] });
    qc.invalidateQueries({ queryKey: ["warehouse-requests"] });
    qc.invalidateQueries({ queryKey: ["warehouse-packets"] });
    qc.invalidateQueries({ queryKey: ["warehouse-movements"] });
    qc.invalidateQueries({ queryKey: ["movement-totals"] });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, marginBottom: 20, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontSize: 24, margin: "0 0 6px" }}>مدیریت انبار</h1>
          <p style={{ fontSize: 13, color: "var(--text-muted)", margin: 0 }}>
            موجودی، بسته‌ها، درخواست‌ها و جابه‌جایی فیزیکی انبارها
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn ghost" onClick={exportToday}>خروجی امروز (CSV)</button>
          <button className="btn" onClick={() => setMovementDirection("OUT")}>↗ ثبت خروجی</button>
          <button className="btn primary" onClick={() => setMovementDirection("IN")}>↙ ثبت ورودی</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 20 }}>
        <Kpi label="انبارهای فعال" value={fmtNum(activeCount, 0)} hint={`از ${fmtNum(warehouses.length, 0)} انبار`} />
        <Kpi label="کل بسته‌ها" value={fmtNum(totalPackets, 0)} hint="در همهٔ انبارها" />
        <Kpi label="موجودی کل" value={`${fmtNum(totalInventory, 4)}g`} hint="وزن باطنی ۷۵۰" />
        <Kpi label="ورودی امروز" value={`+${fmtNum(totals.data?.inboundWeight ?? 0, 4)}g`} hint={`${fmtNum(totals.data?.inboundCount ?? 0, 0)} حرکت`} tone="var(--green)" />
        <Kpi label="خروجی امروز" value={`−${fmtNum(totals.data?.outboundWeight ?? 0, 4)}g`} hint={`${fmtNum(totals.data?.outboundCount ?? 0, 0)} حرکت`} tone="var(--red)" />
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 18, flexWrap: "wrap" }}>
        {SECTIONS.map((s) => (
          <button
            key={s.key}
            className={"btn sm " + (section === s.key ? "primary" : "ghost")}
            onClick={() => setSection(s.key)}
            title={s.note}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === "warehouses" && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(280px, 360px) 1fr", gap: 16, alignItems: "start" }}>
          <WarehouseList
            warehouses={warehouses}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onCreate={() => { setEditWarehouse(null); setShowWarehouseForm(true); }}
            loading={summary.isLoading}
            error={summary.isError ? apiError(summary.error) : undefined}
          />

          {selectedId ? (
            <WarehouseDetail
              key={selectedId}
              warehouseId={selectedId}
              onEdit={() => {
                setEditWarehouse(warehouses.find((w) => w.id === selectedId) ?? null);
                setShowWarehouseForm(true);
              }}
              onInspect={() => setWarehouseDetailId(selectedId)}
              onInbound={() => setMovementDirection("IN")}
              onOutbound={() => setMovementDirection("OUT")}
              onOpenRequest={(request) => {
                // Material confirmation is the only step that needs the scale;
                // everything else is a status decision.
                if (request.type === "INPUT" && request.status === "APPROVED") setConfirmMaterialReq(request);
                else if (request.type === "OUTPUT" && request.status === "PENDING" && !request.packetId) setAssignFor(request);
                else if (request.status === "PENDING" || request.status === "APPROVED") setProcessReq(request);
                else setRequestDetailId(request.id);
              }}
              onOpenPacket={setPacketDetailId}
            />
          ) : (
            <Card title="انبار">
              {summary.isLoading ? <Loading /> : <p style={{ color: "var(--text-muted)", fontSize: 13 }}>یک انبار انتخاب کنید.</p>}
            </Card>
          )}
        </div>
      )}

      {section === "movements" && (
        <Card
          title="ورود و خروج انبار"
          action={<button className="btn sm" onClick={() => setShowPacketForm(true)}>+ بستهٔ دستی</button>}
        >
          <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 0 }}>
            هر سطر یک جابه‌جایی فیزیکی واقعی است. درخواست‌ها جدا هستند: درخواست ممکن است هرگز انجام نشود، و
            جابه‌جایی ممکن است اصلاً درخواستی پشتش نداشته باشد.
          </p>
          <MovementsTable
            movements={movements.data?.movements ?? []}
            loading={movements.isLoading}
            error={movements.isError ? apiError(movements.error) : undefined}
            showWarehouse
          />
        </Card>
      )}

      {section === "settlement" && (
        <SettlementSection onRelease={() => setShowSettlementForm(true)} />
      )}

      {movementDirection && (
        <RecordMovementModal
          direction={movementDirection}
          warehouses={warehouses}
          defaultWarehouseId={selectedId}
          onClose={() => { setMovementDirection(null); refreshAll(); }}
        />
      )}
      {showWarehouseForm && (
        <WarehouseForm
          initial={editWarehouse ?? undefined}
          onClose={() => { setShowWarehouseForm(false); setEditWarehouse(null); refreshAll(); }}
        />
      )}
      {showPacketForm && <PacketForm onClose={() => { setShowPacketForm(false); refreshAll(); }} />}
      {showSettlementForm && <SettlementReleaseForm onClose={() => { setShowSettlementForm(false); refreshAll(); }} />}
      {processReq && <RequestProcessModal request={processReq} onClose={() => { setProcessReq(null); refreshAll(); }} />}
      {confirmMaterialReq && (
        <ConfirmMaterialModal request={confirmMaterialReq} onClose={() => { setConfirmMaterialReq(null); refreshAll(); }} />
      )}
      {requestDetailId && <RequestDetailsModal requestId={requestDetailId} onClose={() => setRequestDetailId(null)} />}
      {packetDetailId && <PacketDetailsModal packetId={packetDetailId} onClose={() => setPacketDetailId(null)} />}
      {warehouseDetailId && <WarehouseDetailsModal warehouseId={warehouseDetailId} onClose={() => setWarehouseDetailId(null)} />}
      {assignFor && <AssignPacketModal request={assignFor} onClose={() => { setAssignFor(null); refreshAll(); }} />}
    </div>
  );
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div className="card" style={{ padding: 18 }}>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 10 }}>{label}</div>
      <div className="mono" style={{ fontSize: 22, fontWeight: 750, color: tone }}>{value}</div>
      {hint && <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>{hint}</div>}
    </div>
  );
}

/** Provider settlement material, and how much of it is still on the bench. */
function SettlementSection({ onRelease }: { onRelease: () => void }) {
  const balance = useQuery({
    queryKey: ["settlement-balance"],
    queryFn: async () => {
      const { api, unwrap } = await import("../api/client");
      return unwrap<any>((await api.get("/admin/warehouse/settlement-material/balance")).data);
    },
  });

  if (balance.isLoading) return <Card title="مواد تسویه"><Loading /></Card>;
  if (balance.isError) return <Card title="مواد تسویه"><ErrorState message={apiError(balance.error)} /></Card>;

  const data = balance.data;

  return (
    <Card title="مواد تسویه" action={<button className="btn sm primary" onClick={onRelease}>ترخیص و بسته‌بندی</button>}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
        <Kpi label="کل دریافت‌شده" value={`${fmtNum(data?.totalReceived, 4)}g`} tone="var(--green)" />
        <Kpi label="کل پرداخت‌شده" value={`${fmtNum(data?.totalPaid, 4)}g`} tone="var(--red)" />
        <Kpi label="بسته‌بندی‌شده" value={`${fmtNum(data?.totalPacked, 4)}g`} />
        <Kpi
          label="بسته‌بندی‌نشده"
          value={`${fmtNum(data?.totalUnpacked, 4)}g`}
          hint="تا بسته‌بندی نشود قابل تخصیص نیست"
          tone={data?.totalUnpacked > 0 ? "var(--gold)" : undefined}
        />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>تامین‌کننده</th><th>دریافت</th><th>پرداخت</th><th>بسته‌بندی‌شده</th><th>بسته‌بندی‌نشده</th></tr>
          </thead>
          <tbody>
            {(data?.providers ?? []).map((p: any) => (
              <tr key={p.providerKey}>
                <td>{p.providerKey}</td>
                <td className="mono" style={{ color: "var(--green)" }}>{fmtNum(p.received, 4)}g</td>
                <td className="mono" style={{ color: "var(--red)" }}>{fmtNum(p.paid, 4)}g</td>
                <td className="mono">{fmtNum(p.packed, 4)}g</td>
                <td className="mono" style={{ color: p.unpacked > 0 ? "var(--gold)" : undefined }}>{fmtNum(p.unpacked, 4)}g</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
