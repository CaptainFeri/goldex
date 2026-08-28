import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { authApi } from '../services/api'
import AuthBrand from '../components/AuthBrand'
import { Alert, Button, TextField, ThemeToggle } from '../components/UI'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      await authApi.forgetPassword(email)
      setSent(true)
    } catch (err) {
      setError(err.response?.data?.message || t('forgotPassword.sendFailed'))
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

            {sent ? (
              <>
                <Alert type="success">
                  <Trans i18nKey="forgotPassword.sentSuccess" values={{ email }} components={{ 1: <strong /> }} />
                </Alert>
                <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                  <Link className="btn-link" to="/login">{t('common.backToSignIn')}</Link>
                </div>
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                {error && <Alert type="error">{error}</Alert>}
                <TextField
                  label={t('forgotPassword.email')}
                  type="email"
                  placeholder={t('forgotPassword.emailPlaceholder')}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
                <Button type="submit" loading={loading} disabled={!email}>
                  {t('forgotPassword.sendResetLink')}
                </Button>
                <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
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
