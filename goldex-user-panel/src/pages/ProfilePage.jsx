import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { profileApi, baseInfoApi, levelApi } from '../services/api'
import { Spinner, Alert, Button, TextField, SelectField } from '../components/UI'

const GENDER = { 0: 'Not Set', 1: 'Male', 2: 'Female', 3: 'Non-binary' }
const GENDER_OPTIONS = Object.entries(GENDER).map(([value, label]) => ({ value, label }))

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const emptyForm = { phone: '', gender: '0', countryId: '', address: '', postalCode: '' }

export default function ProfilePage() {
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
  const [form, setForm] = useState(emptyForm)

  const [myLevel, setMyLevel] = useState(null)

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
      setError('Failed to load profile.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

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
      toast.success('Profile updated.')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save your changes.')
    } finally {
      setSaving(false)
    }
  }

  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarBusy(true)
    try {
      await profileApi.uploadAvatar(file)
      const fresh = await profileApi.getProfile()
      setProfile(fresh)
      setUser((u) => ({ ...(u || {}), ...fresh }))
      toast.success('Avatar updated.')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Avatar upload failed.')
    } finally {
      setAvatarBusy(false)
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
      toast.success('Avatar removed.')
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not remove avatar.')
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
    ? (profile.avatarImgPath.startsWith('http') ? profile.avatarImgPath : `/uploads/${profile.avatarImgPath}`)
    : null

  return (
    <div className="animate-fade-in">
      <div className="main-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="main-header-title">My Profile</h1>
          <p className="main-header-sub">Your personal information and account details</p>
        </div>
        {!editing && (
          <Button variant="secondary" className="btn-auto" onClick={startEdit} style={{ marginTop: '0.5rem' }}>
            Edit Profile
          </Button>
        )}
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {/* Identity / avatar card */}
        <div className="card animate-fade-up">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
            {avatarSrc
              ? <img className="avatar-img" src={avatarSrc} alt="avatar" onError={(e) => { e.currentTarget.style.display = 'none' }} />
              : <div className="avatar">{initials}</div>}
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                {profile.firstName} {profile.lastName}
              </div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>
                Member since {formatDate(profile.createdAt)}
              </div>
              <div className="avatar-actions">
                <label className="avatar-upload-label">
                  {avatarBusy ? 'Working…' : 'Change photo'}
                  <input type="file" accept="image/*" hidden onChange={handleAvatarUpload} disabled={avatarBusy} />
                </label>
                {avatarSrc && (
                  <button className="btn btn-danger" onClick={handleAvatarDelete} disabled={avatarBusy}>Remove</button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Details — view or edit */}
        {editing ? (
          <form className="card animate-fade-up" onSubmit={handleSave}>
            <div className="card-title"><div className="gold-dot" />Edit Details</div>
            <div className="profile-grid">
              <TextField label="First Name" value={profile.firstName || ''} disabled hint="Contact support to change your name" />
              <TextField label="Last Name" value={profile.lastName || ''} disabled />
              <TextField label="Email" value={profile.email || ''} disabled />
              <TextField label="Phone" value={form.phone} onChange={set('phone')} placeholder="09xxxxxxxxx" />
              <SelectField label="Gender" value={form.gender} onChange={set('gender')} options={GENDER_OPTIONS} />
              <SelectField label="Country" value={form.countryId} onChange={set('countryId')} options={countryOptions} placeholder="Select country" />
              <TextField label="Postal Code" value={form.postalCode} onChange={set('postalCode')} placeholder="—" />
              <TextField label="Address" value={form.address} onChange={set('address')} placeholder="—" />
            </div>
            <div className="btn-row">
              <Button type="submit" className="btn-auto" loading={saving}>Save Changes</Button>
              <Button type="button" variant="secondary" className="btn-auto" onClick={() => setEditing(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />Details</div>
            <div className="profile-grid">
              <Detail label="First Name" value={profile.firstName} />
              <Detail label="Last Name" value={profile.lastName} />
              <Detail label="Email" value={profile.email} accent />
              <Detail label="Phone" value={profile.phoneNumber} accent />
              <Detail label="Gender" value={GENDER[profile.gender] || 'Not Set'} />
              <Detail label="Country" value={profile.country} />
              <Detail label="Postal Code" value={profile.postalCode} />
              <Detail label="Address" value={profile.address} />
            </div>
          </div>
        )}

        {myLevel && (
          <div className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />Account Level</div>
            <div className="profile-grid">
              <Detail label="Level" value={myLevel.name} accent />
              <Detail label="Description" value={myLevel.description} />
            </div>
            <div className="btn-row" style={{ marginTop: 12 }}>
              <button className="btn btn-secondary btn-auto" onClick={() => navigate('/level')}>
                View Full Details →
              </button>
            </div>
          </div>
        )}

        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'right' }}>
          Last updated {formatDate(profile.updatedAt)}
        </div>
      </div>
    </div>
  )
}

function Detail({ label, value, accent }) {
  const empty = value === null || value === undefined || value === ''
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <span className={`field-value ${accent && !empty ? 'accent' : ''} ${empty ? 'muted' : ''}`}>
        {empty ? 'Not provided' : value}
      </span>
    </div>
  )
}
