export function fmtNum(v: number | string | null | undefined, digits = 0): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "string" ? Number(v) : v;
  if (Number.isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: digits });
}

export function fmtDate(v: string | null | undefined): string {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("fa-IR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function fmtTime(v: string): string {
  const d = new Date(v);
  return d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// A symbol may be a nested object {slug,name} or a plain string.
export function symbolLabel(s: any): string {
  if (s && typeof s === "object") return s.slug ?? s.name ?? s.code ?? "—";
  return String(s ?? "—");
}

// Pair base/quote come back as nested symbol objects (or, on some endpoints,
// flat *Code strings). Normalise to a "XAU/USD" label.
export function pairLabel(p: any): string {
  if (!p) return "—";
  const base = p.baseSymbol?.slug ?? p.baseSymbol?.name ?? p.baseCode ?? "?";
  const quote = p.quoteSymbol?.slug ?? p.quoteSymbol?.name ?? p.quoteCode ?? "?";
  return `${base}/${quote}`;
}

// Deterministic colour per provider key so a provider keeps the same hue.
const PALETTE = ["#d4af37", "#4c8dff", "#2ea861", "#e5544b", "#b06ef0", "#22b8cf", "#f08c00"];
export function colorFor(key: string): string {
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
