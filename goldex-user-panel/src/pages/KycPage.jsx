import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../context/ToastContext'
import { kycApi } from '../services/api'
import { Spinner, Alert, Button, TextField, SelectField, Field } from '../components/UI'

const LEVEL_NUM = { NONE: 0, LEVEL_1: 1, LEVEL_2: 2, LEVEL_3: 3, COMPLETE: 4 }

const STATUS_BADGE = {
  APPROVED: 'badge-success', PENDING: 'badge-warning', REJECTED: 'badge-danger',
  approved: 'badge-success', pending: 'badge-warning', rejected: 'badge-danger'
}

function StepBadge({ done, locked, n }) {
  const bg = done ? 'var(--gold-500)' : locked ? 'var(--obsidian-600)' : 'var(--accent-glow)'
  const color = done ? 'var(--obsidian-900)' : locked ? 'var(--text-muted)' : 'var(--gold-300)'
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: bg, color, fontSize: '0.85rem', fontWeight: 600,
      border: '1px solid var(--border)'
    }}>
      {done ? '✓' : n}
    </div>
  )
}

export default function KycPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [kyc, setKyc] = useState(null)
  const [stats, setStats] = useState(null)
  const [docs, setDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [nationalId, setNationalId] = useState('')
  const [savingL1, setSavingL1] = useState(false)

  const [bank, setBank] = useState({ iban: '', bank: '', depositNumber: '', birthDate: '' })
  const [savingL2, setSavingL2] = useState(false)

  const [docForm, setDocForm] = useState({ fileTarget: '', description: '', file: null })
  const [docPreview, setDocPreview] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [deleting, setDeleting] = useState(null)

  const FILE_TARGETS = [
    { value: 'official-news-paper', label: t('kyc.docOfficialNewspaper') },
    { value: 'licence', label: t('kyc.docLicence') },
    { value: 'last-changes', label: t('kyc.docLastChanges') },
    { value: 'sub-licence', label: t('kyc.docSubLicence') }
  ]

  const levelNum = LEVEL_NUM[kyc?.level] ?? 0
  const hasL1 = levelNum >= 1
  const hasL2 = levelNum >= 2

  const loadDocs = async () => {
    try {
      const [s, d] = await Promise.all([
        kycApi.getStats().catch(() => null),
        kycApi.getDocuments().catch(() => [])
      ])
      setStats(s)
      setDocs(Array.isArray(d) ? d : [])
    } catch (_) {}
  }

  const load = async () => {
    try {
      const data = await kycApi.getKyc()
      setKyc(data)
      if ((LEVEL_NUM[data?.level] ?? 0) >= 2) await loadDocs()
    } catch (_) {
      setError(t('kyc.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [t])

  const submitL1 = async (e) => {
    e.preventDefault()
    setSavingL1(true)
    try {
      await kycApi.verifyLevel1(nationalId.trim())
      toast.success(t('kyc.identityVerified'))
      setNationalId('')
      await load()
    } catch (err) {
      toast.error(err.response?.data?.message || t('kyc.identityVerifyFailed'))
    } finally {
      setSavingL1(false)
    }
  }

  const submitL2 = async (e) => {
    e.preventDefault()
    setSavingL2(true)
    try {
      await kycApi.verifyLevel2({
        iban: bank.iban.trim().replace(/\s/g, ''),
        bank: bank.bank.trim(),
        depositNumber: bank.depositNumber.trim(),
        birthDate: bank.birthDate.trim()
      })
      toast.success(t('kyc.bankVerifiedMsg'))
      setBank({ iban: '', bank: '', depositNumber: '', birthDate: '' })
      await load()
    } catch (err) {
      toast.error(err.response?.data?.message || t('kyc.bankVerifyFailed'))
    } finally {
      setSavingL2(false)
    }
  }

  const submitDoc = async (e) => {
    e.preventDefault()
    if (!docForm.file || !docForm.fileTarget) { toast.error(t('kyc.pickDocAndFile')); return }
    setUploading(true)
    try {
      await kycApi.uploadDocument(docForm)
      toast.success(t('kyc.documentUploaded'))
      setDocForm({ fileTarget: '', description: '', file: null })
      await loadDocs()
    } catch (err) {
      toast.error(err.response?.data?.message || t('kyc.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  const removeDoc = async (id) => {
    setDeleting(id)
    try {
      await kycApi.deleteDocument(id)
      toast.success(t('kyc.documentRemoved'))
      await loadDocs()
    } catch (err) {
      toast.error(err.response?.data?.message || t('kyc.documentRemoveFailed'))
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Spinner light />
    </div>
  )

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <h1 className="main-header-title">{t('kyc.title')}</h1>
        <p className="main-header-sub">{t('kyc.subtitle')}</p>
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <Alert type="error">{error}</Alert>}

        {/* Status overview */}
        <div className="card animate-fade-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="field-label">{t('kyc.currentLevel')}</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--gold-300)' }}>
              {kyc?.level ? kyc.level.replace('_', ' ') : t('kyc.notStarted')}
            </div>
          </div>
          {kyc?.status && (
            <span className={`badge ${STATUS_BADGE[kyc.status] || 'badge-warning'}`}>{kyc.status}</span>
          )}
        </div>

        {/* Step 1 — National identity */}
        <div className="card animate-fade-up">
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <StepBadge n={1} done={hasL1} />{t('kyc.step1Title')}
            </span>
            {hasL1 && <span className="badge badge-success">{t('kyc.verified')}</span>}
          </div>
          {hasL1 ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              {t('kyc.nationalIdVerified', { masked: kyc?.nationalId ? t('kyc.nationalIdMask', { last4: String(kyc.nationalId).slice(-4) }) : '' })}
            </p>
          ) : (
            <form onSubmit={submitL1}>
              <div style={{ maxWidth: 320 }}>
                <TextField
                  label={t('kyc.nationalId')}
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
                  placeholder={t('kyc.nationalIdPlaceholder')}
                  maxLength={10}
                  hint={t('kyc.nationalIdHint')}
                  required
                />
              </div>
              <div className="btn-row">
                <Button type="submit" className="btn-auto" loading={savingL1} disabled={nationalId.length < 10}>
                  {t('kyc.verifyIdentity')}
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Step 2 — Bank account */}
        <div className="card animate-fade-up" style={{ opacity: hasL1 ? 1 : 0.6 }}>
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <StepBadge n={2} done={hasL2} locked={!hasL1} />{t('kyc.step2Title')}
            </span>
            {hasL2 && <span className="badge badge-success">{t('kyc.verified')}</span>}
          </div>
          {!hasL1 ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{t('kyc.completeL1First')}</p>
          ) : hasL2 ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>{t('kyc.bankVerified')}</p>
          ) : (
            <form onSubmit={submitL2}>
              <div className="profile-grid">
                <TextField label={t('kyc.iban')} value={bank.iban}
                  onChange={(e) => setBank((b) => ({ ...b, iban: e.target.value }))}
                  placeholder={t('kyc.ibanPlaceholder')} required />
                <TextField label={t('kyc.bank')} value={bank.bank}
                  onChange={(e) => setBank((b) => ({ ...b, bank: e.target.value }))}
                  placeholder={t('kyc.bankPlaceholder')} required />
                <TextField label={t('kyc.depositNumber')} value={bank.depositNumber}
                  onChange={(e) => setBank((b) => ({ ...b, depositNumber: e.target.value }))}
                  placeholder={t('kyc.depositNumberPlaceholder')} required />
                <TextField label={t('kyc.birthDate')} value={bank.birthDate}
                  onChange={(e) => setBank((b) => ({ ...b, birthDate: e.target.value }))}
                  placeholder={t('kyc.birthDatePlaceholder')} hint={t('kyc.birthDateHint')} required />
              </div>
              <div className="btn-row">
                <Button type="submit" className="btn-auto" loading={savingL2}>{t('kyc.verifyBank')}</Button>
              </div>
            </form>
          )}
        </div>

        {/* Step 3 — Documents (after level 2) */}
        {hasL2 && (
          <div className="card animate-fade-up">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <StepBadge n={3} done={false} />{t('kyc.step3Title')}
              </span>
              {stats && (
                <span className="badge badge-warning">{t('kyc.uploadsLeft', { remaining: stats.remaining, maxAllowed: stats.maxAllowed })}</span>
              )}
            </div>

            <form onSubmit={submitDoc}>
              <div className="profile-grid">
                <SelectField
                  label={t('kyc.documentType')}
                  value={docForm.fileTarget}
                  onChange={(e) => setDocForm((d) => ({ ...d, fileTarget: e.target.value }))}
                  options={FILE_TARGETS}
                  placeholder={t('kyc.documentTypePlaceholder')}
                />
                <TextField
                  label={t('kyc.descriptionOptional')}
                  value={docForm.description}
                  onChange={(e) => setDocForm((d) => ({ ...d, description: e.target.value }))}
                  placeholder={t('kyc.descriptionPlaceholder')}
                />
              </div>
              <Field label={t('kyc.file')}>
                <label className="avatar-upload-label">
                  {docForm.file ? docForm.file.name : t('kyc.chooseFile')}
                  <input type="file" hidden
                    onChange={(e) => {
                      const f = e.target.files?.[0] || null
                      setDocForm((d) => ({ ...d, file: f }))
                      setDocPreview(f ? URL.createObjectURL(f) : null)
                    }} />
                </label>
                {docPreview && (
                  <img src={docPreview} alt="preview" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, marginTop: 4 }} />
                )}
              </Field>
              <div className="btn-row">
                <Button type="submit" className="btn-auto" loading={uploading}
                  disabled={stats && stats.remaining <= 0}>
                  {t('kyc.uploadDocument')}
                </Button>
              </div>
            </form>

            {docs.length > 0 && (
              <div className="device-list" style={{ marginTop: '1.25rem' }}>
                  {docs.map((doc) => {
                  const st = (doc.status || '').toLowerCase()
                  const canDelete = st === 'pending' || st === 'rejected'
                  const objectName = doc.fileUrl?.startsWith('http')
                    ? decodeURIComponent(doc.fileUrl.split('/').pop())
                    : doc.fileUrl
                  const previewUrl = objectName ? `/api/v1/kyc/document/${encodeURIComponent(objectName)}` : null
                  return (
                    <div key={doc.id} className="device-item">
                      <div className="device-info">
                        <div className="device-name">
                          {FILE_TARGETS.find((f) => f.value === doc.fileTarget)?.label || doc.fileTarget}
                        </div>
                        <div className="device-meta">
                          {doc.fileName}
                          {previewUrl && (
                            <a href={previewUrl} target="_blank" rel="noreferrer" style={{ marginInlineStart: 8, fontSize: '0.8rem' }}>
                              {t('kyc.file')}
                            </a>
                          )}
                          {doc.rejectionReason ? ` · ${doc.rejectionReason}` : ''}
                        </div>
                      </div>
                      <span className={`badge ${STATUS_BADGE[st] || 'badge-warning'}`}>{doc.status}</span>
                      {canDelete && (
                        <button className="btn btn-danger" disabled={deleting === doc.id}
                          onClick={() => removeDoc(doc.id)} style={{ flexShrink: 0 }}>
                          {deleting === doc.id ? <Spinner light /> : t('common.delete')}
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
