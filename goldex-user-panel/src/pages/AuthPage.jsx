import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { authApi } from '../services/api'
import AuthBrand from '../components/AuthBrand'
import { Spinner, Alert, StepIndicator, OtpInputs, ThemeToggle } from '../components/UI'

// ─── Step 1: Enter Phone ──────────────────────────────────
function PhoneStep({ onOtpSent }) {
  const { t } = useTranslation()
  const [phone, setPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (phone.length < 10) { setError(t('auth.validPhone')); return }
    setLoading(true)
    setError('')
    try {
      await authApi.sendOtp(phone)
      onOtpSent(phone)
    } catch (err) {
      setError(err.response?.data?.message || t('auth.sendOtpFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-up">
      <StepIndicator total={3} current={0} />
      <h2 className="auth-card-title">{t('auth.welcome')}</h2>
      <p className="auth-card-sub">{t('auth.enterPhone')}</p>

      {error && <Alert type="error">{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label className="form-label">{t('auth.phoneNumber')}</label>
          <div className="input-wrapper">
            <span className="input-prefix">📱</span>
            <input
              type="tel"
              className="form-input has-prefix"
              placeholder={t('auth.phonePlaceholder')}
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
              maxLength={11}
              autoFocus
            />
          </div>
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading || phone.length < 10}>
          {loading ? <Spinner /> : t('auth.sendCode')}
        </button>
      </form>
    </div>
  )
}

// ─── Step 2: Enter OTP ────────────────────────────────────
function OtpStep({ phone, onVerified, onBack }) {
  const { t } = useTranslation()
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
      setError(err.response?.data?.message || t('auth.invalidOtp'))
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
      <h2 className="auth-card-title">{t('auth.verifyCode')}</h2>
      <p className="auth-card-sub">{t('auth.enterOtp')}</p>

      <div className="phone-banner">
        <span className="phone-banner-number">{phone}</span>
        <button className="btn btn-ghost" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }} onClick={onBack}>
          {t('auth.change')}
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <OtpInputs value={otp} onChange={setOtp} length={5} />

        <button className="btn btn-primary" type="submit" disabled={loading || otp.length < 5}>
          {loading ? <Spinner /> : t('auth.verify')}
        </button>

        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button type="button" className="btn-link" onClick={handleResend} disabled={resending}>
            {resending ? t('auth.resending') : t('auth.resend')}
          </button>
        </div>
      </form>
    </div>
  )
}

// ─── Step 3: Register ─────────────────────────────────────
function RegisterStep({ phone, userId, tempToken, onRegistered }) {
  const { t } = useTranslation()
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
      setError(err.response?.data?.message || t('auth.registrationFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="animate-fade-up">
      <StepIndicator total={3} current={2} />
      <h2 className="auth-card-title">{t('auth.createAccount')}</h2>
      <p className="auth-card-sub">{t('auth.completeProfile')}</p>

      {error && <Alert type="error">{error}</Alert>}

      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div className="form-group">
            <label className="form-label">{t('auth.firstName')}</label>
            <input className="form-input" placeholder={t('auth.firstNamePlaceholder')} value={form.firstName} onChange={set('firstName')} required />
          </div>
          <div className="form-group">
            <label className="form-label">{t('auth.lastName')}</label>
            <input className="form-input" placeholder={t('auth.lastNamePlaceholder')} value={form.lastName} onChange={set('lastName')} required />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">{t('auth.email')}</label>
          <input className="form-input" type="email" placeholder={t('auth.emailPlaceholder')} value={form.email} onChange={set('email')} required />
        </div>

        <div className="form-group">
          <label className="form-label">{t('auth.password')}</label>
          <div className="input-wrapper">
            <input
              className="form-input"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('auth.passwordPlaceholder')}
              value={form.password}
              onChange={set('password')}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="input-action"
            >
              {showPassword ? t('auth.hide') : t('auth.show')}
            </button>
          </div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <Spinner /> : t('auth.createAccount')}
        </button>
      </form>
    </div>
  )
}

// ─── Login ────────────────────────────────────────────────
function LoginForm({ onSuccess, onSwitchToRegister }) {
  const { t } = useTranslation()
  const [step, setStep] = useState('password') // 'password' | 'otp'
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resending, setResending] = useState(false)

  // Step 1: phone + password. The backend validates and sends an SMS OTP.
  const handlePasswordSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await authApi.login(phone, password)
      if (data.requiresOtp) {
        setStep('otp')
      } else {
        onSuccess(data)
      }
    } catch (err) {
      setError(err.response?.data?.message || t('auth.invalidCredentials'))
    } finally {
      setLoading(false)
    }
  }

  // Step 2: verify the SMS OTP.
  const handleOtpSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const data = await authApi.loginWithOtp(phone, otp)
      onSuccess(data)
    } catch (err) {
      setError(err.response?.data?.message || t('auth.invalidOtp'))
      setOtp('')
    } finally {
      setLoading(false)
    }
  }

  const handleResend = async () => {
    setResending(true)
    try { await authApi.login(phone, password) } catch (_) {}
    setResending(false)
  }

  if (step === 'otp') {
    return (
      <div className="animate-fade-up">
        <h2 className="auth-card-title">{t('auth.verifyCode')}</h2>
        <p className="auth-card-sub">{t('auth.enterOtp')}</p>

        <div className="phone-banner">
          <span className="phone-banner-number">{phone}</span>
          <button className="btn btn-ghost" style={{ padding: '0.3rem 0.7rem', fontSize: '0.78rem' }} onClick={() => { setStep('password'); setOtp(''); setError('') }}>
            {t('auth.change')}
          </button>
        </div>

        {error && <Alert type="error">{error}</Alert>}

        <form onSubmit={handleOtpSubmit}>
          <OtpInputs value={otp} onChange={setOtp} length={5} />

          <button className="btn btn-primary" type="submit" disabled={loading || otp.length < 5}>
            {loading ? <Spinner /> : t('auth.signIn')}
          </button>

          <div style={{ textAlign: 'center', marginTop: '1rem' }}>
            <button type="button" className="btn-link" onClick={handleResend} disabled={resending}>
              {resending ? t('auth.resending') : t('auth.resend')}
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="animate-fade-up">
      <h2 className="auth-card-title">{t('auth.signIn')}</h2>
      <p className="auth-card-sub">{t('auth.welcomeBack')}</p>

      {error && <Alert type="error">{error}</Alert>}

      <form onSubmit={handlePasswordSubmit}>
        <div className="form-group">
          <label className="form-label">{t('auth.phoneNumber')}</label>
          <div className="input-wrapper">
            <span className="input-prefix">📱</span>
            <input
              type="tel"
              className="form-input has-prefix"
              placeholder={t('auth.phonePlaceholder')}
              value={phone}
              onChange={e => setPhone(e.target.value.replace(/\D/g, ''))}
              maxLength={11}
              autoFocus
            />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">{t('auth.password')}</label>
          <div className="input-wrapper">
            <input
              className="form-input"
              type={showPassword ? 'text' : 'password'}
              placeholder={t('auth.yourPassword')}
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="input-action"
            >
              {showPassword ? t('auth.hide') : t('auth.show')}
            </button>
          </div>
        </div>

        <div style={{ textAlign: 'end', marginTop: '-0.5rem', marginBottom: '1rem' }}>
          <Link className="btn-link" to="/forgot-password">{t('auth.forgotPassword')}</Link>
        </div>

        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? <Spinner /> : t('auth.signIn')}
        </button>
      </form>

      <div className="divider">{t('common.or')}</div>

      <div style={{ textAlign: 'center' }}>
        <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('auth.newToGoldex')}</span>
        <button className="btn-link" onClick={onSwitchToRegister}>{t('auth.createAccountLink')}</button>
      </div>
    </div>
  )
}

// ─── Main Auth Page ───────────────────────────────────────
export default function AuthPage() {
  const { t } = useTranslation()
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
    toast.success(t('auth.accountCreated'))
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
            <span style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('auth.alreadyHaveAccount')}</span>
            <button className="btn-link" onClick={switchToLogin}>{t('auth.signInLink')}</button>
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
