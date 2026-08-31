import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import TransferMatrix, { type TransferSelection } from "../components/TransferMatrix";
import { fmtNum } from "../lib/format";
import {
  GAIN_TYPES,
  SYMBOL_TYPES,
  UNIT_TYPES,
  MARKET_TYPES_ENUM,
  depositTypeLabel,
  withdrawTypeLabel,
  GATEWAY_STATUS_LABELS,
} from "../lib/enums";
import type { SymbolCapabilities, SymbolTypeCapability, GatewayOption } from "../api/types";

function toArray(x: any): any[] {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.items)) return x.items;
  if (x && Array.isArray(x.data)) return x.data;
  return [];
}

function useCapabilities() {
  return useQuery({
    queryKey: ["symbol-capabilities"],
    queryFn: async () =>
      unwrap<SymbolCapabilities>((await api.get("/admin/symbols/capabilities")).data),
    staleTime: 60_000,
  });
}

const EMPTY_SYMBOL = {
  name: "",
  slug: "",
  picPath: "",
  gain: 0,
  gainType: "number",
  symbolType: "material",
  unitType: "number",
  marketType: "formal",
  isActive: true,
};

/** Gateway name with its code, for the read-only views. */
function gatewayLabel(code: string, gateways: GatewayOption[]): string {
  const g = gateways.find((x) => x.code === code);
  return g ? `${g.name} (${code})` : code;
}

function SymbolForm({
  initial,
  capabilities,
  onClose,
}: {
  initial?: any;
  capabilities: SymbolCapabilities;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!initial?.id;

  const [form, setForm] = useState<any>(() => ({ ...EMPTY_SYMBOL, ...initial }));
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const capabilityFor = (symbolType: string): SymbolTypeCapability | undefined =>
    capabilities.symbolTypes.find((c) => c.symbolType === symbolType);

  const capability = useMemo(() => capabilityFor(form.symbolType), [capabilities, form.symbolType]);

  const defaultsFor = (
    symbolType: string,
    direction: "deposit" | "withdraw",
  ): TransferSelection => {
    const c = capabilityFor(symbolType);
    const types = (direction === "deposit" ? c?.defaultDepositTypes : c?.defaultWithdrawTypes) ?? [];
    const gateways =
      (direction === "deposit" ? c?.defaultDepositGateways : c?.defaultWithdrawGateways) ?? [];
    return { types: [...types], gateways: [...gateways], defaultGateway: gateways[0] ?? "" };
  };

  // Editing keeps the symbol's stored configuration; a new symbol starts from
  // the defaults of its type.
  const [deposit, setDeposit] = useState<TransferSelection>(() =>
    editing
      ? {
          types: initial?.depositTypes ?? [],
          gateways: initial?.depositGateways ?? [],
          defaultGateway: initial?.defaultDepositGateway ?? "",
        }
      : defaultsFor(EMPTY_SYMBOL.symbolType, "deposit"),
  );
  const [withdraw, setWithdraw] = useState<TransferSelection>(() =>
    editing
      ? {
          types: initial?.withdrawTypes ?? [],
          gateways: initial?.withdrawGateways ?? [],
          defaultGateway: initial?.defaultWithdrawGateway ?? "",
        }
      : defaultsFor(EMPTY_SYMBOL.symbolType, "withdraw"),
  );

  // Changing the type invalidates the current selection — the allowed types
  // differ — so re-seed from the new type's defaults.
  function changeSymbolType(symbolType: string) {
    set("symbolType", symbolType);
    setDeposit(defaultsFor(symbolType, "deposit"));
    setWithdraw(defaultsFor(symbolType, "withdraw"));
  }

  const save = useMutation({
    mutationFn: (body: any) =>
      editing ? api.patch(`/admin/symbols/${initial.id}`, body) : api.post("/admin/symbols", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["symbols"] });
      onClose();
    },
  });

  // hasPaymentGateway is not a separate decision any more: a symbol has a
  // gateway exactly when one of its selected types needs one.
  const hasPaymentGateway = deposit.gateways.length > 0 || withdraw.gateways.length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate({
      name: form.name,
      slug: form.slug,
      picPath: form.picPath || "/icons/default.png",
      gain: Number(form.gain) || 0,
      gainType: form.gainType,
      symbolType: form.symbolType,
      unitType: form.unitType,
      marketType: form.marketType,
      isActive: !!form.isActive,
      hasPaymentGateway,
      depositTypes: deposit.types,
      withdrawTypes: withdraw.types,
      depositGateways: deposit.gateways,
      withdrawGateways: withdraw.gateways,
      defaultDepositGateway: deposit.defaultGateway || undefined,
      defaultWithdrawGateway: withdraw.defaultGateway || undefined,
    });
  }

  return (
    <Modal wide title={editing ? "ویرایش نماد" : "افزودن نماد"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grid grid-2">
          <div className="field">
            <label>نام</label>
            <input className="input" value={form.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="field">
            <label>اسلاگ (مثل XAU)</label>
            <input
              className="input mono"
              dir="ltr"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label>نوع نماد</label>
            <select className="select" value={form.symbolType} onChange={(e) => changeSymbolType(e.target.value)}>
              {SYMBOL_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>نوع بازار</label>
            <select className="select" value={form.marketType} onChange={(e) => set("marketType", e.target.value)}>
              {MARKET_TYPES_ENUM.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>واحد</label>
            <select className="select" value={form.unitType} onChange={(e) => set("unitType", e.target.value)}>
              {UNIT_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>سود (gain)</label>
            <input className="input mono" dir="ltr" value={form.gain} onChange={(e) => set("gain", e.target.value)} />
          </div>
          <div className="field">
            <label>نوع سود</label>
            <select className="select" value={form.gainType} onChange={(e) => set("gainType", e.target.value)}>
              {GAIN_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label>مسیر آیکون</label>
            <input
              className="input mono"
              dir="ltr"
              value={form.picPath}
              onChange={(e) => set("picPath", e.target.value)}
              placeholder="/icons/xau.png"
            />
          </div>
        </div>

        <div className="grid grid-2" style={{ margin: "12px 0" }}>
          <TransferMatrix
            title="واریز"
            options={capability?.depositTypes ?? []}
            gateways={capabilities.gateways}
            eligibleGateways={capability?.eligibleGateways ?? []}
            value={deposit}
            onChange={setDeposit}
            registryAvailable={capabilities.gatewayRegistryAvailable}
            typeLabel={depositTypeLabel}
          />
          <TransferMatrix
            title="برداشت"
            options={capability?.withdrawTypes ?? []}
            gateways={capabilities.gateways}
            eligibleGateways={capability?.eligibleGateways ?? []}
            value={withdraw}
            onChange={setWithdraw}
            registryAvailable={capabilities.gatewayRegistryAvailable}
            typeLabel={withdrawTypeLabel}
          />
        </div>

        <div className="row" style={{ gap: 20, margin: "4px 0 16px", flexWrap: "wrap" }}>
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={form.isActive} onChange={(e) => set("isActive", e.target.checked)} />
            فعال
          </label>
          <span className="muted" style={{ fontSize: 12 }}>
            درگاه پرداخت:{" "}
            {hasPaymentGateway ? <Badge kind="green">دارد</Badge> : <Badge kind="gray">ندارد</Badge>}{" "}
            — از روی نوع واریز/برداشت انتخاب‌شده تعیین می‌شود.
          </span>
        </div>

        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={save.isPending}>
            {save.isPending ? <span className="spin" /> : "ذخیره"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

const SYMBOL_TYPE_OPTIONS = [{ value: "", label: "همه انواع" }, ...SYMBOL_TYPES];

/** Deposit/withdraw shown as type → gateway, not two comma-joined lists. */
function TransferSummary({
  types,
  gateways,
  defaultGateway,
  gatewayBound,
  label,
  registry,
}: {
  types?: string[];
  gateways?: string[];
  defaultGateway?: string | null;
  gatewayBound: (t: string) => boolean;
  label: (t: string) => string;
  registry: GatewayOption[];
}) {
  if (!types?.length) return <span className="muted">—</span>;
  return (
    <div style={{ display: "grid", gap: 3 }}>
      {types.map((t) => (
        <div key={t} style={{ fontSize: 12 }}>
          {label(t)}
          {gatewayBound(t) && (
            <span className="muted">
              {" → "}
              {gateways?.length
                ? gateways
                    .map((g) => gatewayLabel(g, registry) + (g === defaultGateway ? " ★" : ""))
                    .join("، ")
                : "بدون درگاه"}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function DetailsModal({
  id,
  capabilities,
  onClose,
}: {
  id: string;
  capabilities: SymbolCapabilities;
  onClose: () => void;
}) {
  const q = useQuery({
    queryKey: ["symbol-detail", id],
    queryFn: async () => unwrap<any>((await api.get(`/admin/symbols/${id}`)).data),
  });
  const s = q.data;
  const capability = capabilities.symbolTypes.find((c) => c.symbolType === s?.symbolType);
  const depositBound = (t: string) =>
    !!capability?.depositTypes.find((o) => o.value === t)?.gatewayBound;
  const withdrawBound = (t: string) =>
    !!capability?.withdrawTypes.find((o) => o.value === t)?.gatewayBound;

  return (
    <Modal title="جزئیات نماد" onClose={onClose}>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={apiError(q.error)} />
      ) : s ? (
        <div className="kv">
          <span className="k">شناسه</span>
          <span className="mono" style={{ fontSize: 12 }}>{s.id}</span>
          <span className="k">نام</span>
          <span>{s.name ?? "—"}</span>
          <span className="k">اسلاگ</span>
          <span className="mono">{s.slug ?? "—"}</span>
          <span className="k">نوع</span>
          <span>{SYMBOL_TYPES.find((o) => o.value === s.symbolType)?.label ?? s.symbolType ?? "—"}</span>
          <span className="k">بازار</span>
          <span>{s.marketType === "informal" ? "غیررسمی" : "رسمی"}</span>
          <span className="k">واحد</span>
          <span>{UNIT_TYPES.find((o) => o.value === s.unitType)?.label ?? s.unitType ?? "—"}</span>
          <span className="k">وضعیت</span>
          <span>{s.isActive ? <Badge kind="green">فعال</Badge> : <Badge kind="gray">غیرفعال</Badge>}</span>
          <span className="k">سود (gain)</span>
          <span className="mono">{fmtNum(s.gain, 4)}</span>
          <span className="k">نوع سود</span>
          <span>{GAIN_TYPES.find((o) => o.value === s.gainType)?.label ?? s.gainType ?? "—"}</span>
          <span className="k">مسیر آیکون</span>
          <span className="mono">{s.picPath || "—"}</span>
          <span className="k">درگاه پرداخت</span>
          <span>{s.hasPaymentGateway ? <Badge kind="green">دارد</Badge> : <Badge kind="gray">ندارد</Badge>}</span>
          <span className="k">واریز</span>
          <TransferSummary
            types={s.depositTypes}
            gateways={s.depositGateways}
            defaultGateway={s.defaultDepositGateway}
            gatewayBound={depositBound}
            label={depositTypeLabel}
            registry={capabilities.gateways}
          />
          <span className="k">برداشت</span>
          <TransferSummary
            types={s.withdrawTypes}
            gateways={s.withdrawGateways}
            defaultGateway={s.defaultWithdrawGateway}
            gatewayBound={withdrawBound}
            label={withdrawTypeLabel}
            registry={capabilities.gateways}
          />
        </div>
      ) : null}
    </Modal>
  );
}

export default function SymbolsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");

  const caps = useCapabilities();
  const list = useQuery({
    queryKey: ["symbols"],
    queryFn: async () => unwrap<any>((await api.get("/admin/symbols/active")).data),
  });
  const toggle = useMutation({
    mutationFn: (p: { id: string; isActive: boolean }) =>
      api.patch(`/admin/symbols/${p.id}/status`, { isActive: p.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["symbols"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/symbols/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["symbols"] }),
  });

  const capabilities = caps.data;
  let symbols = toArray(list.data);
  if (filterType) symbols = symbols.filter((s) => s.symbolType === filterType);

  const boundFor = (symbolType: string, direction: "deposit" | "withdraw") => (t: string) => {
    const c = capabilities?.symbolTypes.find((x) => x.symbolType === symbolType);
    const opts = direction === "deposit" ? c?.depositTypes : c?.withdrawTypes;
    return !!opts?.find((o) => o.value === t)?.gatewayBound;
  };

  const downGateways = (capabilities?.gateways ?? []).filter((g) => g.status === "down");

  return (
    <Card
      title="نمادها"
      action={
        <div className="row" style={{ gap: 8 }}>
          <select
            className="select"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ minWidth: 130 }}
          >
            {SYMBOL_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button
            className="btn primary sm"
            disabled={!capabilities}
            onClick={() => setForm({ open: true })}
          >
            + افزودن نماد
          </button>
        </div>
      }
    >
      {caps.isError && (
        <div className="error-text">
          دریافت تنظیمات نمادها ناموفق بود: {apiError(caps.error)}
        </div>
      )}
      {capabilities && !capabilities.gatewayRegistryAvailable && (
        <div className="error-text">
          goldex-cbp در دسترس نیست؛ فهرست درگاه‌ها ممکن است کامل نباشد.
          {capabilities.gatewayRegistryError ? ` (${capabilities.gatewayRegistryError})` : ""}
        </div>
      )}
      {downGateways.length > 0 && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          درگاه‌های خارج از دسترس:{" "}
          {downGateways.map((g) => `${g.name} (${GATEWAY_STATUS_LABELS[g.status!]?.label ?? g.status})`).join("، ")}
        </div>
      )}
      {(toggle.isError || remove.isError) && (
        <div className="error-text">{apiError(toggle.error || remove.error)}</div>
      )}

      {list.isLoading || caps.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={apiError(list.error)} />
      ) : symbols.length === 0 ? (
        <Empty />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>نام</th>
                <th>اسلاگ</th>
                <th>نوع</th>
                <th>بازار</th>
                <th>واحد</th>
                <th>وضعیت</th>
                <th>واریز</th>
                <th>برداشت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {symbols.map((s) => (
                <tr key={s.id}>
                  <td>{s.name ?? "—"}</td>
                  <td className="mono">{s.slug ?? "—"}</td>
                  <td>{SYMBOL_TYPES.find((o) => o.value === s.symbolType)?.label ?? s.symbolType ?? "—"}</td>
                  <td>
                    {s.marketType === "informal" ? (
                      <Badge kind="gold">غیررسمی</Badge>
                    ) : (
                      <Badge kind="green">رسمی</Badge>
                    )}
                  </td>
                  <td>{UNIT_TYPES.find((o) => o.value === s.unitType)?.label ?? s.unitType ?? "—"}</td>
                  <td>{s.isActive ? <Badge kind="green">فعال</Badge> : <Badge kind="gray">غیرفعال</Badge>}</td>
                  <td style={{ whiteSpace: "normal", minWidth: 170 }}>
                    <TransferSummary
                      types={s.depositTypes}
                      gateways={s.depositGateways}
                      defaultGateway={s.defaultDepositGateway}
                      gatewayBound={boundFor(s.symbolType, "deposit")}
                      label={depositTypeLabel}
                      registry={capabilities?.gateways ?? []}
                    />
                  </td>
                  <td style={{ whiteSpace: "normal", minWidth: 170 }}>
                    <TransferSummary
                      types={s.withdrawTypes}
                      gateways={s.withdrawGateways}
                      defaultGateway={s.defaultWithdrawGateway}
                      gatewayBound={boundFor(s.symbolType, "withdraw")}
                      label={withdrawTypeLabel}
                      registry={capabilities?.gateways ?? []}
                    />
                  </td>
                  <td>
                    <div className="row">
                      <button className="btn sm" onClick={() => setDetailId(s.id)}>جزئیات</button>
                      <button
                        className="btn sm"
                        disabled={!capabilities}
                        onClick={() => setForm({ open: true, initial: s })}
                      >
                        ویرایش
                      </button>
                      <button
                        className="btn sm"
                        disabled={toggle.isPending}
                        onClick={() => toggle.mutate({ id: s.id, isActive: !s.isActive })}
                      >
                        {s.isActive ? "غیرفعال" : "فعال"}
                      </button>
                      <button
                        className="btn sm danger"
                        disabled={remove.isPending}
                        onClick={() => window.confirm("حذف نماد؟") && remove.mutate(s.id)}
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailId && capabilities && (
        <DetailsModal id={detailId} capabilities={capabilities} onClose={() => setDetailId(null)} />
      )}
      {form.open && capabilities && (
        <SymbolForm
          initial={form.initial}
          capabilities={capabilities}
          onClose={() => setForm({ open: false })}
        />
      )}
    </Card>
  );
}
