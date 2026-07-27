const PERSIAN_MONTHS = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}

export default function JalaliDatePicker({ value, onChange, placeholder }: Props) {
  const parts = value ? value.split("/") : [];
  let year = parts.length > 0 ? parts[0] : "";
  let month = parts.length > 1 ? parts[1] : "";
  let day = parts.length > 2 ? parts[2] : "";

  const handleYear = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const y = e.target.value;
    onChange(y && month && day ? `${y}/${month}/${day}` : "");
  };
  const handleMonth = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const m = e.target.value;
    onChange(year && m && day ? `${year}/${m}/${day}` : "");
  };
  const handleDay = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const d = e.target.value;
    onChange(year && month && d ? `${year}/${month}/${d}` : "");
  };

  const currentYear = new Date().getFullYear() + 622; // rough Jalali year
  const years = Array.from({ length: 10 }, (_, i) => String(currentYear - i));

  return (
    <div style={{ display: "flex", gap: 4 }}>
      <select className="input" value={year} onChange={handleYear} style={{ flex: 1 }}>
        <option value="">سال</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <select className="input" value={month} onChange={handleMonth} style={{ flex: 1 }}>
        <option value="">ماه</option>
        {PERSIAN_MONTHS.map((m, i) => (
          <option key={i} value={String(i + 1).padStart(2, "0")}>{m}</option>
        ))}
      </select>
      <select className="input" value={day} onChange={handleDay} style={{ flex: 1 }}>
        <option value="">روز</option>
        {DAYS.map((d) => (
          <option key={d} value={String(d).padStart(2, "0")}>{d}</option>
        ))}
      </select>
    </div>
  );
}
