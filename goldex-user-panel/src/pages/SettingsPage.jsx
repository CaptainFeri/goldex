import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../context/ToastContext'
import { profileApi, baseInfoApi } from '../services/api'
import { Spinner, Alert, Button, SelectField, TextField } from '../components/UI'

export default function SettingsPage() {
  const { t } = useTranslation()
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
        setError(t('settings.loadFailed'))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [t])

  const savePrefs = async () => {
    setSavingPrefs(true)
    try {
      await profileApi.updateSettings({
        defaultLanguageId: languageId ? Number(languageId) : settings.defaultLanguage?.id,
        isEmailNotificationEnabled: emailNotif
      })
      toast.success(t('settings.preferencesSaved'))
    } catch (err) {
      toast.error(err.response?.data?.message || t('settings.preferencesSaveFailed'))
    } finally {
      setSavingPrefs(false)
    }
  }

  const changePassword = async (e) => {
    e.preventDefault()
    if (pwd.next.length < 6) { toast.error(t('settings.passwordMinLength')); return }
    if (pwd.next !== pwd.confirm) { toast.error(t('settings.passwordMismatch')); return }
    setSavingPwd(true)
    try {
      await profileApi.updatePassword(pwd.current, pwd.next)
      setPwd({ current: '', next: '', confirm: '' })
      toast.success(t('settings.passwordChanged'))
    } catch (err) {
      toast.error(err.response?.data?.message || t('settings.passwordChangeFailed'))
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
        <h1 className="main-header-title">{t('settings.title')}</h1>
        <p className="main-header-sub">{t('settings.subtitle')}</p>
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <Alert type="error">{error}</Alert>}

        {/* Language & notifications */}
        <div className="card animate-fade-up">
          <div className="card-title"><div className="gold-dot" />{t('settings.preferences')}</div>

          <div style={{ maxWidth: 320 }}>
            <SelectField
              label={t('settings.defaultLanguage')}
              value={languageId}
              onChange={(e) => setLanguageId(e.target.value)}
              options={langOptions}
              placeholder={t('settings.languagePlaceholder')}
              hint={t('settings.languageHint')}
            />
          </div>

          <div className="setting-row">
            <div>
              <div className="setting-label">{t('settings.emailNotifications')}</div>
              <div className="setting-desc">{t('settings.emailDesc')}</div>
            </div>
            <label className="toggle">
              <input type="checkbox" checked={emailNotif} onChange={(e) => setEmailNotif(e.target.checked)} />
              <span className="toggle-track" />
            </label>
          </div>

          <div className="btn-row">
            <Button className="btn-auto" loading={savingPrefs} onClick={savePrefs}>{t('settings.savePreferences')}</Button>
          </div>
        </div>

        {/* Change password */}
        <form className="card animate-fade-up-delay" onSubmit={changePassword}>
          <div className="card-title"><div className="gold-dot" />{t('settings.changePassword')}</div>
          <div className="profile-grid">
            <TextField
              label={t('settings.currentPassword')} type="password" value={pwd.current}
              onChange={(e) => setPwd((p) => ({ ...p, current: e.target.value }))} required
            />
            <div />
            <TextField
              label={t('settings.newPassword')} type="password" value={pwd.next}
              onChange={(e) => setPwd((p) => ({ ...p, next: e.target.value }))} required
            />
            <TextField
              label={t('settings.confirmNewPassword')} type="password" value={pwd.confirm}
              onChange={(e) => setPwd((p) => ({ ...p, confirm: e.target.value }))} required
            />
          </div>
          <div className="btn-row">
            <Button type="submit" className="btn-auto" loading={savingPwd}>{t('settings.updatePassword')}</Button>
          </div>
        </form>

        {/* Security (2FA — Phase 2) */}
        <div className="card animate-fade-up-delay-2">
          <div className="card-title"><div className="gold-dot" />{t('settings.security')}</div>
          <div className="setting-row">
            <div>
              <div className="setting-label">{t('settings.twoFactor')}</div>
              <div className="setting-desc">{t('settings.twoFactorDesc')}</div>
            </div>
            <span className="badge badge-warning">{t('common.comingSoon')}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
