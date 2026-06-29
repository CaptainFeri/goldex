import { useState } from 'react'
import { Link } from 'react-router-dom'
import { authApi } from '../services/api'
import AuthBrand from '../components/AuthBrand'
import { Alert, Button, TextField, ThemeToggle } from '../components/UI'

export default function ForgotPasswordPage() {
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
      setError(err.response?.data?.message || 'Could not send the reset link. Please try again.')
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
            <h2 className="auth-card-title">Reset Password</h2>
            <p className="auth-card-sub">Enter your email and we'll send you a reset link</p>

            {sent ? (
              <>
                <Alert type="success">
                  If an account exists for <strong>{email}</strong>, a password reset link is on its way.
                </Alert>
                <div style={{ textAlign: 'center', marginTop: '1.25rem' }}>
                  <Link className="btn-link" to="/login">Back to sign in</Link>
                </div>
              </>
            ) : (
              <form onSubmit={handleSubmit}>
                {error && <Alert type="error">{error}</Alert>}
                <TextField
                  label="Email Address"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
                <Button type="submit" loading={loading} disabled={!email}>
                  Send Reset Link
                </Button>
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
