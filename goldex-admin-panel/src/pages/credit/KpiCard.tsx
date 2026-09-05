// The single source of truth for "status tone → color", shared by KPI cards
// and the credit charts so a given state (e.g. risk=red) always reads as the
// same color everywhere on the page, matching the Badge kind colors already
// used throughout this module.
export function toneColor(tone: string): string {
  return tone === "red" ? "var(--red)"
    : tone === "gold" ? "var(--gold)"
    : tone === "green" ? "var(--green)"
    : tone === "blue" ? "#3b82f6"
    : "var(--text-muted)";
}

export function KpiCard({ label, value, tone, currency }: { label: string; value: any; tone: string; currency?: boolean }) {
  const color = toneColor(tone);
  return (
    <div className="card" style={{ padding: "12px 14px", borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, direction: "ltr", textAlign: "right" }}>
        {Number(value ?? 0).toLocaleString("fa-IR")}{currency ? " ریال" : ""}
      </div>
    </div>
  );
}
