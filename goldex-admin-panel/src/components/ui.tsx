import { ReactNode } from "react";

export function Card({
  title,
  action,
  children,
  style,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div className="card" style={style}>
      {(title || action) && (
        <div className="card-title">
          <span>{title}</span>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value mono">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

export function Badge({ kind, children }: { kind: "green" | "red" | "gold" | "gray" | "blue"; children: ReactNode }) {
  // Defensive: several backend payloads nest symbol as an object — never let an
  // object child crash the whole page, coerce to a readable label.
  const safe =
    children && typeof children === "object" && !Array.isArray(children) && !("$$typeof" in (children as any))
      ? (children as any).slug ?? (children as any).name ?? (children as any).code ?? "—"
      : children;
  return <span className={`badge ${kind}`}>{safe}</span>;
}

export function Loading({ label = "در حال بارگذاری…" }: { label?: string }) {
  return (
    <div className="center-state">
      <span className="spin" /> <span style={{ marginInlineStart: 10 }}>{label}</span>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return <div className="center-state" style={{ color: "#f0857d" }}>⚠ {message}</div>;
}

export function Empty({ label = "داده‌ای موجود نیست" }: { label?: string }) {
  return <div className="center-state">{label}</div>;
}

export function Modal({
  title,
  onClose,
  children,
  wide,
}: {
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: wide ? 760 : 520 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="btn ghost sm" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
