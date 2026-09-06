import { fmtNum } from "./format";
import type { EmRequestType, EmStatus } from "../api/types";

export const EM_STATUS_LABELS: Record<EmStatus, string> = {
  awaiting_account: "در انتظار دریافت حساب",
  awaiting_receipt: "در انتظار دریافت فیش",
  receipt_paid: "فیش پرداخت‌شده",
  rejected: "رد شده",
  closed: "بسته‌شده",
};

export const EM_STATUS_KINDS: Record<EmStatus, "gold" | "blue" | "green" | "red" | "gray"> = {
  awaiting_account: "gold",
  awaiting_receipt: "blue",
  receipt_paid: "green",
  rejected: "red",
  closed: "gray",
};

export const EM_TYPE_LABELS: Record<EmRequestType, string> = {
  withdraw: "برداشت",
  deposit: "واریز",
  settlement: "تسویه",
  transfer: "انتقال",
};

/**
 * Time left until a deadline, from a timestamp.
 *
 * The server sends `expiresAt` rather than a rendered string precisely so this
 * can be recomputed: a pre-rendered "۳ ساعت" is wrong the moment a tab is left
 * open, and the EM desk leaves tabs open.
 */
export function timeLeft(expiresAt: string | null, now: Date = new Date()): string {
  if (!expiresAt) return "—";
  const ms = new Date(expiresAt).getTime() - now.getTime();
  if (!Number.isFinite(ms)) return "—";
  if (ms <= 0) return "منقضی شده";

  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  // Persian digits, like every other number on the screen — a Latin countdown
  // in a Persian table reads as a different kind of value.
  if (days > 0) return `${fmtNum(days)} روز و ${fmtNum(hours)} ساعت`;
  if (hours > 0) return `${fmtNum(hours)} ساعت و ${fmtNum(mins)} دقیقه`;
  // Under a minute still reads as a minute rather than "0", so a row about to
  // expire does not look already dead.
  return `${fmtNum(Math.max(1, mins))} دقیقه`;
}
