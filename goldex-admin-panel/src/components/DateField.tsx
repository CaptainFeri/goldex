import type { CSSProperties } from "react";
import DatePickerModule from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import TimePicker from "react-multi-date-picker/plugins/time_picker";
import { fromWireDate, toWireDate, type DateFieldMode } from "../lib/dates";

// The package ships both a default and a namespace export depending on the
// bundler's interop; ui-parszargar unwraps it the same way.
const DatePicker = (DatePickerModule as any).default ?? DatePickerModule;

/**
 * A date field that shows a Persian calendar and speaks Gregorian.
 *
 * The panel displays Jalali and sends Gregorian, exactly as it displays toman
 * and sends rial. `value` and `onChange` carry the same
 * `YYYY-MM-DD` / `YYYY-MM-DDTHH:mm` strings a native `<input type="date">`
 * carried, so swapping one for this changes nothing a caller or an API sees —
 * only the glyphs an operator reads.
 *
 * That is why the conversion lives in `lib/dates` behind its own tests rather
 * than inline here: getting it wrong shifts a picked day by one, which is
 * invisible until someone reconciles a report against the database.
 */
export default function DateField({
  value,
  onChange,
  mode = "date",
  placeholder,
  required,
  disabled,
  style,
  className = "input",
}: {
  /** Gregorian wire string, or "" when empty. */
  value: string;
  /** Receives the same wire shape; "" when the field is cleared. */
  onChange: (wire: string) => void;
  mode?: DateFieldMode;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  style?: CSSProperties;
  className?: string;
}) {
  return (
    <DatePicker
      calendar={persian}
      locale={persian_fa}
      value={fromWireDate(value)}
      onChange={(picked: unknown) => onChange(toWireDate(picked, mode))}
      format={mode === "datetime" ? "YYYY/MM/DD HH:mm" : "YYYY/MM/DD"}
      // Time is a plugin in v4, not a prop — a `timePicker` prop would be
      // silently ignored and the field would quietly drop the time.
      plugins={mode === "datetime" ? [<TimePicker key="time" position="bottom" hideSeconds />] : []}
      inputClass={className}
      containerClassName="datefield"
      calendarPosition="bottom-right"
      editable={false}
      inputMode="none"
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      style={style}
    />
  );
}
