import { useEffect, useState } from 'react'
import { useToast } from '../context/ToastContext'
import { profileApi, baseInfoApi } from '../services/api'
import { Spinner, Alert, Button, SelectField, TextField } from '../components/UI'

export default function SettingsPage() {
  const toast = useToast()
  const [settings, setSettings] = useState(null)
  const [languages, setLanguages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [languageId, setLanguageId] = useState('')
  const [emailNotif, setEmailNotif] = useState(false)
  const [savingPrefs, setSavingPrefs] = useState(false)

  const [pwd, setPwd] = useState({ current: '', next: '', confirm: '' })
  const [savingPwd, setSavingPwd] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [data, langList] = await Promise.all([
          profileApi.getSettings(),
          baseInfoApi.getLanguages().catch(() => [])
        ])
        setSettings(data)
        setLanguageId(data.defaultLanguage?.id ? String(data.defaultLanguage.id) : '')
        setEmailNotif(!!data.isEmailNotificationEnabled)
        setLanguages(Array.isArray(langList) ? langList : langList?.items || [])
      } catch (_) {
        setError('Failed to load settings.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const savePrefs = async () => {
    setSavingPrefs(true)
    try {
      await profileApi.updateSettings({
        defaultLanguageId: languageId ? Number(languageId) : settings.defaultLanguage?.id,
        isEmailNotificationEnabled: emailNotif
      })
      toast.success('Preferences saved.')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save preferences.')
    } finally {
      setSavingPrefs(false)
    }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    if (pwd.next.length < 6) { toast.error('New password must be at least 6 characters.'); return }
    if (pwd.next !== pwd.confirm) { toast.error('New passwords do not match.'); return }
    setSavingPwd(true)
    try {
      await profileApi.updatePassword(pwd.current, pwd.next)
      setPwd({ current: '', next: '', confirm: '' })
      toast.success('Password changed.')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not change password. Check your current password.')
    } finally {
      setSavingPwd(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Spinner light />
    </div>
  )

  const langOptions = languages.map((l) => ({
    value: String(l.id),
    label: l.nativeName || l.name || l.locale
  }))

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <h1 className="main-header-title">Settings</h1>
        <p className="main-header-sub">Preferences, notifications and security</p>
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <Alert type="error">{error}</Alert>}

        {/* Language & notifications */}
        <div className="card animate-fade-up">
          <div className="card-title"><div className="gold-dot" />Preferences</div>

          <div style={{ maxWidth: 320 }}>
            <SelectField
              label="Default Language"
              value={languageId}
              onChange={(e) => setLanguageId(e.target.value)}
              options={langOptions}
              placeholder="Select language"
              hint="Interface and notification language"
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">Email Notifications</div>
              <div className="setting-desc">Receive trade alerts and account updates via email</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={emailNotif} onChange={(e) => setEmailNotif(e.target.checked)} />
              <span className="toggle-track" />
            </label>
          </div>

          <div className="btn-row">
            <Button className="btn-auto" loading={savingPrefs} onClick={savePrefs}>Save Preferences</Button>
          </div>
        </div>

        {/* Change password */}
        <form className="card animate-fade-up-delay" onSubmit={changePassword}>
          <div className="card-title"><div className="gold-dot" />Change Password</div>
          <div className="profile-grid">
            <TextField
              label="Current Password" type="password" value={pwd.current}
              onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))} required
            />
            <div />
            <TextField
              label="New Password" type="password" value={pwd.next}
              onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))} required
            />
            <TextField
              label="Confirm New Password" type="password" value={pwd.confirm}
              onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))} required
            />
          </div>
          <div className="btn-row">
            <Button type="submit" className="btn-auto" loading={savingPwd}>Update Password</Button>
          </div>
        </form>

        {/* Security (2FA — Phase 2) */}
        <div className="card animate-fade-up-delay-2">
          <div className="card-title"><div className="gold-dot" />Security</div>
          <div className="setting-row">
            <div>
              <div className="setting-label">Two-Factor Authentication</div>
              <div className="setting-desc">Add an extra layer of security to your account</div>
            </div>
            <span className="badge badge-warning">Coming soon</span>
          </div>
        </div>
      </div>
    </div>
  )
}
