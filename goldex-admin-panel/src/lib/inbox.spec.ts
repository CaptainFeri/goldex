import { describe, expect, it } from "vitest";
import { inboxAmount, inboxLink, CATEGORY_LABELS, SEVERITY_KINDS } from "./inbox";
import type { InboxItem } from "../api/types";

const item = (metadata: Record<string, unknown> | null): InboxItem => ({
  id: "n1",
  event: "withdraw.created",
  category: "withdrawal",
  severity: "info",
  title: "t",
  body: "b",
  metadata,
  isRead: false,
  readAt: null,
  createAt: "2026-09-06T08:00:00.000Z",
});

describe("inboxLink", () => {
  it("returns an in-app path when the publisher supplied one", () => {
    expect(inboxLink(item({ link: "/withdraws" }))).toBe("/withdraws");
    expect(inboxLink(item({ link: "/p2p?escalation=x" }))).toBe("/p2p?escalation=x");
  });

  it("refuses anything that is not an in-app path", () => {
    // Metadata is written by publishers, and this value is fed straight to a
    // router Link. An absolute URL here would navigate an operator off the
    // panel from inside what looks like a system alert.
    expect(inboxLink(item({ link: "https://example.com/phish" }))).toBeNull();
    expect(inboxLink(item({ link: "//example.com" }))).toBeNull();
    expect(inboxLink(item({ link: "javascript:alert(1)" }))).toBeNull();
  });

  it("returns null rather than guessing when there is no link", () => {
    // A wrong link looks like a working one; no link is honest.
    expect(inboxLink(item(null))).toBeNull();
    expect(inboxLink(item({}))).toBeNull();
    expect(inboxLink(item({ link: 42 }))).toBeNull();
  });
});

describe("inboxAmount", () => {
  it("accepts a number or a numeric string", () => {
    expect(inboxAmount(item({ amount: 250000000 }))).toBe("250000000");
    expect(inboxAmount(item({ amount: "48000000" }))).toBe("48000000");
  });

  it("treats a real zero as an amount", () => {
    expect(inboxAmount(item({ amount: 0 }))).toBe("0");
  });

  it("returns null for a missing or unusable amount", () => {
    expect(inboxAmount(item(null))).toBeNull();
    expect(inboxAmount(item({}))).toBeNull();
    expect(inboxAmount(item({ amount: "لطفاً" }))).toBeNull();
    expect(inboxAmount(item({ amount: "" }))).toBeNull();
    expect(inboxAmount(item({ amount: Number.NaN }))).toBeNull();
    expect(inboxAmount(item({ amount: Number.POSITIVE_INFINITY }))).toBeNull();
  });
});

describe("category and severity maps", () => {
  it("covers every category the API can return", () => {
    // A missing key renders `undefined` in the badge rather than failing.
    for (const c of ["withdrawal", "deposit", "kyc", "arbitrage", "user", "system"] as const) {
      expect(CATEGORY_LABELS[c]).toBeTruthy();
    }
  });

  it("covers every severity, and marks urgent distinctly from info", () => {
    for (const s of ["info", "warning", "urgent"] as const) {
      expect(SEVERITY_KINDS[s]).toBeTruthy();
    }
    expect(SEVERITY_KINDS.urgent).not.toBe(SEVERITY_KINDS.info);
  });
});
