import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, apiError, unwrap } from "../../api/client";
import { Modal, ErrorState } from "../../components/ui";
import { fmtNum } from "../../lib/format";
import type { Packet } from "../../api/types";
import { warehouseApi, type WarehouseSummary } from "./api";

type Direction = "IN" | "OUT";
type Party = "USER" | "PROVIDER";

/**
 * Records metal that moved with no request behind it.
 *
 * Outbound offers providers only. Releasing material to a user settles a claim
 * against their wallet, and that belongs to the withdrawal flow, which locks
 * the balance first and refunds whatever the packages fall short by — a form
 * like this one would skip all of it. The API refuses it too; this keeps the
 * choice from being offered in the first place.
 */
export default function RecordMovementModal({
  direction,
  warehouses,
  defaultWarehouseId,
  onClose,
}: {
  direction: Direction;
  warehouses: WarehouseSummary[];
  defaultWarehouseId?: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const inbound = direction === "IN";

  const [warehouseId, setWarehouseId] = useState(defaultWarehouseId || warehouses[0]?.id || "");
  const [partyType, setPartyType] = useState<Party>(inbound ? "USER" : "PROVIDER");
  const [partyUserId, setPartyUserId] = useState("");
  const [providerKey, setProviderKey] = useState("");
  const [symbolId, setSymbolId] = useState("");
  const [apparentWeight, setApparentWeight] = useState("");
  const [ayar, setAyar] = useState("");
  const [netWeight, setNetWeight] = useState("");
  const [wastage, setWastage] = useState("");
  const [position, setPosition] = useState("");
  const [packetId, setPacketId] = useState("");
  const [notes, setNotes] = useState("");

  const symbols = useQuery({
    queryKey: ["symbols"],
    queryFn: async () => unwrap<any[]>((await api.get("/admin/symbols")).data),
  });

  const providers = useQuery({
    queryKey: ["providers"],
    queryFn: async () => unwrap<any[]>((await api.get("/provider")).data),
  });

  // Only free packages can leave, and only from the chosen warehouse.
  const packets = useQuery({
    queryKey: ["warehouse-free-packets", warehouseId],
    queryFn: () => warehouseApi.packets(warehouseId, { status: "ORPHAN" }),
    enabled: !inbound && !!warehouseId,
  });

  // The scale is the authority: net weight is (apparent × fineness) / 750
  // whenever both were measured, whatever anyone typed.
  const derived =
    Number(apparentWeight) > 0 && Number(ayar) > 0
      ? (Number(apparentWeight) * Number(ayar)) / 750
      : null;

  const submit = useMutation({
    mutationFn: () =>
      warehouseApi.recordMovement({
        warehouseId,
        direction,
        partyType,
        ...(partyType === "USER" ? { partyUserId } : { providerKey }),
        symbolId,
        ...(inbound
          ? {
              ...(Number(apparentWeight) > 0 ? { apparentWeight: Number(apparentWeight) } : {}),
              ...(Number(ayar) > 0 ? { ayar: Number(ayar) } : {}),
              ...(derived === null && Number(netWeight) > 0 ? { netWeight: Number(netWeight) } : {}),
              ...(Number(wastage) > 0 ? { wastage: Number(wastage) } : {}),
              ...(position ? { warehouseIndexPosition: position } : {}),
            }
          : { packetId }),
        ...(notes ? { notes } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["warehouse-summary"] });
      qc.invalidateQueries({ queryKey: ["warehouse-movements"] });
      qc.invalidateQueries({ queryKey: ["warehouse-stats"] });
      qc.invalidateQueries({ queryKey: ["movement-totals"] });
      onClose();
    },
  });

  const ready =
    warehouseId &&
    symbolId &&
    (partyType === "USER" ? partyUserId : providerKey) &&
    (inbound ? derived !== null || Number(netWeight) > 0 : packetId);

  return (
    <Modal
      title={inbound ? "ثبت ورودی انبار" : "ثبت خروجی انبار"}
      onClose={onClose}
    >
      <div
        style={{
          padding: "10px 12px",
          borderRadius: 10,
          background: "var(--surface-2, rgba(255,255,255,0.04))",
          fontSize: 11,
          marginBottom: 16,
          lineHeight: 1.7,
        }}
      >
        {inbound
          ? "این ثبت، جابه‌جایی فیزیکی واقعی است و درخواستی پشتش نیست. ورودی به نام یک کاربر، وزن باطنی تاییدشده را به کیف پول او اضافه می‌کند."
          : "خروجی دستی فقط برای تامین‌کننده است. تحویل ماده به کاربر باید از مسیر درخواست برداشت انجام شود تا موجودی قفل و مابه‌التفاوت بازگردانده شود."}
      </div>

      {submit.isError && <ErrorState message={apiError(submit.error)} />}

      <div className="field">
        <label>انبار</label>
        <select className="form-input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
          <option value="">انتخاب کنید…</option>
          {warehouses.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>{inbound ? "فرستنده" : "گیرنده"}</label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          <button
            className={"btn sm " + (partyType === "USER" ? "primary" : "ghost")}
            disabled={!inbound}
            title={inbound ? undefined : "خروجی به نام کاربر از مسیر درخواست برداشت انجام می‌شود"}
            onClick={() => setPartyType("USER")}
          >
            کاربر
          </button>
          <button
            className={"btn sm " + (partyType === "PROVIDER" ? "primary" : "ghost")}
            onClick={() => setPartyType("PROVIDER")}
          >
            تامین‌کننده
          </button>
        </div>
      </div>

      {partyType === "USER" ? (
        <div className="field">
          <label>شناسه کاربر</label>
          <input
            className="form-input"
            value={partyUserId}
            onChange={(e) => setPartyUserId(e.target.value)}
            placeholder="UUID کاربر"
          />
        </div>
      ) : (
        <div className="field">
          <label>تامین‌کننده</label>
          <select className="form-input" value={providerKey} onChange={(e) => setProviderKey(e.target.value)}>
            <option value="">انتخاب کنید…</option>
            {(providers.data ?? []).map((p: any) => (
              <option key={p.key ?? p.providerKey} value={p.key ?? p.providerKey}>
                {p.name ?? p.key ?? p.providerKey}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="field">
        <label>نماد</label>
        <select className="form-input" value={symbolId} onChange={(e) => setSymbolId(e.target.value)}>
          <option value="">انتخاب کنید…</option>
          {(symbols.data ?? []).map((s: any) => (
            <option key={s.id} value={s.id}>
              {s.slug ?? s.name}
            </option>
          ))}
        </select>
      </div>

      {inbound ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field">
              <label>وزن ظاهری</label>
              <input
                className="form-input"
                type="number"
                step="0.00000001"
                value={apparentWeight}
                onChange={(e) => setApparentWeight(e.target.value)}
              />
            </div>
            <div className="field">
              <label>عیار</label>
              <input
                className="form-input"
                type="number"
                step="0.0001"
                value={ayar}
                onChange={(e) => setAyar(e.target.value)}
              />
            </div>
          </div>

          {derived !== null ? (
            <div style={{ fontSize: 11, color: "var(--green)", marginBottom: 14 }}>
              وزن باطنی ۷۵۰ محاسبه‌شده: <strong className="mono">{fmtNum(derived, 8)}g</strong>
            </div>
          ) : (
            <div className="field">
              <label>وزن باطنی ۷۵۰</label>
              <input
                className="form-input"
                type="number"
                step="0.00000001"
                value={netWeight}
                onChange={(e) => setNetWeight(e.target.value)}
                placeholder="اگر وزن ظاهری و عیار وارد شود، خودکار محاسبه می‌شود"
              />
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="field">
              <label>انگی (اختیاری)</label>
              <input
                className="form-input"
                type="number"
                step="0.00000001"
                value={wastage}
                onChange={(e) => setWastage(e.target.value)}
              />
            </div>
            <div className="field">
              <label>موقعیت در انبار</label>
              <input className="form-input" value={position} onChange={(e) => setPosition(e.target.value)} />
            </div>
          </div>
        </>
      ) : (
        <div className="field">
          <label>بستهٔ خروجی</label>
          <select className="form-input" value={packetId} onChange={(e) => setPacketId(e.target.value)}>
            <option value="">انتخاب کنید…</option>
            {((packets.data?.packets ?? []) as Packet[]).map((p) => (
              <option key={p.id} value={p.id}>
                {p.idSecure} — {fmtNum(p.pureWeight, 4)}g
              </option>
            ))}
          </select>
          {!packets.isLoading && (packets.data?.packets ?? []).length === 0 && warehouseId && (
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 6 }}>
              بستهٔ آزادی در این انبار نیست. بستهٔ رزروشده تا تعیین‌تکلیف برداشتش قابل خروج نیست.
            </div>
          )}
        </div>
      )}

      <div className="field">
        <label>یادداشت</label>
        <textarea className="form-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
        <button className="btn ghost" onClick={onClose}>
          انصراف
        </button>
        <button className="btn primary" disabled={!ready || submit.isPending} onClick={() => submit.mutate()}>
          {submit.isPending ? "در حال ثبت…" : inbound ? "ثبت ورودی" : "ثبت خروجی"}
        </button>
      </div>
    </Modal>
  );
}
