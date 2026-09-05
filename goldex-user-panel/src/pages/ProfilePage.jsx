import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { profileApi, baseInfoApi, levelApi } from '../services/api'
import { Spinner, Alert, Button, TextField, SelectField } from '../components/UI'

const GENDER_KEYS = { 0: 'notSet', 1: 'male', 2: 'female', 3: 'nonBinary' }

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const emptyForm = { phone: '', gender: '0', countryId: '', address: '', postalCode: '' }

export default function ProfilePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { setUser } = useAuth()
  const toast = useToast()
  const [profile, setProfile] = useState(null)
  const [countries, setCountries] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [avatarBusy, setAvatarBusy] = useState(false)
  const [avatarPreview, setAvatarPreview] = useState(null)
  const [form, setForm] = useState(emptyForm)

  const [myLevel, setMyLevel] = useState(null)

  const genderLabel = (g) => t(`common.${GENDER_KEYS[g] || 'notSet'}`)
  const genderOptions = [0, 1, 2, 3].map((v) => ({ value: String(v), label: genderLabel(v) }))

  const load = async () => {
    try {
      const [data, countryList, levelData] = await Promise.all([
        profileApi.getProfile(),
        baseInfoApi.getCountries().catch(() => []),
        levelApi.getMyLevel().catch(() => null),
      ])
      setProfile(data)
      setMyLevel(levelData)
      setCountries(Array.isArray(countryList) ? countryList : countryList?.items || [])
    } catch (_) {
      setError(t('profile.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [t])

  const countryOptions = countries.map((c) => ({ value: String(c.id), label: c.name || c.nativeName || c.code }))

  const startEdit = () => {
    const matched = countries.find((c) => c.name === profile.country)
    setForm({
      phone: profile.phoneNumber || '',
      gender: String(profile.gender ?? 0),
      countryId: profile.countryId ? String(profile.countryId) : (matched ? String(matched.id) : ''),
      address: profile.address || '',
      postalCode: profile.postalCode || ''
    })
    setEditing(true)
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        phone: form.phone || undefined,
        gender: Number(form.gender),
        countryId: form.countryId ? Number(form.countryId) : undefined,
        address: form.address || undefined,
        postalCode: form.postalCode || undefined
      }
      await profileApi.updateProfile(payload)
      const fresh = await profileApi.getProfile()
      setProfile(fresh)
      setUser((u) => ({ ...(u || {}), ...fresh }))
      setEditing(false)
      toast.success(t('profile.profileUpdated'))
    } catch (err) {
      toast.error(err.response?.data?.message || t('profile.profileUpdateFailed'))
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarPreview(URL.createObjectURL(file))
    setAvatarBusy(true)
    try {
      await profileApi.uploadAvatar(file)
      const fresh = await profileApi.getProfile()
      setProfile(fresh)
      setUser((u) => ({ ...(u || {}), ...fresh }))
      toast.success(t('profile.avatarUpdated'))
    } catch (err) {
      toast.error(err.response?.data?.message || t('profile.avatarUploadFailed'))
    } finally {
      setAvatarBusy(false)
      setAvatarPreview(null)
      e.target.value = ''
    }
  }

  const handleAvatarDelete = async () => {
    setAvatarBusy(true)
    try {
      await profileApi.deleteAvatar()
      const fresh = await profileApi.getProfile()
      setProfile(fresh)
      setUser((u) => ({ ...(u || {}), ...fresh }))
      toast.success(t('profile.avatarRemoved'))
    } catch (err) {
      toast.error(err.response?.data?.message || t('profile.avatarRemoveFailed'))
    } finally {
      setAvatarBusy(false)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Spinner light />
    </div>
  )

  if (error) return (
    <div className="main-body"><Alert type="error">{error}</Alert></div>
  )

  const initials = `${(profile.firstName || '?')[0]}${(profile.lastName || '?')[0]}`.toUpperCase()
  const avatarSrc = profile.avatarImgPath
    ? (profile.avatarImgPath.startsWith('edited-')
      ? `/uploads/${profile.avatarImgPath}`
      : `/api/v1/profile/avatar/${encodeURIComponent(profile.avatarImgPath)}`)
    : null

  return (
    <div className="animate-fade-in">
      <div className="main-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="main-header-title">{t('profile.title')}</h1>
          <p className="main-header-sub">{t('profile.subtitle')}</p>
        </div>
        {!editing && (
          <Button variant="secondary" className="btn-auto" onClick={startEdit} style={{ marginTop: '0.5rem' }}>
            {t('profile.editProfile')}
          </Button>
        )}
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Identity / avatar card */}
        <div className="card animate-fade-up">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {avatarPreview
              ? <img className="avatar-img" src={avatarPreview} alt="avatar-preview" />
              : avatarSrc
                ? <img className="avatar-img" src={avatarSrc} alt="avatar" onError={(e) => { e.currentTarget.style.display = 'none' }} />
                : <div className="avatar">{initials}</div>}
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                {profile.firstName} {profile.lastName}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                {t('profile.memberSince', { date: formatDate(profile.createdAt) })}
              </div>
              <div className="avatar-actions">
                <label className="avatar-upload-label">
                  {avatarBusy ? t('profile.working') : t('profile.changePhoto')}
                  <input type="file" accept="image/*" hidden onChange={handleAvatarUpload} disabled={avatarBusy} />
                </label>
                {avatarSrc && (
                  <button className="btn btn-danger" onClick={handleAvatarDelete} disabled={avatarBusy}>{t('profile.remove')}</button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Details — view or edit */}
        {editing ? (
          <form className="card animate-fade-up" onSubmit={handleSave}>
            <div className="card-title"><div className="gold-dot" />{t('profile.editDetails')}</div>
            <div className="profile-grid">
              <TextField label={t('profile.firstName')} value={profile.firstName || ''} disabled hint={t('profile.firstNameHint')} />
              <TextField label={t('profile.lastName')} value={profile.lastName || ''} disabled />
              <TextField label={t('profile.email')} value={profile.email || ''} disabled />
              <TextField label={t('profile.phone')} value={form.phone} onChange={set('phone')} placeholder={t('profile.phonePlaceholder')} />
              <SelectField label={t('profile.gender')} value={form.gender} onChange={set('gender')} options={genderOptions} />
              <SelectField label={t('profile.country')} value={form.countryId} onChange={set('countryId')} options={countryOptions} placeholder={t('profile.countryPlaceholder')} />
              <TextField label={t('profile.postalCode')} value={form.postalCode} onChange={set('postalCode')} placeholder={t('profile.postalCodePlaceholder')} />
              <TextField label={t('profile.address')} value={form.address} onChange={set('address')} placeholder={t('profile.addressPlaceholder')} />
            </div>
            <div className="btn-row">
              <Button type="submit" className="btn-auto" loading={saving}>{t('profile.saveChanges')}</Button>
              <Button type="button" variant="secondary" className="btn-auto" onClick={() => setEditing(false)} disabled={saving}>
                {t('profile.cancel')}
              </Button>
            </div>
          </form>
        ) : (
          <div className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />{t('profile.details')}</div>
            <div className="profile-grid">
              <Detail label={t('profile.firstName')} value={profile.firstName} />
              <Detail label={t('profile.lastName')} value={profile.lastName} />
              <Detail label={t('profile.email')} value={profile.email} accent />
              <Detail label={t('profile.phone')} value={profile.phoneNumber} accent />
              <Detail label={t('profile.gender')} value={genderLabel(profile.gender)} />
              <Detail label={t('profile.country')} value={profile.country} />
              <Detail label={t('profile.postalCode')} value={profile.postalCode} />
              <Detail label={t('profile.address')} value={profile.address} />
            </div>
          </div>
        )}

        {myLevel && (
          <div className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />{t('profile.accountLevel')}</div>
            <div className="profile-grid">
              <Detail label={t('sidebar.level')} value={myLevel.name} accent />
              <Detail label={t('profile.description')} value={myLevel.description} />
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn btn-secondary btn-auto" onClick={() => navigate('/level')}>
                {t('profile.viewFullDetails')}
              </button>
            </div>
          </div>
        )}

        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'end' }}>
          {t('profile.lastUpdated', { date: formatDate(profile.updatedAt) })}
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value, accent }) {
  const { t } = useTranslation()
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <span className={`field-value ${accent && !empty ? 'accent' : ''} ${empty ? 'muted' : ''}`}>
        {empty ? t('common.notProvided') : value}
      </span>
    </div>
  )
}
