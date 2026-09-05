import { useState, type ReactNode } from "react";

export interface TabDef {
  key: string;
  label: string;
  badge?: number;
  content: ReactNode;
}

/** A simple tab bar so the credit detail modal shows one section at a time instead of one long scroll of everything at once. */
export function Tabs({ tabs, defaultKey }: { tabs: TabDef[]; defaultKey?: string }) {
  const [active, setActive] = useState(defaultKey ?? tabs[0]?.key);
  const current = tabs.find((t) => t.key === active) ?? tabs[0];

  return (
    <div>
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)", marginBottom: 14, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setActive(t.key)}
            style={{
              all: "unset",
              cursor: "pointer",
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: active === t.key ? "var(--gold)" : "var(--text-muted)",
              borderBottom: active === t.key ? "2px solid var(--gold)" : "2px solid transparent",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {t.label}
            {!!t.badge && (
              <span style={{ background: "var(--red)", color: "#fff", borderRadius: 999, padding: "0 6px", fontSize: 10, fontWeight: 700 }}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>{current?.content}</div>
    </div>
  );
}
