import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { authApi } from '../services/api'
import AuthBrand from '../components/AuthBrand'
import { Spinner, Alert, StepIndicator, OtpInputs, ThemeToggle } from '../components/UI'

// ─── Step 1: Enter Phone ──────────────────────────────────
function PhoneStep({ onOtpSent }) {
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (phone.length < 10) { setError('Please enter a valid phone number'); return }
    setLoading(true)
    setError('')
    try {
      await authApi.sendOtp(phone)
      onOtpSent(phone)
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to send OTP. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-up">
      <StepIndicator total={3} current={0} />
      <h2 className="auth-card-title">Welcome</h2>
      <p className="auth-card-sub">Enter your phone number to get started</p>

      {error && <Alert type="error">{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Phone Number</label>
          <div className="input-wrapper">
            <span className="input-prefix">📱</span>
            <input
              type="tel"
              className="form-input has-prefix"
              placeholder="09xxxxxxxxx"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
              maxLength={11}
              autoFocus
            />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading || phone.length < 10}>
          {loading ? <Spinner /> : 'Send Verification Code'}
        </button>
      </form>
    </div>
  )
}

// ─── Step 2: Enter OTP ────────────────────────────────────
function OtpStep({ phone, onVerified, onBack }) {
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resending, setResending] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (otp.length < 5) return
    setLoading(true)
    setError('')
    try {
      const data = await authApi.verifyOtp(phone, otp)
      onVerified(data)
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid OTP. Please try again.')
      setOtp('')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try { await authApi.sendOtp(phone) } catch (_) {}
    setResending(false)
  }

  return (
    <div className="animate-fade-up">
      <StepIndicator total={3} current={1} />
      <h2 className="auth-card-title">Verify Code</h2>
      <p className="auth-card-sub">Enter the 5-digit code sent to</p>

      <div className="phone-banner">
        <span className="phone-banner-number">{phone}</span>
        <button className="btn btn-ghost" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }} onClick={onBack}>
          Change
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <OtpInputs value={otp} onChange={setOtp} length={5} />

        <button className="btn btn-primary" type="submit" disabled={loading || otp.length < 5}>
          {loading ? <Spinner /> : 'Verify Code'}
        </button>

        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button type="button" className="btn-link" onClick={handleResend} disabled={resending}>
            {resending ? 'Resending…' : "Didn't receive it? Resend"}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 3: Register ─────────────────────────────────────
function RegisterStep({ phone, userId, tempToken, onRegistered }) {
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '' })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await authApi.completeRegistration(form, tempToken)
      onRegistered(data)
    } catch (err) {
      setError(err.response?.data?.message || 'Registration failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-up">
      <StepIndicator total={3} current={2} />
      <h2 className="auth-card-title">Create Account</h2>
      <p className="auth-card-sub">Complete your profile to start trading</p>

      {error && <Alert type="error">{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">First Name</label>
            <input className="form-input" placeholder="Ali" value={form.firstName} onChange={set('firstName')} required />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name</label>
            <input className="form-input" placeholder="Hosseini" value={form.lastName} onChange={set('lastName')} required />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input className="form-input" type="email" placeholder="ali@example.com" value={form.email} onChange={set('email')} required />
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <div className="input-wrapper">
            <input
              className="form-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Min 8 chars, 1 uppercase, 1 symbol"
              value={form.password}
              onChange={set('password')}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem', padding: 0 }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <Spinner /> : 'Create Account'}
        </button>
      </form>
    </div>
  )
}

// ─── Login Form ───────────────────────────────────────────
function LoginForm({ onSuccess, onSwitchToRegister }) {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await authApi.login(phone, password)
      onSuccess(data)
    } catch (err) {
      setError(err.response?.data?.message || 'Invalid credentials. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-up">
      <h2 className="auth-card-title">Sign In</h2>
      <p className="auth-card-sub">Welcome back to Goldex</p>

      {error && <Alert type="error">{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">Phone Number</label>
          <div className="input-wrapper">
            <span className="input-prefix">📱</span>
            <input
              type="tel"
              className="form-input has-prefix"
              placeholder="09xxxxxxxxx"
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
              maxLength={11}
              autoFocus
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Password</label>
          <div className="input-wrapper">
            <input
              className="form-input"
              type={showPassword ? 'text' : 'password'}
              placeholder="Your password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              style={{ position: 'absolute', right: '0.85rem', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem', padding: 0 }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'right', marginTop: '-0.5rem', marginBottom: '1rem' }}>
          <Link className="btn-link" to="/forgot-password">Forgot password?</Link>
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <Spinner /> : 'Sign In'}
        </button>
      </form>

      <div className="divider">or</div>

      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>New to Goldex? </span>
        <button className="btn-link" onClick={onSwitchToRegister}>Create an account</button>
      </div>
    </div>
  )
}

// ─── Main Auth Page ───────────────────────────────────────
export default function AuthPage() {
  const [mode, setMode] = useState('login') // 'login' | 'register'
  const [step, setStep] = useState('phone') // 'phone' | 'otp' | 'register'
  const [phone, setPhone] = useState('')
  const [otpData, setOtpData] = useState(null)
  const { saveTokens, saveDevice, setUser } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const handleOtpSent = (ph) => {
    setPhone(ph)
    setStep('otp')
  }

  const handleVerified = (data) => {
    setOtpData(data)
    if (data.requiresRegistration) {
      setStep('register')
    } else {
      // Already registered, shouldn't happen from OTP flow but handle gracefully
      setStep('register')
    }
  }

  const handleRegistered = () => {
    // Registration does not log the user in — send them to sign in with their
    // new phone + password.
    toast.success('Account created. Please sign in to continue.')
    switchToLogin()
  }

  const handleLoginSuccess = (data) => {
    saveTokens(data.access_token, data.refresh_token)
    if (data.currentDevice?.deviceId) {
      saveDevice(data.currentDevice.deviceId)
    }
    // User info might come from /auth/auth check, set basic info from login
    setUser({ phone, ...data })
    navigate('/profile')
  }

  const switchToRegister = () => {
    setMode('register')
    setStep('phone')
  }

  const switchToLogin = () => {
    setMode('login')
    setStep('phone')
    setPhone('')
    setOtpData(null)
  }

  const renderContent = () => {
    if (mode === 'login') {
      return <LoginForm onSuccess={handleLoginSuccess} onSwitchToRegister={switchToRegister} />
    }

    if (step === 'phone') {
      return (
        <>
          <PhoneStep onOtpSent={handleOtpSent} />
          <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Already have an account? </span>
            <button className="btn-link" onClick={switchToLogin}>Sign in</button>
          </div>
        </>
      )
    }

    if (step === 'otp') {
      return <OtpStep phone={phone} onVerified={handleVerified} onBack={() => setStep('phone')} />
    }

    if (step === 'register') {
      return (
        <RegisterStep
          phone={phone}
          userId={otpData?.userId}
          tempToken={otpData?.temporaryToken}
          onRegistered={handleRegistered}
        />
      )
    }
  }

  return (
    <div className="auth-shell">
      <ThemeToggle className="theme-toggle-fixed" />
      <AuthBrand />
      <div className="auth-panel">
        <div className="auth-card">
          {renderContent()}
        </div>
      </div>
    </div>
  )
}
