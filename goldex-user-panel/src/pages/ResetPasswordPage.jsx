import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { authApi } from '../services/api'
import { useToast } from '../context/ToastContext'
import AuthBrand from '../components/AuthBrand'
import { Alert, Button, TextField, ThemeToggle } from '../components/UI'

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const [params] = useSearchParams()
  const token = params.get('token')
  const navigate = useNavigate()
  const toast = useToast()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (password.length < 6) { setError(t('resetPassword.minLength')); return }
    if (password !== confirm) { setError(t('resetPassword.mismatch')); return }
    setLoading(true)
    setError('')
    try {
      await authApi.resetPassword(token, password)
      toast.success(t('resetPassword.resetSuccess'))
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.message || t('resetPassword.resetInvalid'))
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
            <h2 className="auth-card-title">{t('resetPassword.title')}</h2>
            <p className="auth-card-sub">{t('resetPassword.subtitle')}</p>

            {!token ? (
              <>
                <Alert type="error">{t('resetPassword.missingToken')}</Alert>
                <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                  <Link className="btn-link" to="/forgot-password">{t('resetPassword.requestNewLink')}</Link>
                </div>
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                {error && <Alert type="error">{error}</Alert>}
                <TextField
                  label={t('resetPassword.newPassword')}
                  type="password"
                  placeholder={t('resetPassword.newPasswordPlaceholder')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
                <TextField
                  label={t('resetPassword.confirmPassword')}
                  type="password"
                  placeholder={t('resetPassword.confirmPasswordPlaceholder')}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
                <Button type="submit" loading={loading}>{t('resetPassword.resetPassword')}</Button>
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
