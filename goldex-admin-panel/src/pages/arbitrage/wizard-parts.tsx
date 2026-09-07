import { ReactNode, useMemo, useState } from "react";

/** Toggles one value in a list, leaving the caller's array untouched. */
export function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

export interface PickerOption {
  value: string;
  label: string;
  /** Rendered on the trailing side — a price, a status, a count. */
  meta?: ReactNode;
  /** Extra text the search box should match. */
  keywords?: string;
}

/**
 * A searchable multi-select list.
 *
 * Every scope list on a bot means "no restriction" when empty, which is the
 * opposite of how an empty selection usually reads — so the count line says so
 * in words rather than leaving the operator to infer it from an empty box.
 */
export function Picker({
  options,
  selected,
  onChange,
  placeholder = "جستجو…",
  emptyMeansAll = true,
  emptyLabel = "موردی برای انتخاب نیست",
  loading,
  height,
}: {
  options: PickerOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  emptyMeansAll?: boolean;
  emptyLabel?: string;
  loading?: boolean;
  height?: number;
}) {
  const [term, setTerm] = useState("");

  const visible = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        o.value.toLowerCase().includes(q) ||
        (o.keywords ?? "").toLowerCase().includes(q),
    );
  }, [options, term]);

  const allVisibleSelected =
    visible.length > 0 && visible.every((o) => selected.includes(o.value));

  // Selections this list can actually render, versus ones it cannot.
  const known = selected.filter((v) => options.some((o) => o.value === v)).length;
  const offList = selected.length - known;

  return (
    <div className="picker">
      <div className="picker-head">
        <input
          className="input"
          style={{ flex: 1, minWidth: 140 }}
          placeholder={placeholder}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <button
          type="button"
          className="btn ghost sm"
          disabled={visible.length === 0}
          onClick={() =>
            onChange(
              allVisibleSelected
                ? selected.filter((v) => !visible.some((o) => o.value === v))
                : [...new Set([...selected, ...visible.map((o) => o.value)])],
            )
          }
        >
          {allVisibleSelected ? "برداشتن همه" : "انتخاب همه"}
        </button>
        {selected.length > 0 && (
          <button type="button" className="btn ghost sm" onClick={() => onChange([])}>
            پاک کردن ({selected.length})
          </button>
        )}
      </div>

      <div className="picker-list" style={height ? { maxHeight: height } : undefined}>
        {loading ? (
          <div className="picker-empty">
            <span className="spin" />
          </div>
        ) : visible.length === 0 ? (
          <div className="picker-empty">{options.length === 0 ? emptyLabel : "چیزی پیدا نشد"}</div>
        ) : (
          visible.map((o) => {
            const on = selected.includes(o.value);
            return (
              <label key={o.value} className={"picker-row" + (on ? " selected" : "")}>
                <input type="checkbox" checked={on} onChange={() => onChange(toggle(selected, o.value))} />
                <span className="grow">{o.label}</span>
                {o.meta && <span className="muted mono" style={{ fontSize: 11 }}>{o.meta}</span>}
              </label>
            );
          })
        )}
      </div>

      <div className="picker-head" style={{ borderBottom: "none", borderTop: "1px solid var(--border-soft)" }}>
        <span className="muted" style={{ fontSize: 11 }}>
          {selected.length === 0
            ? emptyMeansAll
              ? "بدون محدودیت — همه موارد رصد می‌شوند"
              : "چیزی انتخاب نشده"
            : `${known} مورد انتخاب شده از ${options.length}`}
          {offList > 0 && (
            // A selection this list cannot show is still a selection. Saying so
            // is what stops the count from quietly contradicting the checkboxes
            // — it happens whenever a saved bot is edited while browsing a
            // different provider's items.
            <span style={{ color: "var(--gold-soft)" }}>
              {" "}
              + {offList} مورد خارج از این فهرست
            </span>
          )}
        </span>
      </div>
    </div>
  );
}

/** The selected values echoed back, each removable. */
export function Chips({
  values,
  labelOf,
  onRemove,
}: {
  values: string[];
  labelOf: (value: string) => string;
  onRemove: (value: string) => void;
}) {
  if (values.length === 0) return null;
  return (
    <div className="chips">
      {values.map((v) => (
        <span key={v} className="chip">
          {labelOf(v)}
          <button type="button" onClick={() => onRemove(v)} aria-label="حذف">
            ✕
          </button>
        </span>
      ))}
    </div>
  );
}

/** A mutually-exclusive choice whose options need a sentence of explanation. */
export function OptionCards<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: { value: T; title: string; sub: string }[];
}) {
  return (
    <div className="opt-cards">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className={"opt-card" + (value === o.value ? " active" : "")}
          onClick={() => onChange(o.value)}
        >
          <div className="opt-card-title">{o.title}</div>
          <div className="opt-card-sub">{o.sub}</div>
        </button>
      ))}
    </div>
  );
}

export function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="summary-row">
      <span className="k">{label}</span>
      <span className="v">{children}</span>
    </div>
  );
}

/** A labelled number input with its unit and a line of guidance. */
export function NumField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  suffix,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (next: string) => void;
  min?: number;
  max?: number;
  step?: string;
  suffix?: string;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row" style={{ gap: 6 }}>
        <input
          className="input mono"
          dir="ltr"
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ flex: 1 }}
        />
        {suffix && <span className="muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>{suffix}</span>}
      </div>
      {hint && <span className="muted" style={{ fontSize: 11 }}>{hint}</span>}
    </div>
  );
}
