/**
 * Conversion at the date-picker boundary.
 *
 * The panel **displays** Jalali and **sends** Gregorian, exactly as it displays
 * toman and sends rial. Every call site already keeps its value as the string a
 * native `<input type="date">` produced — `YYYY-MM-DD`, or
 * `YYYY-MM-DDTHH:mm` for a datetime — and passes that to the API. Swapping the
 * input for a Persian calendar must not change any of that: only the glyphs an
 * operator reads change.
 *
 * So these functions convert between that Gregorian wire string and the
 * picker's own date object, and nothing else in the panel needs to know a
 * Jalali calendar is involved.
 */

/** The wire shape a field carries: date only, or date and time. */
export type DateFieldMode = "date" | "datetime";

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A picker value → the Gregorian string the API expects.
 *
 * Built from the object's own Gregorian parts rather than `toISOString()`,
 * which would shift the day backwards for any timezone east of UTC — Tehran
 * included. A date an operator picked must not arrive as the day before.
 */
export function toWireDate(value: unknown, mode: DateFieldMode = "date"): string {
  const d = toJsDate(value);
  if (!d) return "";
  const day = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return mode === "datetime" ? `${day}T${pad(d.getHours())}:${pad(d.getMinutes())}` : day;
}

/**
 * A Gregorian wire string → a JS date the picker can show.
 *
 * Parsed as local time, not UTC: `new Date("2026-09-05")` is midnight UTC and
 * renders as the 4th in a negative offset, which is the same off-by-one in the
 * other direction.
 */
export function fromWireDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(value);
  if (!m) {
    const loose = new Date(value);
    return Number.isNaN(loose.getTime()) ? null : loose;
  }
  const [, y, mo, d, h = "0", mi = "0"] = m;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
}

/** Normalise whatever the picker hands back — DateObject, Date, or null. */
function toJsDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const maybe = value as { toDate?: () => Date; isValid?: boolean };
  if (typeof maybe.toDate === "function") {
    if (maybe.isValid === false) return null;
    const d = maybe.toDate();
    return d && !Number.isNaN(d.getTime()) ? d : null;
  }
  return null;
}
