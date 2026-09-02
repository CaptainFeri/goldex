import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { p2pApi } from '../services/api'
import { Spinner, Alert, Button } from '../components/UI'

const fmt = (n) => {
  const num = Number(n)
  return isFinite(num) ? num.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'
}

const fmtDateTime = (iso) =>
  iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'

const STATE_BADGE = {
  PENDING_MATCHING: 'badge-warning',
  PARTIALLY_MATCHED: 'badge-warning',
  ADMIN_SETTLEMENT: 'badge-warning',
  COMPLETED: 'badge-success',
  EXPIRED: 'badge-danger',
  CANCELLED: 'badge-danger',
}

const PART_BADGE = {
  OPEN: 'badge-warning',
  RESERVED: 'badge-warning',
  PAID_PENDING: 'badge-warning',
  CONFIRMED: 'badge-success',
  CANCELLED: 'badge-danger',
  EXPIRED: 'badge-danger',
}

const MATCH_BADGE = {
  RESERVED: 'badge-warning',
  AWAITING_PAYMENT: 'badge-warning',
  PROOF_SUBMITTED: 'badge-warning',
  WAITING_CONFIRMATION: 'badge-warning',
  CONFIRMED: 'badge-success',
  REJECTED_BY_WITHDRAWER: 'badge-danger',
  RESPONSE_TIMEOUT: 'badge-danger',
  ESCALATED: 'badge-warning',
  RESERVATION_EXPIRED: 'badge-danger',
  CANCELLED: 'badge-danger',
}

/** Live countdown to a deadline. Reservations and response windows are short
 *  enough that a static timestamp is not much use to the person waiting. */
function Countdown({ until, expiredLabel }) {
  const [left, setLeft] = useState(() => (until ? new Date(until).getTime() - Date.now() : 0))

  useEffect(() => {
    if (!until) return
    const id = setInterval(() => setLeft(new Date(until).getTime() - Date.now()), 1000)
    return () => clearInterval(id)
  }, [until])

  if (!until) return null
  if (left <= 0) return <span className="badge badge-danger">{expiredLabel}</span>

  const mins = Math.floor(left / 60000)
  const secs = Math.floor((left % 60000) / 1000)
  return (
    <span className={`badge ${mins < 5 ? 'badge-danger' : 'badge-warning'}`} dir="ltr">
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  )
}

function CopyableRow({ label, value }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable (insecure origin) — the value is still readable */
    }
  }
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <span className="field-value" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="mono" dir="ltr">{value}</span>
        <button type="button" className="btn btn-ghost" style={{ padding: '0.1rem 0.4rem', fontSize: '0.75rem' }} onClick={copy}>
          {copied ? '✓' : '⧉'}
        </button>
      </span>
    </div>
  )
}

// ─── Withdrawer side ─────────────────────────────────────────

function WithdrawalCard({ request, onChanged }) {
  const { t } = useTranslation()
  const [parts, setParts] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [busyPart, setBusyPart] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setParts(await p2pApi.getWithdrawParts(request.withdrawId ?? request.id))
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || t('p2p.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [request, t])

  useEffect(() => { load() }, [load])

  const act = async (partId, accept) => {
    if (!accept) {
      const reason = window.prompt(t('p2p.rejectReasonPrompt'))
      if (!reason) return
      setBusyPart(partId)
      try {
        await p2pApi.rejectPart(partId, reason)
        await load()
        onChanged?.()
      } catch (e) {
        setError(e?.response?.data?.message || e?.message || t('p2p.actionFailed'))
      } finally {
        setBusyPart('')
      }
      return
    }
    if (!window.confirm(t('p2p.confirmReceiptPrompt'))) return
    setBusyPart(partId)
    try {
      await p2pApi.confirmPart(partId)
      await load()
      onChanged?.()
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || t('p2p.actionFailed'))
    } finally {
      setBusyPart('')
    }
  }

  const total = Number(request.totalAmount ?? 0)
  const done = Number(request.completedAmount ?? 0)
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{fmt(total)} — {t('p2p.withdrawalRequest')}</span>
        <span className={`badge ${STATE_BADGE[request.state] ?? 'badge-warning'}`}>
          {t(`p2p.state.${request.state}`, request.state)}
        </span>
      </div>

      <div style={{ margin: '0.75rem 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <span>{t('p2p.settled')}: {fmt(done)}</span>
          <span>{t('p2p.remaining')}: {fmt(total - done)}</span>
        </div>
        <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, marginTop: 4 }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 3, background: 'var(--gold-400, #e0b341)' }} />
        </div>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {loading && !parts ? <Spinner /> : null}

      {parts?.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t('p2p.amount')}</th>
                <th>{t('p2p.status')}</th>
                <th>{t('p2p.deadline')}</th>
                <th>{t('p2p.receipt')}</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {parts.map((p) => {
                const proof = p.match?.paymentProof
                const awaiting = p.match?.status === 'WAITING_CONFIRMATION'
                return (
                  <tr key={p.id}>
                    <td>{p.sequenceNo}</td>
                    <td className="mono">{fmt(p.targetAmount)}</td>
                    <td>
                      <span className={`badge ${PART_BADGE[p.status] ?? 'badge-warning'}`}>
                        {t(`p2p.partStatus.${p.status}`, p.status)}
                      </span>
                    </td>
                    <td>
                      {awaiting
                        ? <Countdown until={p.match?.responseDeadlineAt} expiredLabel={t('p2p.expired')} />
                        : fmtDateTime(p.reservedUntil)}
                    </td>
                    <td>
                      {proof ? (
                        <div style={{ fontSize: '0.75rem', lineHeight: 1.7 }}>
                          <div className="mono">{fmt(proof.amount)}</div>
                          {proof.trackingCode && <div className="mono" dir="ltr">{proof.trackingCode}</div>}
                          {proof.receiptUrl && (
                            <a href={proof.receiptUrl} target="_blank" rel="noreferrer" className="btn-link">
                              {t('p2p.viewReceipt')}
                            </a>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td>
                      {awaiting ? (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary" disabled={busyPart === p.id} onClick={() => act(p.id, true)}>
                            {t('p2p.confirm')}
                          </button>
                          <button className="btn btn-danger" disabled={busyPart === p.id} onClick={() => act(p.id, false)}>
                            {t('p2p.reject')}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : !loading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('p2p.noParts')}</div>
      ) : null}

      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.75rem', lineHeight: 1.8 }}>
        {t('p2p.withdrawerHint')}
      </div>
    </div>
  )
}

// ─── Depositor side ──────────────────────────────────────────

function ProofForm({ match, onDone }) {
  const { t } = useTranslation()
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [amount, setAmount] = useState(String(match.amount ?? ''))
  const [sourceAccount, setSourceAccount] = useState('')
  const [trackingCode, setTrackingCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const pick = (e) => {
    const f = e.target.files?.[0]
    if (!f) return
    setFile(f)
    setPreview(URL.createObjectURL(f))
  }

  const submit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await p2pApi.submitPaymentProof(match.id, {
        file,
        amount: Number(amount),
        sourceAccount: sourceAccount || undefined,
        trackingCode: trackingCode || undefined,
        paidAt: new Date().toISOString(),
      })
      onDone()
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || t('p2p.proofFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.75rem' }}>
      {error && <Alert type="error">{error}</Alert>}
      <div className="field">
        <label>{t('p2p.paidAmount')}</label>
        <input className="form-input" type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} required />
      </div>
      <div className="field">
        <label>{t('p2p.sourceAccount')}</label>
        <input className="form-input" dir="ltr" value={sourceAccount} onChange={(e) => setSourceAccount(e.target.value)} />
      </div>
      <div className="field">
        <label>{t('p2p.trackingCode')}</label>
        <input className="form-input" dir="ltr" value={trackingCode} onChange={(e) => setTrackingCode(e.target.value)} />
      </div>
      <div className="field">
        <label>{t('p2p.receiptImage')}</label>
        <input ref={fileRef} type="file" accept="image/*" onChange={pick} style={{ display: 'none' }} />
        <button type="button" className="btn btn-ghost btn-auto" onClick={() => fileRef.current?.click()}>
          {file ? file.name : t('p2p.chooseImage')}
        </button>
        {preview && <img src={preview} alt="receipt" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, marginTop: 8 }} />}
      </div>
      <Button type="submit" loading={submitting} style={{ alignSelf: 'flex-start' }}>
        {t('p2p.submitProof')}
      </Button>
    </form>
  )
}

function IntentCard({ intent, onChanged }) {
  const { t } = useTranslation()
  const [match, setMatch] = useState(intent.match ?? null)
  const [loading, setLoading] = useState(!intent.match)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setMatch(await p2pApi.getMatch(intent.id))
    } catch (e) {
      // A queued intent legitimately has no match yet — that is not an error
      // worth shouting about.
      if (e?.response?.status !== 404) {
        setError(e?.response?.data?.message || e?.message || t('p2p.loadFailed'))
      }
      setMatch(null)
    } finally {
      setLoading(false)
    }
  }, [intent.id, t])

  useEffect(() => { if (!intent.match) load() }, [intent.match, load])

  const cancel = async () => {
    if (!window.confirm(t('p2p.confirmCancelMatch'))) return
    setBusy(true)
    try {
      await p2pApi.cancelMatch(match.id)
      await load()
      onChanged?.()
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || t('p2p.actionFailed'))
    } finally {
      setBusy(false)
    }
  }

  const dest = match?.destinationSnapshotJson
  const proof = match?.paymentProof
  const awaitingPayment =
    match && !proof && ['RESERVED', 'AWAITING_PAYMENT'].includes(match.status)

  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>{fmt(intent.requestedAmount)} — {t('p2p.depositIntent')}</span>
        {match
          ? <span className={`badge ${MATCH_BADGE[match.status] ?? 'badge-warning'}`}>{t(`p2p.matchStatus.${match.status}`, match.status)}</span>
          : <span className="badge badge-warning">{t('p2p.searching')}</span>}
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {loading && <Spinner />}

      {!loading && !match && (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.9 }}>
          {t('p2p.noMatchYet')}
          <div style={{ marginTop: 8 }}>
            <button className="btn btn-ghost btn-auto" onClick={load}>{t('p2p.refresh')}</button>
          </div>
        </div>
      )}

      {match && dest && (
        <>
          <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: 8, marginTop: '0.5rem' }}>
            <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{t('p2p.payToThisAccount')}</span>
              {awaitingPayment && <Countdown until={match.reservationExpiresAt} expiredLabel={t('p2p.reservationExpired')} />}
            </div>
            <div className="field-row">
              <span className="field-label">{t('p2p.amount')}</span>
              <span className="field-value accent mono">{fmt(match.amount)}</span>
            </div>
            <div className="field-row">
              <span className="field-label">{t('p2p.bank')}</span>
              <span className="field-value">{dest.bankName ?? '—'}</span>
            </div>
            <div className="field-row">
              <span className="field-label">{t('p2p.accountOwner')}</span>
              <span className="field-value">{dest.ownerName ?? '—'}</span>
            </div>
            <CopyableRow label={t('p2p.iban')} value={dest.iban} />
            <CopyableRow label={t('p2p.cardNumber')} value={dest.cardNumber} />
            <CopyableRow label={t('p2p.accountNumber')} value={dest.accountNumber} />
          </div>

          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem', lineHeight: 1.8 }}>
            {t('p2p.depositorHint')}
          </div>

          {awaitingPayment && (
            <>
              <ProofForm match={match} onDone={() => { load(); onChanged?.() }} />
              <button className="btn btn-danger btn-auto" style={{ marginTop: '0.75rem' }} disabled={busy} onClick={cancel}>
                {t('p2p.cancelMatch')}
              </button>
            </>
          )}

          {proof && (
            <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: 8, marginTop: '0.75rem' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>{t('p2p.yourReceipt')}</div>
              <div className="field-row">
                <span className="field-label">{t('p2p.paidAmount')}</span>
                <span className="field-value mono">{fmt(proof.amount)}</span>
              </div>
              {proof.trackingCode && (
                <div className="field-row">
                  <span className="field-label">{t('p2p.trackingCode')}</span>
                  <span className="field-value mono" dir="ltr">{proof.trackingCode}</span>
                </div>
              )}
              {proof.sourceAccount && (
                <div className="field-row">
                  <span className="field-label">{t('p2p.sourceAccount')}</span>
                  <span className="field-value mono" dir="ltr">{proof.sourceAccount}</span>
                </div>
              )}
              <div className="field-row">
                <span className="field-label">{t('p2p.submittedAt')}</span>
                <span className="field-value">{fmtDateTime(proof.submittedAt)}</span>
              </div>
              {proof.ocrMismatch && (
                <Alert type="warning">{t('p2p.receiptMismatch')}</Alert>
              )}
            </div>
          )}

          {match.status === 'PROOF_SUBMITTED' && !proof?.ocrMismatch && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              {t('p2p.proofUnderReview')}
            </div>
          )}

          {match.status === 'WAITING_CONFIRMATION' && (
            <div style={{ marginTop: '0.75rem', fontSize: '0.85rem' }}>
              {t('p2p.waitingWithdrawer')}{' '}
              <Countdown until={match.responseDeadlineAt} expiredLabel={t('p2p.escalatedToAdmin')} />
            </div>
          )}

          {match.status === 'ESCALATED' && (
            <Alert type="warning">{t('p2p.escalatedNotice')}</Alert>
          )}
        </>
      )}
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────

export default function P2pPage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('deposits')
  const [intents, setIntents] = useState([])
  const [withdrawals, setWithdrawals] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [i, w] = await Promise.all([
        p2pApi.listMyIntents({ limit: 20 }).catch(() => ({ items: [] })),
        p2pApi.listMyWithdrawals({ limit: 20 }).catch(() => ({ items: [] })),
      ])
      setIntents(i?.items ?? i ?? [])
      setWithdrawals(w?.items ?? w ?? [])
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || t('p2p.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <div className="card">
        <div className="card-title">{t('p2p.title')}</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.9, margin: 0 }}>
          {t('p2p.intro')}
        </p>
      </div>

      <div className="tabs" style={{ marginTop: '1rem' }}>
        <button className={`tab ${tab === 'deposits' ? 'active' : ''}`} onClick={() => setTab('deposits')}>
          {t('p2p.myDeposits')}{intents.length ? ` (${intents.length})` : ''}
        </button>
        <button className={`tab ${tab === 'withdrawals' ? 'active' : ''}`} onClick={() => setTab('withdrawals')}>
          {t('p2p.myWithdrawals')}{withdrawals.length ? ` (${withdrawals.length})` : ''}
        </button>
      </div>

      {error && <Alert type="error">{error}</Alert>}
      {loading ? <Spinner /> : (
        <div style={{ marginTop: '1rem' }}>
          {tab === 'deposits' ? (
            intents.length
              ? intents.map((i) => <IntentCard key={i.id} intent={i} onChanged={load} />)
              : <div className="card" style={{ color: 'var(--text-muted)' }}>{t('p2p.noDeposits')}</div>
          ) : (
            withdrawals.length
              ? withdrawals.map((w) => <WithdrawalCard key={w.id} request={w} onChanged={load} />)
              : <div className="card" style={{ color: 'var(--text-muted)' }}>{t('p2p.noWithdrawals')}</div>
          )}
        </div>
      )}
    </div>
  )
}
