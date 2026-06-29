import { useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { useToast } from '../context/ToastContext'
import AuthBrand from '../components/AuthBrand'
import { Alert, Button, TextField, ThemeToggle } from '../components/UI'

export default function ResetPasswordPage() {
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
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    setLoading(true)
    setError('')
    try {
      await authApi.resetPassword(token, password)
      toast.success('Your password has been reset. Please sign in.')
      navigate('/login')
    } catch (err) {
      setError(err.response?.data?.message || 'Reset link is invalid or has expired.')
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
            <h2 className="auth-card-title">New Password</h2>
            <p className="auth-card-sub">Choose a strong password for your account</p>

            {!token ? (
              <>
                <Alert type="error">This reset link is missing its token. Please request a new one.</Alert>
                <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                  <Link className="btn-link" to="/forgot-password">Request a new link</Link>
                </div>
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                {error && <Alert type="error">{error}</Alert>}
                <TextField
                  label="New Password"
                  type="password"
                  placeholder="Min 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoFocus
                />
                <TextField
                  label="Confirm Password"
                  type="password"
                  placeholder="Re-enter your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
                <Button type="submit" loading={loading}>Reset Password</Button>
                <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                  <Link className="btn-link" to="/login">Back to sign in</Link>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
