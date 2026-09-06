/**
 * The panel half of the operation-OTP payload binding.
 *
 * This mirrors `src/operation-otp/payload-hash.ts` on the server, and the two
 * must agree exactly: the server recomputes the hash from the request it is
 * authorising and refuses the operation if it differs. A mismatch here does
 * not weaken the check — it makes every honest confirmation fail, which is
 * how operators learn to distrust the mechanism.
 *
 * `operation-otp.spec.ts` pins both sides to the same vectors, generated from
 * the server implementation.
 */

/** One value, as a string the server will agree on. */
export function canonicalValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "true" : "false";

  if (Array.isArray(value)) {
    return [...value].map(canonicalValue).sort().join(",");
  }

  const raw = String(value).trim();
  if (raw === "") return "";

  if (/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(raw)) {
    return normalizeDecimal(raw);
  }
  return raw;
}

function normalizeDecimal(raw: string): string {
  let s = raw;

  if (/[eE]/.test(s)) {
    // Expanded by hand rather than via Number(), which would round the large
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

  const [intRaw = "0", fracRaw = ""] = s.split(".");
  const int = intRaw.replace(/^0+(?=\d)/, "") || "0";
  const frac = fracRaw.replace(/0+$/, "");

  const body = frac ? `${int}.${frac}` : int;
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
  const [int = "0", frac = ""] = m.split(".");
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

export function canonicalPayload(
  scope: string,
  refKey: string,
  fields: string[],
  payload: Record<string, unknown>,
): string {
  const parts = fields.map((f) => `${f}=${canonicalValue(payload[f])}`);
  return [scope, refKey, ...parts].join("|");
}

async function sha256Hex(input: string): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    // Only reachable over plain http on a non-localhost origin. Better to say
    // so than to fail later with an opaque payload mismatch.
    throw new Error(
      "این مرورگر به WebCrypto دسترسی ندارد (پنل باید روی HTTPS یا localhost اجرا شود).",
    );
  }
  const bytes = new TextEncoder().encode(input);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPayload(
  scope: string,
  refKey: string,
  fields: string[],
  payload: Record<string, unknown>,
): Promise<string> {
  return sha256Hex(canonicalPayload(scope, refKey, fields, payload));
}

/** How `refId` / `refIds` become the key segment the server derives too. */
export async function refKeyOf(refId?: string | null, refIds?: string[] | null): Promise<string> {
  if (refIds && refIds.length > 0) {
    const digest = await sha256Hex([...refIds].sort().join(","));
    return `bulk:${digest.slice(0, 32)}`;
  }
  return refId ?? "-";
}
