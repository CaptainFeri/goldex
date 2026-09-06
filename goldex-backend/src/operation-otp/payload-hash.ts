import { createHash } from "node:crypto";

/**
 * Binding a code to the operation it approves.
 *
 * The whole value of this module is that a code issued to move 5,000,000
 * cannot be replayed to move 500,000,000. That only holds if the client and
 * the server derive *identical* strings from the same operation — so the
 * canonical form is defined here, deliberately narrowly, rather than by
 * hashing arbitrary JSON. `JSON.stringify` is not canonical: key order,
 * whitespace and number formatting all vary between producers.
 *
 * The panel mirrors these rules in `src/lib/operation-otp.ts`, and both sides
 * are tested against the same vectors.
 */

/**
 * One value, as a string both sides will agree on.
 *
 * Numbers are the dangerous case: `5000000`, `"5000000"`, `"5000000.00"` and
 * `5e6` are the same amount and must hash the same, or a perfectly honest
 * client fails verification and operators learn to distrust the whole
 * mechanism.
 */
export function canonicalValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";

  if (Array.isArray(value)) {
    // Sorted, because "the same set of ids" must hash the same however the
    // client happened to order them.
    return [...value].map(canonicalValue).sort().join(",");
  }

  const raw = String(value).trim();
  if (raw === "") return "";

  // A decimal number in any of its spellings collapses to one form.
  if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(raw)) {
    return normalizeDecimal(raw);
  }
  return raw;
}

/** `+5e6` → `5000000`; `5000000.00` → `5000000`; `-0` → `0`. */
function normalizeDecimal(raw: string): string {
  let s = raw;

  if (/[eE]/.test(s)) {
    // Expand the exponent by hand: Number() would lose precision on the large
    // rial amounts this exists to protect.
    const [mantissa, exp] = s.split(/[eE]/);
    s = shiftDecimal(mantissa, Number(exp));
  }

  let sign = "";
  if (s.startsWith("+")) s = s.slice(1);
  else if (s.startsWith("-")) {
    sign = "-";
    s = s.slice(1);
  }

  let [int = "0", frac = ""] = s.split(".");
  int = int.replace(/^0+(?=\d)/, "") || "0";
  frac = frac.replace(/0+$/, "");

  const body = frac ? `${int}.${frac}` : int;
  // No "-0": the sign on a zero is noise that would split the hash.
  return body === "0" ? "0" : `${sign}${body}`;
}

function shiftDecimal(mantissa: string, exp: number): string {
  let sign = "";
  let m = mantissa;
  if (m.startsWith("+")) m = m.slice(1);
  else if (m.startsWith("-")) {
    sign = "-";
    m = m.slice(1);
  }
  let [int = "0", frac = ""] = m.split(".");
  let digits = int + frac;
  let point = int.length + exp;

  if (point <= 0) {
    digits = "0".repeat(1 - point) + digits;
    point += 1 - point;
  } else if (point > digits.length) {
    digits += "0".repeat(point - digits.length);
  }
  const out = `${digits.slice(0, point)}.${digits.slice(point)}`.replace(/\.$/, "");
  return sign + out;
}

/**
 * The string that gets hashed.
 *
 * Field order comes from the scope descriptor, not from the object, so two
 * clients serialising the same operation cannot disagree.
 */
export function canonicalPayload(scope: string, refKey: string, fields: string[], payload: Record<string, unknown>): string {
  const parts = fields.map((f) => `${f}=${canonicalValue(payload[f])}`);
  return [scope, refKey, ...parts].join("|");
}

export function hashPayload(scope: string, refKey: string, fields: string[], payload: Record<string, unknown>): string {
  return createHash("sha256").update(canonicalPayload(scope, refKey, fields, payload), "utf8").digest("hex");
}

/** How a challenge's `refId`/`refIds` become one key segment. */
export function refKeyOf(refId?: string | null, refIds?: string[] | null): string {
  if (refIds && refIds.length > 0) {
    // Sorted and hashed: a bulk challenge covers a *set*, and the key must not
    // depend on the order the client listed them in.
    return `bulk:${createHash("sha256").update([...refIds].sort().join(","), "utf8").digest("hex").slice(0, 32)}`;
  }
  return refId ?? "-";
}
