import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { authApi } from '../services/api'
import AuthBrand from '../components/AuthBrand'
import { Alert, Button, TextField, ThemeToggle } from '../components/UI'

const RESEND_SECONDS = 60

/**
 * Password recovery over SMS: the account's phone number receives a one-time
 * code, and a correct code yields the short-lived reset token that the reset
 * page uses as its bearer credential.
 */
export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const [step, setStep] = useState('phone')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [cooldown])

  const phoneValid = /^09\d{9}$/.test(phone)

  const sendCode = async () => {
    setLoading(true)
    setError('')
    try {
      await authApi.forgetPassword(phone)
      setStep('code')
      setCooldown(RESEND_SECONDS)
    } catch (err) {
      setError(err.response?.data?.message || t('forgotPassword.sendFailed'))
    } finally {
      setLoading(false)
    }
  }

  const handlePhoneSubmit = (e) => {
    e.preventDefault()
    sendCode()
  }

  const handleCodeSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { resetToken } = await authApi.verifyForgetPasswordOtp(phone, code)
      navigate(`/reset-password?token=${encodeURIComponent(resetToken)}`)
    } catch (err) {
      setError(err.response?.data?.message || t('forgotPassword.verifyFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-shell">
      <ThemeToggle className="theme-toggle-fixed" />
      <AuthBrand />
      <div className="auth-panel">
        <div className="auth-card">
          <div className="animate-fade-up">
            <h2 className="auth-card-title">{t('forgotPassword.title')}</h2>
            <p className="auth-card-sub">{t('forgotPassword.subtitle')}</p>

            {step === 'phone' ? (
              <form onSubmit={handlePhoneSubmit}>
                {error && <Alert type="error">{error}</Alert>}
                <TextField
                  label={t('forgotPassword.phone')}
                  type="tel"
                  inputMode="numeric"
                  placeholder={t('forgotPassword.phonePlaceholder')}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                  required
                  autoFocus
                />
                <Button type="submit" loading={loading} disabled={!phoneValid}>
                  {t('forgotPassword.sendCode')}
                </Button>
                <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                  <Link className="btn-link" to="/login">{t('common.backToSignIn')}</Link>
                </div>
              </form>
            ) : (
              <form onSubmit={handleCodeSubmit}>
                {error && <Alert type="error">{error}</Alert>}
                <Alert type="success">
                  <Trans i18nKey="forgotPassword.codeSent" values={{ phone }} components={{ 1: <strong /> }} />
                </Alert>
                <TextField
                  label={t('forgotPassword.code')}
                  type="text"
                  inputMode="numeric"
                  placeholder={t('forgotPassword.codePlaceholder')}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
                  required
                  autoFocus
                />
                <Button type="submit" loading={loading} disabled={code.length !== 5}>
                  {t('forgotPassword.verifyCode')}
                </Button>
                <div style={{ textAlign: 'center', marginTop: '1.25rem', display: 'grid', gap: '0.5rem' }}>
                  {cooldown > 0 ? (
                    <span className="auth-card-sub">{t('forgotPassword.resendIn', { seconds: cooldown })}</span>
                  ) : (
                    <button type="button" className="btn-link" onClick={sendCode} disabled={loading}>
                      {t('forgotPassword.resendCode')}
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-link"
                    onClick={() => { setStep('phone'); setCode(''); setError('') }}
                  >
                    {t('forgotPassword.changePhone')}
                  </button>
                  <Link className="btn-link" to="/login">{t('common.backToSignIn')}</Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
