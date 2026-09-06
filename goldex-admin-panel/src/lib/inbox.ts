import type { InboxCategory, InboxItem, InboxSeverity } from "../api/types";

export const CATEGORY_LABELS: Record<InboxCategory, string> = {
  withdrawal: "برداشت",
  deposit: "واریز",
  kyc: "احراز هویت",
  arbitrage: "آربیتراژ",
  user: "کاربران",
  system: "سیستم",
};

export const CATEGORY_ICONS: Record<InboxCategory, string> = {
  withdrawal: "📤",
  deposit: "📥",
  kyc: "🪪",
  arbitrage: "⚡",
  user: "👤",
  system: "⚙️",
};

export const SEVERITY_LABELS: Record<InboxSeverity, string> = {
  info: "اطلاع",
  warning: "هشدار",
  urgent: "فوری",
};

export const SEVERITY_KINDS: Record<InboxSeverity, "gray" | "gold" | "red"> = {
  info: "gray",
  warning: "gold",
  urgent: "red",
};

/**
 * Where an item should take the operator.
 *
 * Read from `metadata.link` when the publisher supplied one. Returning null
 * rather than guessing a route keeps a wrong link from looking like a working
 * one — a dead link in an alert costs more trust than no link.
 */
export function inboxLink(item: InboxItem): string | null {
  const link = item.metadata?.link;
  if (typeof link !== "string") return null;
  // Must be an in-app path. `startsWith("/")` alone is not enough: "//host" is
  // a protocol-relative URL that leaves the panel entirely, from inside what
  // looks to the operator like a system alert.
  if (!link.startsWith("/") || link.startsWith("//")) return null;
  return link;
}

/** The rial amount an item carries, if any. Formatting is the caller's job. */
export function inboxAmount(item: InboxItem): string | null {
  const amount = item.metadata?.amount;
  if (typeof amount === "number" && Number.isFinite(amount)) return String(amount);
  if (typeof amount === "string" && amount.trim() !== "" && Number.isFinite(Number(amount))) return amount;
  return null;
}
