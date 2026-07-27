const PERSIAN_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
]

const DAYS = Array.from({ length: 31 }, (_, i) => i + 1)

export default function JalaliDatePicker({ value, onChange, placeholder }) {
  const parts = value ? value.split('/') : []
  const year = parts.length > 0 ? parts[0] : ''
  const month = parts.length > 1 ? parts[1] : ''
  const day = parts.length > 2 ? parts[2] : ''

  const handleYear = (e) => {
    const y = e.target.value
    onChange(y && month && day ? `${y}/${month}/${day}` : '')
  }
  const handleMonth = (e) => {
    const m = e.target.value
    onChange(year && m && day ? `${year}/${m}/${day}` : '')
  }
  const handleDay = (e) => {
    const d = e.target.value
    onChange(year && month && d ? `${year}/${month}/${d}` : '')
  }

  const currentYear = new Date().getFullYear() + 622
  const years = Array.from({ length: 10 }, (_, i) => String(currentYear - i))

  return (
    <div style={{ display: 'flex', gap: 4 }}>
      <select className="form-input" value={year} onChange={handleYear} style={{ flex: 1 }}>
        <option value="">Year</option>
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
      <select className="form-input" value={month} onChange={handleMonth} style={{ flex: 1 }}>
        <option value="">Month</option>
        {PERSIAN_MONTHS.map((m, i) => (
          <option key={i} value={String(i + 1).padStart(2, '0')}>{m}</option>
        ))}
      </select>
      <select className="form-input" value={day} onChange={handleDay} style={{ flex: 1 }}>
        <option value="">Day</option>
        {DAYS.map((d) => (
          <option key={d} value={String(d).padStart(2, '0')}>{d}</option>
        ))}
      </select>
    </div>
  )
}
