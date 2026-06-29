export function Spinner({ light = false }) {
  return <div className={`spinner ${light ? 'light' : ''}`} />
}

export function Alert({ type = 'error', children }) {
  return <div className={`alert alert-${type}`}>{children}</div>
}

export function GoldexLogo({ size = 'md' }) {
  const scale = size === 'sm' ? 0.7 : 1
  return (
    <svg
      width={38 * scale}
      height={38 * scale}
      viewBox="0 0 38 38"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="brand-logo-mark"
    >
      <rect width="38" height="38" rx="10" fill="url(#goldGrad)" />
      <path d="M19 8L26 15.5V22.5L19 30L12 22.5V15.5L19 8Z" stroke="#0d0c0a" strokeWidth="1.5" fill="none" />
      <circle cx="19" cy="19" r="4" fill="#0d0c0a" opacity="0.6" />
      <path d="M19 12V26M12 19H26" stroke="#0d0c0a" strokeWidth="1" opacity="0.4" />
      <defs>
        <linearGradient id="goldGrad" x1="0" y1="0" x2="38" y2="38">
          <stop stopColor="#e8c96a" />
          <stop offset="1" stopColor="#b8892a" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function BrandHeader() {
  return (
    <div className="brand-logo">
      <GoldexLogo />
      <span className="brand-name">Goldex</span>
    </div>
  )
}

import { useTheme } from '../context/ThemeContext'

export function ThemeToggle({ className = '' }) {
  const { theme, toggleTheme } = useTheme()
  const isLight = theme === 'light'
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      onClick={toggleTheme}
      aria-label="Toggle light/dark theme"
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
    >
      <span className={`theme-toggle-track ${isLight ? 'is-light' : ''}`}>
        <span className="theme-toggle-thumb">{isLight ? '☀' : '☾'}</span>
      </span>
    </button>
  )
}

export function Button({ children, loading = false, variant = 'primary', className = '', disabled, ...rest }) {
  return (
    <button
      className={`btn btn-${variant} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner light={variant !== 'primary'} /> : children}
    </button>
  )
}

export function Field({ label, children, hint }) {
  return (
    <div className="form-group">
      {label && <label className="form-label">{label}</label>}
      {children}
      {hint && <div className="field-hint">{hint}</div>}
    </div>
  )
}

export function TextField({ label, hint, ...rest }) {
  return (
    <Field label={label} hint={hint}>
      <input className="form-input" {...rest} />
    </Field>
  )
}

export function SelectField({ label, hint, options = [], placeholder, ...rest }) {
  return (
    <Field label={label} hint={hint}>
      <select className="form-input" {...rest}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </Field>
  )
}

export function StepIndicator({ total, current }) {
  return (
    <div className="steps">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={`step-dot ${i === current ? 'active' : i < current ? 'done' : ''}`}
        />
      ))}
    </div>
  )
}

export function OtpInputs({ value, onChange, length = 5 }) {
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length)

  const handleKey = (e, idx) => {
    const inputs = e.currentTarget.parentElement.querySelectorAll('.otp-input')
    if (e.key === 'Backspace') {
      const next = digits.map((d, i) => i === idx ? '' : d).join('')
      onChange(next)
      if (idx > 0 && !digits[idx]) inputs[idx - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputs[idx - 1]?.focus()
    } else if (e.key === 'ArrowRight' && idx < length - 1) {
      inputs[idx + 1]?.focus()
    }
  }

  const handleChange = (e, idx) => {
    const char = e.target.value.replace(/\D/g, '').slice(-1)
    const next = digits.map((d, i) => i === idx ? char : d).join('')
    onChange(next)
    if (char && idx < length - 1) {
      const inputs = e.currentTarget.parentElement.querySelectorAll('.otp-input')
      inputs[idx + 1]?.focus()
    }
  }

  const handlePaste = (e) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    onChange(pasted.padEnd(length, '').slice(0, length))
  }

  return (
    <div className="otp-inputs">
      {digits.map((d, i) => (
        <input
          key={i}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={(e) => handleChange(e, i)}
          onKeyDown={(e) => handleKey(e, i)}
          onPaste={handlePaste}
          className={`otp-input ${d ? 'filled' : ''}`}
          autoFocus={i === 0}
        />
      ))}
    </div>
  )
}
