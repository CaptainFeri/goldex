import { useEffect, useState } from 'react'
import { useToast } from '../context/ToastContext'
import { kycApi } from '../services/api'
import { Spinner, Alert, Button, TextField, SelectField, Field } from '../components/UI'

const LEVEL_NUM = { NONE: 0, LEVEL_1: 1, LEVEL_2: 2, LEVEL_3: 3, COMPLETE: 4 }

const FILE_TARGETS = [
  { value: 'official-news-paper', label: 'Official Newspaper' },
  { value: 'licence', label: 'Licence' },
  { value: 'last-changes', label: 'Last Changes' },
  { value: 'sub-licence', label: 'Sub-licence' }
]

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
      setError('Failed to load verification status.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const submitL1 = async (e) => {
    e.preventDefault()
    setSavingL1(true)
    try {
      await kycApi.verifyLevel1(nationalId.trim())
      toast.success('Identity verified.')
      setNationalId('')
      await load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Identity could not be verified. Check your national ID.')
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
      toast.success('Bank account verified.')
      setBank({ iban: '', bank: '', depositNumber: '', birthDate: '' })
      await load()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Bank account could not be verified.')
    } finally {
      setSavingL2(false)
    }
  }

  const submitDoc = async (e) => {
    e.preventDefault()
    if (!docForm.file || !docForm.fileTarget) { toast.error('Pick a document type and a file.'); return }
    setUploading(true)
    try {
      await kycApi.uploadDocument(docForm)
      toast.success('Document uploaded.')
      setDocForm({ fileTarget: '', description: '', file: null })
      await loadDocs()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const removeDoc = async (id) => {
    setDeleting(id)
    try {
      await kycApi.deleteDocument(id)
      toast.success('Document removed.')
      await loadDocs()
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not remove document.')
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
        <h1 className="main-header-title">Verification</h1>
        <p className="main-header-sub">Verify your identity to unlock trading and withdrawals</p>
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <Alert type="error">{error}</Alert>}

        {/* Status overview */}
        <div className="card animate-fade-up" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div className="field-label">Current Level</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--gold-300)' }}>
              {kyc?.level ? kyc.level.replace('_', ' ') : 'Not started'}
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
              <StepBadge n={1} done={hasL1} />Identity — National ID
            </span>
            {hasL1 && <span className="badge badge-success">Verified</span>}
          </div>
          {hasL1 ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Your national ID {kyc?.nationalId ? `(••••${String(kyc.nationalId).slice(-4)})` : ''} has been verified.
            </p>
          ) : (
            <form onSubmit={submitL1}>
              <div style={{ maxWidth: 320 }}>
                <TextField
                  label="National ID"
                  value={nationalId}
                  onChange={(e) => setNationalId(e.target.value.replace(/\D/g, ''))}
                  placeholder="10-digit national code"
                  maxLength={10}
                  hint="Must match the mobile number on your account"
                  required
                />
              </div>
              <div className="btn-row">
                <Button type="submit" className="btn-auto" loading={savingL1} disabled={nationalId.length < 10}>
                  Verify Identity
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Step 2 — Bank account */}
        <div className="card animate-fade-up" style={{ opacity: hasL1 ? 1 : 0.6 }}>
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <StepBadge n={2} done={hasL2} locked={!hasL1} />Bank Account
            </span>
            {hasL2 && <span className="badge badge-success">Verified</span>}
          </div>
          {!hasL1 ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Complete identity verification first.</p>
          ) : hasL2 ? (
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Your bank account has been verified.</p>
          ) : (
            <form onSubmit={submitL2}>
              <div className="profile-grid">
                <TextField label="IBAN (Sheba)" value={bank.iban}
                  onChange={(e) => setBank((b) => ({ ...b, iban: e.target.value }))}
                  placeholder="IR…" required />
                <TextField label="Bank" value={bank.bank}
                  onChange={(e) => setBank((b) => ({ ...b, bank: e.target.value }))}
                  placeholder="Bank name" required />
                <TextField label="Deposit Number" value={bank.depositNumber}
                  onChange={(e) => setBank((b) => ({ ...b, depositNumber: e.target.value }))}
                  placeholder="Account / deposit number" required />
                <TextField label="Birth Date" value={bank.birthDate}
                  onChange={(e) => setBank((b) => ({ ...b, birthDate: e.target.value }))}
                  placeholder="YYYY/MM/DD" hint="As registered with your bank" required />
              </div>
              <div className="btn-row">
                <Button type="submit" className="btn-auto" loading={savingL2}>Verify Bank Account</Button>
              </div>
            </form>
          )}
        </div>

        {/* Step 3 — Documents (after level 2) */}
        {hasL2 && (
          <div className="card animate-fade-up">
            <div className="card-title" style={{ justifyContent: 'space-between' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <StepBadge n={3} done={false} />Documents
              </span>
              {stats && (
                <span className="badge badge-warning">{stats.remaining} of {stats.maxAllowed} uploads left</span>
              )}
            </div>

            <form onSubmit={submitDoc}>
              <div className="profile-grid">
                <SelectField
                  label="Document Type"
                  value={docForm.fileTarget}
                  onChange={(e) => setDocForm((d) => ({ ...d, fileTarget: e.target.value }))}
                  options={FILE_TARGETS}
                  placeholder="Select type"
                />
                <TextField
                  label="Description (optional)"
                  value={docForm.description}
                  onChange={(e) => setDocForm((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Short note"
                />
              </div>
              <Field label="File">
                <label className="avatar-upload-label">
                  {docForm.file ? docForm.file.name : 'Choose file…'}
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
                  Upload Document
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
                            <a href={previewUrl} target="_blank" rel="noreferrer" style={{ marginLeft: 8, fontSize: '0.8rem' }}>
                              Preview
                            </a>
                          )}
                          {doc.rejectionReason ? ` · ${doc.rejectionReason}` : ''}
                        </div>
                      </div>
                      <span className={`badge ${STATUS_BADGE[st] || 'badge-warning'}`}>{doc.status}</span>
                      {canDelete && (
                        <button className="btn btn-danger" disabled={deleting === doc.id}
                          onClick={() => removeDoc(doc.id)} style={{ flexShrink: 0 }}>
                          {deleting === doc.id ? <Spinner light /> : 'Delete'}
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
