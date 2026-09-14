import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiError } from "../../api/client";
import { Empty, ErrorState, Loading } from "../../components/ui";
import { fmtDate, fmtNum } from "../../lib/format";
import type { Packet, WarehouseRequest } from "../../api/types";
import { warehouseApi } from "./api";
import MovementsTable from "./MovementsTable";
import {
  ApproveWithdrawModal,
  SmartAllocationModal,
  SplitPacketModal,
  PacketPictureUpload,
} from "./parts";

type Tab = "overview" | "packets" | "deposits" | "withdraws" | "movements";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "نمای کلی" },
  { key: "packets", label: "بسته‌ها" },
  { key: "deposits", label: "درخواست‌های واریز" },
  { key: "withdraws", label: "درخواست‌های برداشت" },
  { key: "movements", label: "ورود و خروج" },
];

const REQUEST_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: "در انتظار", tone: "var(--gold)" },
  APPROVED: { label: "تاییدشده", tone: "var(--green)" },
  COMPLETED: { label: "تکمیل‌شده", tone: "var(--green)" },
  REJECTED: { label: "رد شده", tone: "var(--red)" },
  CANCELLED: { label: "لغو شده", tone: "var(--text-muted)" },
};

const PACKET_STATUS: Record<string, { label: string; tone: string }> = {
  ORPHAN: { label: "آزاد", tone: "var(--green)" },
  RESERVED: { label: "رزروشده", tone: "var(--gold)" },
  IN_WAREHOUSE: { label: "در انبار", tone: "var(--green)" },
  PENDING: { label: "در انتظار تحویل", tone: "var(--text-muted)" },
  WITHDRAWN: { label: "خارج‌شده", tone: "var(--text-muted)" },
  RELEASED: { label: "ترخیص‌شده", tone: "var(--text-muted)" },
};

function Pill({ map, value }: { map: Record<string, { label: string; tone: string }>; value: string }) {
  const entry = map[value] ?? { label: value, tone: "var(--text-muted)" };
  return <span style={{ color: entry.tone, fontWeight: 700, fontSize: 11 }}>● {entry.label}</span>;
}

/**
 * Everything about one warehouse, on one screen.
 *
 * The tabs keep the two kinds of record apart deliberately: deposit and
 * withdraw requests are paperwork, and movements are metal actually crossing
 * the door. A request can sit pending forever and a movement can happen with
 * no request at all, so showing them in one list would say something untrue.
 */
export default function WarehouseDetail({
  warehouseId,
  onEdit,
  onInspect,
  onInbound,
  onOutbound,
  onOpenRequest,
  onOpenPacket,
}: {
  warehouseId: string;
  onEdit: () => void;
  onInspect: () => void;
  onInbound: () => void;
  onOutbound: () => void;
  onOpenRequest: (request: WarehouseRequest) => void;
  onOpenPacket: (packetId: string) => void;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  // Fulfilling a withdrawal and reshaping a package are done from the rows they
  // belong to, rather than from a separate screen that repeats the list.
  const [allocateFor, setAllocateFor] = useState<WarehouseRequest | null>(null);
  const [approveFor, setApproveFor] = useState<WarehouseRequest | null>(null);
  const [splitPacket, setSplitPacket] = useState<Packet | null>(null);
  const [uploadPicture, setUploadPicture] = useState<string | null>(null);

  const stats = useQuery({
    queryKey: ["warehouse-stats", warehouseId],
    queryFn: () => warehouseApi.stats(warehouseId),
  });

  const totals = useQuery({
    queryKey: ["movement-totals", warehouseId],
    queryFn: () => warehouseApi.movementTotals(warehouseId),
  });

  const packets = useQuery({
    queryKey: ["warehouse-packets", warehouseId],
    queryFn: () => warehouseApi.packets(warehouseId),
    enabled: tab === "packets",
  });

  const deposits = useQuery({
    queryKey: ["warehouse-requests", warehouseId, "INPUT"],
    queryFn: () => warehouseApi.requests(warehouseId, "INPUT"),
    enabled: tab === "deposits",
  });

  const withdraws = useQuery({
    queryKey: ["warehouse-requests", warehouseId, "OUTPUT"],
    queryFn: () => warehouseApi.requests(warehouseId, "OUTPUT"),
    enabled: tab === "withdraws",
  });

  const movements = useQuery({
    queryKey: ["warehouse-movements", warehouseId],
    queryFn: () => warehouseApi.movements({ warehouseId }),
    enabled: tab === "movements",
  });

  if (stats.isLoading) return <div className="card" style={{ padding: 24 }}><Loading /></div>;
  if (stats.isError) return <div className="card" style={{ padding: 24 }}><ErrorState message={apiError(stats.error)} /></div>;

  const data = stats.data!;
  const warehouse = data.warehouse;

  return (
    <div className="card" style={{ padding: 18 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "flex-start",
          paddingBottom: 18,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div>
          <div style={{ fontSize: 20, fontWeight: 750 }}>{warehouse.name}</div>
          <div style={{ color: "var(--text-muted)", fontSize: 12, marginTop: 5 }}>
            {warehouse.location || "بدون موقعیت"}
            {warehouse.timeLimit ? ` · ${warehouse.timeLimit}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn sm ghost" onClick={onInspect}>جزئیات</button>
          <button className="btn sm ghost" onClick={onEdit}>ویرایش</button>
          <button className="btn sm" onClick={onOutbound}>↗ خروجی</button>
          <button className="btn sm primary" onClick={onInbound}>↙ ورودی</button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, margin: "16px 0" }}>
        <SummaryBox label="موجودی" value={`${fmtNum(data.inventoryWeight, 4)}g`} />
        <SummaryBox label="بسته‌ها" value={`${fmtNum(data.packets.total, 0)}`} hint={`${fmtNum(data.packets.reserved, 0)} رزرو`} />
        <SummaryBox label="ظرفیت مصرف‌شده" value={`${fmtNum(data.capacityUsedPercent, 1)}%`} />
        <SummaryBox
          label="خالص امروز"
          value={`${(totals.data?.netWeight ?? 0) >= 0 ? "+" : "−"}${fmtNum(Math.abs(totals.data?.netWeight ?? 0), 4)}g`}
          tone={(totals.data?.netWeight ?? 0) >= 0 ? "var(--green)" : "var(--red)"}
        />
      </div>

      <div style={{ display: "flex", gap: 3, borderBottom: "1px solid var(--border)", overflowX: "auto" }}>
        {TABS.map((t) => {
          const badge =
            t.key === "deposits" ? data.requests.depositPending : t.key === "withdraws" ? data.requests.withdrawPending : 0;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                border: 0,
                background: "transparent",
                padding: "13px 11px",
                color: tab === t.key ? "var(--text)" : "var(--text-muted)",
                fontSize: 12,
                fontWeight: 700,
                borderBottom: `2px solid ${tab === t.key ? "var(--gold)" : "transparent"}`,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {t.label}
              {badge > 0 && (
                <span style={{ color: "var(--gold)", marginRight: 5, fontSize: 10 }}>{fmtNum(badge, 0)}</span>
              )}
            </button>
          );
        })}
      </div>

      <div style={{ paddingTop: 16 }}>
        {tab === "overview" && <Overview data={data} totals={totals.data} />}

        {tab === "packets" && (
          packets.isLoading ? <Loading /> :
          packets.isError ? <ErrorState message={apiError(packets.error)} /> :
          (packets.data?.packets ?? []).length === 0 ? <Empty label="بسته‌ای در این انبار نیست" /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>شناسه</th><th>وزن باطنی</th><th>عیار</th><th>فرستنده</th><th>موقعیت</th><th>وضعیت</th><th></th></tr>
                </thead>
                <tbody>
                  {(packets.data!.packets as Packet[]).map((p: any) => (
                    <tr key={p.id} style={{ cursor: "pointer" }} onClick={() => onOpenPacket(p.id)}>
                      <td className="mono"><strong>{p.idSecure}</strong></td>
                      <td className="mono">{fmtNum(p.pureWeight, 4)}g</td>
                      <td className="mono muted">{p.ayar ?? "—"}</td>
                      <td className="muted">{p.senderUserId ? p.senderUserId.slice(0, 8) : p.providerKey || "—"}</td>
                      <td className="muted">{p.warehouseIndexPosition || "—"}</td>
                      <td><Pill map={PACKET_STATUS} value={p.status} /></td>
                      <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                        <button className="btn sm ghost" onClick={() => setUploadPicture(p.id)}>تصویر</button>
                        {/* Only a package still on the shelf can be reshaped. */}
                        {p.status === "ORPHAN" && (
                          <button className="btn sm ghost" style={{ marginRight: 6 }} onClick={() => setSplitPacket(p)}>
                            شکستن
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}

        {(tab === "deposits" || tab === "withdraws") && (
          <RequestTable
            query={tab === "deposits" ? deposits : withdraws}
            onOpen={onOpenRequest}
            emptyLabel={tab === "deposits" ? "درخواست واریزی برای این انبار نیست" : "درخواست برداشتی برای این انبار نیست"}
            onAllocate={tab === "withdraws" ? setAllocateFor : undefined}
            onApprove={tab === "withdraws" ? setApproveFor : undefined}
          />
        )}

        {tab === "movements" && (
          <MovementsTable
            movements={movements.data?.movements ?? []}
            loading={movements.isLoading}
            error={movements.isError ? apiError(movements.error) : undefined}
          />
        )}
      </div>

      {allocateFor && <SmartAllocationModal request={allocateFor} onClose={() => setAllocateFor(null)} />}
      {approveFor && <ApproveWithdrawModal request={approveFor} onClose={() => setApproveFor(null)} />}
      {splitPacket && <SplitPacketModal packet={splitPacket} onClose={() => setSplitPacket(null)} />}
      {uploadPicture && <PacketPictureUpload packetId={uploadPicture} onClose={() => setUploadPicture(null)} />}
    </div>
  );
}

function SummaryBox({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: string }) {
  return (
    <div style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 12 }}>
      <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 7 }}>{label}</div>
      <div className="mono" style={{ fontSize: 17, fontWeight: 750, color: tone }}>{value}</div>
      {hint && <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{hint}</div>}
    </div>
  );
}

function Overview({ data, totals }: { data: any; totals?: any }) {
  return (
    <div style={{ display: "grid", gap: 14 }}>
      <div style={{ padding: 16, border: "1px solid var(--border)", borderRadius: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4 }}>ظرفیت انبار</div>
        <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
          {fmtNum(data.warehouse.capacityUsed, 4)}g از {fmtNum(data.warehouse.capacityTotal, 4)}g
        </div>
        <div style={{ height: 8, background: "var(--surface-2, rgba(255,255,255,0.06))", borderRadius: 99, margin: "14px 0 8px", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(100, data.capacityUsedPercent)}%`, background: "var(--gold)", borderRadius: 99 }} />
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
        <SummaryBox label="ورودی امروز" value={`+${fmtNum(totals?.inboundWeight ?? 0, 4)}g`} hint={`${fmtNum(totals?.inboundCount ?? 0, 0)} حرکت`} tone="var(--green)" />
        <SummaryBox label="خروجی امروز" value={`−${fmtNum(totals?.outboundWeight ?? 0, 4)}g`} hint={`${fmtNum(totals?.outboundCount ?? 0, 0)} حرکت`} tone="var(--red)" />
        <SummaryBox label="بستهٔ آزاد" value={fmtNum(data.packets.free, 0)} />
        <SummaryBox label="بستهٔ رزروشده" value={fmtNum(data.packets.reserved, 0)} tone="var(--gold)" />
      </div>
    </div>
  );
}

function RequestTable({
  query,
  onOpen,
  emptyLabel,
  onAllocate,
  onApprove,
}: {
  query: any;
  onOpen: (r: WarehouseRequest) => void;
  emptyLabel: string;
  onAllocate?: (r: WarehouseRequest) => void;
  onApprove?: (r: WarehouseRequest) => void;
}) {
  if (query.isLoading) return <Loading />;
  if (query.isError) return <ErrorState message={apiError(query.error)} />;

  const rows: WarehouseRequest[] = query.data?.requests ?? [];
  if (!rows.length) return <Empty label={emptyLabel} />;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th>تاریخ</th><th>کاربر</th><th>وزن درخواستی</th><th>وزن تاییدشده</th><th>وضعیت</th>{(onAllocate || onApprove) && <th></th>}</tr>
        </thead>
        <tbody>
          {rows.map((r: any) => (
            <tr key={r.id} style={{ cursor: "pointer" }} onClick={() => onOpen(r)}>
              <td className="muted">{fmtDate(r.createAt)}</td>
              <td>{r.user ? [r.user.firstName, r.user.lastName].filter(Boolean).join(" ") || r.user.phone : r.userId?.slice(0, 8)}</td>
              <td className="mono">{fmtNum(r.declaredWeight ?? r.weight, 4)}g</td>
              <td className="mono">{r.actualWeight ? `${fmtNum(r.actualWeight, 4)}g` : "—"}</td>
              <td><Pill map={REQUEST_STATUS} value={r.status} /></td>
              {(onAllocate || onApprove) && (
                <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                  {/* Only a pending withdrawal is still waiting to be served. */}
                  {r.status === "PENDING" && onAllocate && (
                    <button className="btn sm ghost" onClick={() => onAllocate(r)}>پیشنهاد تخصیص</button>
                  )}
                  {r.status === "PENDING" && onApprove && (
                    <button className="btn sm primary" style={{ marginRight: 6 }} onClick={() => onApprove(r)}>
                      تایید و انتخاب بسته
                    </button>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
