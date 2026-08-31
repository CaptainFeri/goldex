import { Badge } from "./ui";
import { GATEWAY_STATUS_LABELS } from "../lib/enums";
import type { GatewayOption, TransferTypeOption } from "../api/types";

export interface TransferSelection {
  /** Selected deposit or withdraw types. */
  types: string[];
  /** Gateway codes selectable for this direction. */
  gateways: string[];
  /** Which of `gateways` is used when the customer does not pick one. */
  defaultGateway: string;
}

function GatewayStatus({ status }: { status?: string }) {
  if (!status) return null;
  const s = GATEWAY_STATUS_LABELS[status] ?? { label: status, kind: "gray" as const };
  return <Badge kind={s.kind}>{s.label}</Badge>;
}

/**
 * One direction (deposit or withdraw) of a symbol's transfer configuration.
 *
 * Every option comes from the server's capability document, so the same
 * component renders a rial symbol, a crypto symbol and a warehouse metal —
 * there is no per-symbol-type branch. A type that needs a gateway expands in
 * place to its gateway picker.
 */
export default function TransferMatrix({
  title,
  options,
  gateways,
  eligibleGateways,
  value,
  onChange,
  registryAvailable,
  typeLabel,
}: {
  title: string;
  options: TransferTypeOption[];
  /** Full registry, for names and health. */
  gateways: GatewayOption[];
  /** Codes this symbol type may use. */
  eligibleGateways: string[];
  value: TransferSelection;
  onChange: (next: TransferSelection) => void;
  registryAvailable: boolean;
  typeLabel: (value: string) => string;
}) {
  const needsGateway = options.some((o) => o.gatewayBound && value.types.includes(o.value));

  // A gateway the symbol already carries but the registry no longer offers must
  // stay visible and selected — hiding it would silently drop it on save.
  const selectable = [...new Set([...eligibleGateways, ...value.gateways])];

  function toggleType(type: string, gatewayBound: boolean) {
    const on = value.types.includes(type);
    const types = on ? value.types.filter((t) => t !== type) : [...value.types, type];

    // Turning off the last gateway-bound type releases the gateways with it, so
    // a symbol is never left carrying gateways nothing routes through.
    const stillNeedsGateway = options.some((o) => o.gatewayBound && types.includes(o.value));
    if (!stillNeedsGateway) {
      onChange({ types, gateways: [], defaultGateway: "" });
      return;
    }

    // Turning a gateway-bound type on with nothing selected: preselect the
    // single eligible gateway when there is exactly one, so the common case
    // needs no second click.
    if (!on && gatewayBound && value.gateways.length === 0 && eligibleGateways.length === 1) {
      onChange({ types, gateways: [...eligibleGateways], defaultGateway: eligibleGateways[0] });
      return;
    }

    onChange({ ...value, types });
  }

  function toggleGateway(code: string) {
    const on = value.gateways.includes(code);
    const next = on ? value.gateways.filter((g) => g !== code) : [...value.gateways, code];
    const defaultGateway =
      value.defaultGateway && next.includes(value.defaultGateway)
        ? value.defaultGateway
        : (next[0] ?? "");
    onChange({ ...value, gateways: next, defaultGateway });
  }

  return (
    <div className="field">
      <label>{title}</label>

      <div className="checkbox-group">
        {options.length === 0 && (
          <span className="muted" style={{ fontSize: 12 }}>
            برای این نوع نماد گزینه‌ای تعریف نشده است.
          </span>
        )}
        {options.map((o) => {
          const checked = value.types.includes(o.value);
          return (
            <div key={o.value}>
              <label className="row" style={{ gap: 6, margin: "4px 0" }}>
                <input type="checkbox" checked={checked} onChange={() => toggleType(o.value, o.gatewayBound)} />
                {typeLabel(o.value)}
                {o.gatewayBound && (
                  <span className="muted" style={{ fontSize: 11 }}>
                    (نیازمند درگاه)
                  </span>
                )}
              </label>

              {checked && o.gatewayBound && (
                <div
                  style={{
                    margin: "2px 0 10px",
                    paddingInlineStart: 22,
                    borderInlineStart: "2px solid var(--border)",
                  }}
                >
                  {!registryAvailable && (
                    <div className="muted" style={{ fontSize: 11, marginBottom: 6 }}>
                      goldex-cbp در دسترس نیست؛ فهرست درگاه‌ها ممکن است کامل نباشد.
                    </div>
                  )}
                  {selectable.length === 0 ? (
                    <div style={{ fontSize: 12, color: "var(--red)" }}>
                      هیچ درگاهی برای این نوع نماد ثبت نشده است. تا زمانی که درگاهی در goldex-cbp
                      اضافه نشود، این گزینه قابل ذخیره نیست.
                    </div>
                  ) : (
                    <>
                      {selectable.map((code) => {
                        const g = gateways.find((x) => x.code === code);
                        const on = value.gateways.includes(code);
                        return (
                          <label
                            key={code}
                            className="row"
                            style={{ gap: 6, margin: "4px 0", flexWrap: "wrap" }}
                          >
                            <input type="checkbox" checked={on} onChange={() => toggleGateway(code)} />
                            <span>{g?.name ?? code}</span>
                            <span className="muted mono" style={{ fontSize: 11 }}>{code}</span>
                            <GatewayStatus status={g?.status} />
                            {!eligibleGateways.includes(code) && (
                              <Badge kind="gold">خارج از دسته مجاز</Badge>
                            )}
                          </label>
                        );
                      })}

                      <div className="field" style={{ marginTop: 8, marginBottom: 0 }}>
                        <label style={{ fontSize: 12 }}>درگاه پیش‌فرض</label>
                        <select
                          className="select"
                          value={value.defaultGateway}
                          onChange={(e) => onChange({ ...value, defaultGateway: e.target.value })}
                        >
                          <option value="">— بدون پیش‌فرض —</option>
                          {value.gateways.map((code) => (
                            <option key={code} value={code}>
                              {gateways.find((x) => x.code === code)?.name ?? code}
                            </option>
                          ))}
                        </select>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {needsGateway && value.gateways.length === 0 && selectable.length > 0 && (
        <span style={{ fontSize: 11, color: "var(--red)" }}>
          حداقل یک درگاه انتخاب کنید.
        </span>
      )}
    </div>
  );
}
