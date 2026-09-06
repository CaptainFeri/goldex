/**
 * What may be written into the audit log.
 *
 * The log records request bodies, and those bodies carry OTP codes, passwords
 * and freshly minted API keys. A log holding live credentials is worse than no
 * log: it is a durable, widely-read copy of the secrets it was meant to
 * protect.
 *
 * The rule is a deny-list on key names rather than an allow-list, because the
 * log's value is in recording *what changed* — amounts, accounts, notes — and
 * an allow-list would quietly drop the fields a dispute turns on.
 */

/** Key names whose values never reach the log. */
const SECRET_KEY = /(otp|password|secret|token|api_?key|plaintext|authorization|cookie|credential|passcode)/i;

export const REDACTED = "[redacted]";

/** Bodies can be large (batch transfers, OCR payloads); the log is not a copy of them. */
const MAX_STRING = 2_000;
const MAX_ARRAY = 50;
const MAX_DEPTH = 6;

export function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value ?? null;

  if (typeof value === "string") {
    return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…[truncated]` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;

  // Dates and the like: recorded as text rather than walked as objects.
  if (value instanceof Date) return value.toISOString();

  if (depth >= MAX_DEPTH) return "[depth limit]";

  if (Array.isArray(value)) {
    const head = value.slice(0, MAX_ARRAY).map((v) => redact(v, depth + 1));
    return value.length > MAX_ARRAY ? [...head, `…${value.length - MAX_ARRAY} more`] : head;
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // The key decides, whatever the value looks like — a nested object under
      // `credentials` is redacted whole rather than walked into.
      out[k] = SECRET_KEY.test(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }

  // Functions, symbols, bigints: not something a JSON body carries.
  return String(value);
}

export function redactBody(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    const single = redact(body);
    return single === null || single === undefined ? null : { value: single };
  }
  return redact(body) as Record<string, unknown>;
}
