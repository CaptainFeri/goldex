import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { walletApi, warehouseApi, depositApi, withdrawApi, creditApi } from '../services/api'
import { Spinner, Alert, Button } from '../components/UI'


const TX_BADGE = {
  completed: 'badge-success',
  pending: 'badge-warning',
  processing: 'badge-warning',
  failed: 'badge-danger',
  cancelled: 'badge-danger',
  refunded: 'badge-warning'
}

const CREDIT_TYPES = ['DEPOSIT', 'BUY', 'REFERRAL', 'REFUND', 'MATERIAL_DEPOSIT', 'CREDIT_DEPOSIT', 'CREDIT_WITHDRAWAL', 'CREDIT_LIQUIDATION', 'CREDIT_SETTLEMENT']

const fmt = (n, d = 8) => {
  const num = Number(n)
  if (!isFinite(num)) return '—'
  return num.toLocaleString('en-US', { maximumFractionDigits: d })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

const DWT_BADGE = {
  PENDING: 'badge-warning',
  PROCESSING: 'badge-warning',
  COMPLETED: 'badge-success',
  FAILED: 'badge-danger',
  CANCELLED: 'badge-danger',
}

const cancelReq = async (api, id, onDone, t) => {
  if (!window.confirm(t('wallet.confirmCancelRequest'))) return
  try {
    await api.cancel(id)
    onDone()
  } catch (e) {
    alert(e?.response?.data?.message || e?.message || t('wallet.failedToCancel'))
  }
}

function OcrPreviewBox({ ocr, ocrLoading, ocrEdits, setOcrEdits, imageBase64 }) {
  const { t } = useTranslation()
  if (ocrLoading) {
    return <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, fontSize: 13, color: 'var(--text-muted)' }}>⏳ {t('wallet.processingReceipt')}</div>
  }
  if (!ocr || !ocrEdits) return null

  const handleChange = (field, value) => {
    setOcrEdits((prev) => ({ ...prev, [field]: value }))
  }

  return (
    <div style={{ background: 'var(--bg)', padding: 12, borderRadius: 8, fontSize: 13, lineHeight: 1.8 }}>
      <div style={{ fontWeight: 600, marginBottom: 6, display: 'flex', justifyContent: 'space-between' }}>
        <span>📄 {t('wallet.extractedReceiptData')}</span>
        {ocr.processing_time_ms && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {ocr.processing_time_ms}ms
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
        <label style={{ fontSize: 12 }}>{t('wallet.date')}</label>
        <input className="form-input" value={ocrEdits.date} onChange={(e) => handleChange('date', e.target.value)} placeholder="1402/06/15" />
        <label style={{ fontSize: 12 }}>{t('wallet.amount')}</label>
        <input className="form-input" value={ocrEdits.amount} onChange={(e) => handleChange('amount', e.target.value)} placeholder={t('wallet.amount')} />
        <label style={{ fontSize: 12 }}>{t('wallet.refId')}</label>
        <input className="form-input" value={ocrEdits.transactionId} onChange={(e) => handleChange('transactionId', e.target.value)} placeholder={t('wallet.refId')} />
        <label style={{ fontSize: 12 }}>{t('wallet.cardNumber')}</label>
        <label style={{ fontSize: 12 }}>{t('wallet.sourceIban')}</label>
        <input className="form-input" value={ocrEdits.sourceIban || ''} onChange={(e) => handleChange('sourceIban', e.target.value)} placeholder="IRxxxxxxxxxxxxxxxxxxxxxxxx" dir="ltr" />
        <label style={{ fontSize: 12 }}>{t('wallet.destinationIban')}</label>
        <input className="form-input" value={ocrEdits.destinationIban || ''} onChange={(e) => handleChange('destinationIban', e.target.value)} placeholder="IRxxxxxxxxxxxxxxxxxxxxxxxx" dir="ltr" />
      </div>
      {ocr.raw_text && (
        <details style={{ marginTop: 6 }}>
          <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--text-muted)' }}>{t('wallet.viewRawText')}</summary>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', marginTop: 4, maxHeight: 120, overflow: 'auto' }}>{ocr.raw_text}</pre>
        </details>
      )}
    </div>
  )
}

function DepositModal({ symbolId, symbolSlug, depositTypes: allowedDepositTypes, depositGateways, defaultDepositGateway, onClose, onDone }) {
  const { t } = useTranslation()
  const [type, setType] = useState(allowedDepositTypes?.[0] || 'manual')
  const [gatewayCode, setGatewayCode] = useState(defaultDepositGateway || '')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [pictureFile, setPictureFile] = useState(null)
  const [picturePreview, setPicturePreview] = useState(null)
  const [picturePath, setPicturePath] = useState('')
  const [ocrData, setOcrData] = useState(null)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [ocrImageBase64, setOcrImageBase64] = useState('')
  const [ocrEditsDeposit, setOcrEditsDeposit] = useState(null)
  const [warehouses, setWarehouses] = useState([])
  const [warehouseId, setWarehouseId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [gatewayMsg, setGatewayMsg] = useState('')
  const isWarehouse = type === 'warehouse'
  const isGateway = type === 'payment-gateway'

  useEffect(() => {
    if (allowedDepositTypes?.includes('warehouse')) {
      warehouseApi.getWarehouses().then(setWarehouses).catch(() => {})
    }
  }, [allowedDepositTypes])

  const openGatewayAfterCreate = async (depositId) => {
    const deadline = Date.now() + 60_000
    while (Date.now() < deadline) {
      setGatewayMsg(t('wallet.connectingGateway'))
      await new Promise((r) => setTimeout(r, 2000))
      const d = await depositApi.get(depositId)
      const pay = d?.metadata?.payment
      if (pay?.gatewayUrl) {
        window.open(pay.gatewayUrl, '_blank', 'noopener')
        return
      }
      if (d.status === 'FAILED' || d.status === 'CANCELLED') {
        throw new Error(pay?.error || `${t('wallet.depositLabel')} ${d.status.toLowerCase()}`)
      }
    }
    throw new Error(t('wallet.gatewayTimeout'))
  }

  const handleFileChange = async (e) => {
    const f = e.target.files?.[0] || null
    setPictureFile(f)
    setPicturePreview(f ? URL.createObjectURL(f) : null)
    setOcrData(null)
    setOcrEditsDeposit(null)
    setPicturePath('')
    setOcrImageBase64('')
    if (!f) return
    setOcrLoading(true)
    try {
      const reader = new FileReader()
      reader.onload = async () => {
        const b64 = reader.result.split(',')[1]
        setOcrImageBase64(b64)
      }
      reader.readAsDataURL(f)
      const result = await depositApi.uploadAndOcr(f)
      setPicturePath(result.url)
      const ocrResult = result.ocr
      setOcrData(ocrResult)
      if (ocrResult?.parsed) {
        setOcrEditsDeposit({
          date: ocrResult.parsed.date || '',
          amount: ocrResult.parsed.amount || '',
          transactionId: ocrResult.parsed.transactionId || '',
          sourceIban: ocrResult.parsed.sourceIban || '',
          destinationIban: ocrResult.parsed.destinationIban || '',
        })
      }
    } catch (err) {
      setError(t('wallet.ocrFailed') + ': ' + (err?.response?.data?.message || err.message))
    } finally {
      setOcrLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isWarehouse) {
      if (!symbolId || !warehouseId || !amount) return
    } else {
      if (!symbolId || !amount) return
    }
    setSubmitting(true)
    setError('')
    try {
      if (isWarehouse) {
        await warehouseApi.createDeposit({ warehouseId, weight: Number(amount), symbolId, notes: notes || undefined })
      } else {
        const payload = { symbolId, type, amount: Number(amount), notes: notes || undefined }
        if (isGateway) {
          payload.gatewayCode = gatewayCode || undefined
        }
        if (type === 'manual') {
          payload.picturePath = picturePath || undefined
          if (ocrData) {
            payload.metadata = {
              ocr: {
                ...ocrData,
                parsed: {
                  date: ocrEditsDeposit?.date || ocrData.parsed?.date || null,
                  amount: ocrEditsDeposit?.amount || ocrData.parsed?.amount || null,
                  transactionId: ocrEditsDeposit?.transactionId || ocrData.parsed?.transactionId || null,
                  sourceIban: ocrEditsDeposit?.sourceIban || ocrData.parsed?.sourceIban || null,
                  destinationIban: ocrEditsDeposit?.destinationIban || ocrData.parsed?.destinationIban || null,
                },
              },
            }
          }
        }
        const created = await depositApi.create(payload)
        if (isGateway && created?.id) {
          await openGatewayAfterCreate(created.id)
        }
      }
      onDone()
      onClose()
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || t('wallet.depositFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><div className="gold-dot" style={{ display: 'inline-block', marginInlineEnd: 8 }} />{t('wallet.depositTitle', { symbol: symbolSlug })}</span>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '1.2rem', lineHeight: 1, padding: '0.25rem 0.5rem' }}>✕</button>
        </div>
        {error && <Alert type="error">{error}</Alert>}
        {gatewayMsg && !error && <Alert type="success">{gatewayMsg}</Alert>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          {allowedDepositTypes?.length > 1 && (
            <div className="field">
              <label>{t('wallet.depositType')}</label>
              <select className="form-input" value={type} onChange={(e) => setType(e.target.value)} required>
                {allowedDepositTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}
          {isWarehouse ? (
            <>
              <div className="field">
                <label>{t('wallet.warehouse')}</label>
                <select className="form-input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                  <option value="">{t('wallet.selectWarehouse')}</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}{w.location ? ` — ${w.location}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('wallet.weight')}</label>
                <input className="form-input" type="number" step="0.00000001" min="0.00000001"
                  value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder={t('wallet.weightPlaceholder')} />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label>{t('wallet.amount')}</label>
                <input className="form-input" type="number" step="0.00000001" min="0.00000001"
                  value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder={t('wallet.weightPlaceholder')} />
              </div>
              {isGateway && depositGateways?.length > 0 && (
                <div className="field">
                  <label>{t('wallet.paymentGateway')}</label>
                  <select className="form-input" value={gatewayCode} onChange={(e) => setGatewayCode(e.target.value)} required>
                    <option value="">{t('wallet.selectGateway')}</option>
                    {depositGateways.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}
              {type === 'manual' && (
                <div className="field">
                  <label>{t('wallet.receiptPicture')}</label>
                  <input className="form-input" type="file" accept="image/*" onChange={handleFileChange} />
                  {pictureFile && <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{pictureFile.name}</span>}
                  {picturePreview && <img src={picturePreview} alt="preview" style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 6, marginTop: 4 }} />}
                  <OcrPreviewBox ocr={ocrData} ocrLoading={ocrLoading} ocrEdits={ocrEditsDeposit} setOcrEdits={setOcrEditsDeposit} imageBase64={ocrImageBase64} />
                </div>
              )}
            </>
          )}
          <div className="field">
            <label>{t('wallet.notesOptional')}</label>
            <textarea className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2} placeholder={t('wallet.notesPlaceholder')} />
          </div>
          <Button type="submit" loading={submitting} style={{ alignSelf: 'flex-start' }}>
            {t('wallet.submitDeposit')}
          </Button>
        </form>
      </div>
    </div>
  )
}

function WithdrawModal({ symbolId, symbolSlug, withdrawTypes: allowedWithdrawTypes, withdrawGateways, defaultWithdrawGateway, onClose, onDone }) {
  const { t } = useTranslation()
  const [type, setType] = useState(allowedWithdrawTypes?.[0] || 'manual')
  const [gatewayCode, setGatewayCode] = useState(defaultWithdrawGateway || '')
  const [beneficiaryIban, setBeneficiaryIban] = useState('')
  const [beneficiaryName, setBeneficiaryName] = useState('')
  const [beneficiaryId, setBeneficiaryId] = useState('')
  const [amount, setAmount] = useState('')
  const [notes, setNotes] = useState('')
  const [warehouses, setWarehouses] = useState([])
  const [warehouseId, setWarehouseId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const isWarehouse = type === 'warehouse'
  const isGateway = type === 'auto'

  useEffect(() => {
    if (allowedWithdrawTypes?.includes('warehouse')) {
      warehouseApi.getWarehouses().then(setWarehouses).catch(() => {})
    }
  }, [allowedWithdrawTypes])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isWarehouse) {
      if (!symbolId || !warehouseId || !amount) return
    } else {
      if (!symbolId || !amount) return
    }
    setSubmitting(true)
    setError('')
    try {
      if (isWarehouse) {
        await warehouseApi.createWithdraw({ warehouseId, weight: Number(amount), symbolId, notes: notes || undefined })
      } else {
        const payload = { symbolId, type, amount: Number(amount), notes: notes || undefined }
        if (isGateway) {
          payload.gatewayCode = gatewayCode || undefined
          payload.beneficiaryIban = beneficiaryIban || undefined
          payload.beneficiaryName = beneficiaryName || undefined
          payload.beneficiaryId = beneficiaryId || undefined
        }
        await withdrawApi.create(payload)
      }
      onDone()
      onClose()
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || t('wallet.withdrawFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><div className="gold-dot" style={{ display: 'inline-block', marginInlineEnd: 8 }} />{t('wallet.withdrawTitle', { symbol: symbolSlug })}</span>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '1.2rem', lineHeight: 1, padding: '0.25rem 0.5rem' }}>✕</button>
        </div>
        {error && <Alert type="error">{error}</Alert>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          {allowedWithdrawTypes?.length > 1 && (
            <div className="field">
              <label>{t('wallet.withdrawType')}</label>
              <select className="form-input" value={type} onChange={(e) => setType(e.target.value)} required>
                {allowedWithdrawTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          )}
          {isWarehouse ? (
            <>
              <div className="field">
                <label>{t('wallet.warehouse')}</label>
                <select className="form-input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                  <option value="">{t('wallet.selectWarehouse')}</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}{w.location ? ` — ${w.location}` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('wallet.weight')}</label>
                <input className="form-input" type="number" step="0.00000001" min="0.00000001"
                  value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder={t('wallet.weightPlaceholder')} />
              </div>
            </>
          ) : (
            <>
              <div className="field">
                <label>{t('wallet.amount')}</label>
                <input className="form-input" type="number" step="0.00000001" min="0.00000001"
                  value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder={t('wallet.weightPlaceholder')} />
              </div>
              {isGateway && withdrawGateways?.length > 0 && (
                <div className="field">
                  <label>{t('wallet.paymentGateway')}</label>
                  <select className="form-input" value={gatewayCode} onChange={(e) => setGatewayCode(e.target.value)} required>
                    <option value="">{t('wallet.selectGateway')}</option>
                    {withdrawGateways.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
              )}
              {isGateway && (
                <>
                  <div className="field">
                    <label>{t('wallet.beneficiaryIban')}</label>
                    <input className="form-input" value={beneficiaryIban} onChange={(e) => setBeneficiaryIban(e.target.value)} placeholder="IRxxxxxxxxxxxxxxxxxxxxxxxx" dir="ltr" required />
                  </div>
                  <div className="field">
                    <label>{t('wallet.beneficiaryName')}</label>
                    <input className="form-input" value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} placeholder={t('wallet.fullNameAsRegistered')} required />
                  </div>
                  <div className="field">
                    <label>{t('wallet.beneficiaryId')}</label>
                    <input className="form-input" value={beneficiaryId} onChange={(e) => setBeneficiaryId(e.target.value)} placeholder={t('wallet.nationalCodeOrPassport')} required />
                  </div>
                </>
              )}
            </>
          )}
          <div className="field">
            <label>{t('wallet.notesOptional')}</label>
            <textarea className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2} placeholder={t('wallet.notesPlaceholder')} />
          </div>
          <Button type="submit" loading={submitting} style={{ alignSelf: 'flex-start' }}>
            {t('wallet.submitWithdrawal')}
          </Button>
        </form>
      </div>
    </div>
  )
}

const REQ_BADGE = {
  PENDING: 'badge-warning',
  APPROVED: 'badge-success',
  COMPLETED: 'badge-success',
  REJECTED: 'badge-danger',
  CANCELLED: 'badge-danger',
}

export default function WalletPage() {
  const { t } = useTranslation()
  const [wallets, setWallets] = useState([])
  const [txs, setTxs] = useState([])
  const [requests, setRequests] = useState([])
  const [deposits, setDeposits] = useState([])
  const [withdraws, setWithdraws] = useState([])
  const [creditOverview, setCreditOverview] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)

  const load = useCallback(async () => {
    try {
      const [w, t, r, d, wd, co] = await Promise.all([
        walletApi.getWallets(),
        walletApi.getTransactions({ limit: 25 }).catch(() => ({ transactions: [] })),
        warehouseApi.getRequests({ limit: '20' }).catch(() => ({ requests: [] })),
        depositApi.list({ limit: 20 }).catch(() => ({ items: [] })),
        withdrawApi.list({ limit: 20 }).catch(() => ({ items: [] })),
        creditApi.getOverview().catch(() => null),
      ])
      setWallets(Array.isArray(w) ? w : [])
      setTxs(t?.transactions || [])
      setRequests(Array.isArray(r) ? r : r?.requests || [])
      setDeposits(d?.items || [])
      setWithdraws(wd?.items || [])
      setCreditOverview(co || null)
    } catch (_) {
      setError(t('wallet.walletLoadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load()
    const t = setInterval(load, 8000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [load])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Spinner light />
    </div>
  )

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <h1 className="main-header-title">{t('wallet.title')}</h1>
        <p className="main-header-sub">{t('wallet.subtitle')}</p>
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <Alert type="error">{error}</Alert>}

        {wallets.length === 0 ? (
          <div className="card"><p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('wallet.noWallets')}</p></div>
        ) : (
          <>
            {/* Deposit Wallets */}
            {wallets.filter(w => !w.walletType || w.walletType === 'DEPOSIT').length > 0 && (
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-primary)' }}>
                  {t('wallet.depositWallets')}
                </h3>
                <div className="wallet-grid animate-fade-up">
                  {wallets.filter(w => !w.walletType || w.walletType === 'DEPOSIT').map((w) => {
                    const sym = w.symbol?.slug || w.symbol?.name || '—'
                    return (
                      <div key={w.id} className="wallet-card">
                        <div className="wallet-card-head">
                          <div className="wallet-sym-icon">{(sym[0] || '?').toUpperCase()}</div>
                          <div>
                            <div className="wallet-sym-name">{sym}</div>
                            <div className="wallet-sym-sub">{w.symbol?.name || ''}</div>
                          </div>
                        </div>
                        <div className="wallet-total">{fmt(w.totalBalance)}</div>
                        <div className="wallet-bal-row"><span className="k">{t('wallet.available')}</span><span className="v">{fmt(w.availableBalance)}</span></div>
                        <div className="wallet-bal-row"><span className="k">{t('wallet.locked')}</span><span className="v">{fmt(w.lockedBalance)}</span></div>
                        {Number(w.frozenFreeBalance) > 0 && (
                          <div className="wallet-bal-row"><span className="k">{t('wallet.frozen')}</span><span className="v" style={{ color: 'var(--danger)' }}>{fmt(Number(w.frozenFreeBalance) + Number(w.frozenLockedBalance || 0))}</span></div>
                        )}
                        {w.status && w.status !== 'ACTIVE' && (
                          <div style={{ marginTop: '0.6rem' }}>
                            <span className="badge badge-danger">{w.status}</span>
                          </div>
                        )}
                        <div className="wallet-actions">
                          {w.symbol?.depositTypes?.length > 0 && (
                            <Button variant="ghost" onClick={() => setModal({ type: 'deposit', wallet: w })}>
                              {t('wallet.deposit')}
                            </Button>
                          )}
                          {w.symbol?.withdrawTypes?.length > 0 && (
                            <Button variant="ghost" onClick={() => setModal({ type: 'withdraw', wallet: w })}>
                              {t('wallet.withdraw')}
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Credit Wallets */}
            {wallets.filter(w => w.walletType === 'CREDIT').length > 0 && (
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--gold)' }}>
                  {t('wallet.creditWallets')}
                </h3>
                <div className="wallet-grid animate-fade-up">
                  {wallets.filter(w => w.walletType === 'CREDIT').map((w) => {
                    const sym = w.symbol?.slug || w.symbol?.name || '—'
                    const avail = Number(w.freeBalance) || 0
                    const locked = Number(w.lockedBalance) || 0
                    const cap = Number(w.creditBalance) || 0
                    // Real signed exposure for this symbol (negative = owed —
                    // e.g. sold this asset on credit). Falls back to the
                    // floored capacity-used estimate when no trades have
                    // priced a position yet (no mark price / no orders).
                    const position = creditOverview?.positions?.find(p => p.symbolId === w.symbol?.id)
                    const netXau = position ? Number(position.netXau) || 0 : null
                    const used = netXau !== null ? -netXau : Math.max(0, cap - avail - locked)
                    const isNegative = used < 0
                    return (
                      <div key={w.id} className="wallet-card" style={{ borderColor: 'var(--gold)', borderWidth: '2px' }}>
                        <div className="wallet-card-head">
                          <div className="wallet-sym-icon" style={{ background: 'var(--gold)', color: '#000' }}>{(sym[0] || '?').toUpperCase()}</div>
                          <div>
                            <div className="wallet-sym-name">{sym}</div>
                            <div className="wallet-sym-sub" style={{ color: 'var(--gold)', fontSize: '0.7rem', fontWeight: 600 }}>CREDIT</div>
                          </div>
                        </div>
                        <div className="wallet-total" style={{ color: 'var(--gold)' }}>{fmt(cap || 0)}</div>
                        <div className="wallet-bal-row"><span className="k">{t('wallet.creditLimit')}</span><span className="v" style={{ color: 'var(--gold)' }}>{fmt(cap || 0)}</span></div>
                        <div className="wallet-bal-row"><span className="k">{t('wallet.available')}</span><span className="v" style={{ color: 'var(--gold)' }}>{fmt(avail)}</span></div>
                        <div className="wallet-bal-row">
                          <span className="k">{t('wallet.used')}</span>
                          <span className="v" style={isNegative ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
                            {isNegative ? `-${fmt(Math.abs(used))}` : fmt(used)}
                          </span>
                        </div>
                        {locked > 0 && <div className="wallet-bal-row"><span className="k">{t('wallet.lockedPending')}</span><span className="v">{fmt(locked)}</span></div>}
                        {isNegative && (
                          <div style={{ marginTop: '0.4rem', fontSize: '0.72rem', color: 'var(--danger)' }}>
                            {t('wallet.negativeCreditWarning', { amount: fmt(Math.abs(used)), symbol: sym })}
                          </div>
                        )}
                        {w.status && w.status !== 'ACTIVE' && (
                          <div style={{ marginTop: '0.6rem' }}>
                            <span className="badge badge-danger">{w.status}</span>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Collateral Wallets */}
            {wallets.filter(w => w.walletType === 'COLLATERAL').length > 0 && (
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', color: 'var(--text-muted)' }}>
                  {t('wallet.collateralWallets')}
                </h3>
                <div className="wallet-grid animate-fade-up">
                  {wallets.filter(w => w.walletType === 'COLLATERAL').map((w) => {
                    const sym = w.symbol?.slug || w.symbol?.name || '—'
                    return (
                      <div key={w.id} className="wallet-card" style={{ borderColor: 'var(--text-muted)', borderWidth: '2px', opacity: 0.8 }}>
                        <div className="wallet-card-head">
                          <div className="wallet-sym-icon" style={{ background: 'var(--text-muted)', color: '#fff' }}>{(sym[0] || '?').toUpperCase()}</div>
                          <div>
                            <div className="wallet-sym-name">{sym}</div>
                            <div className="wallet-sym-sub" style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600 }}>COLLATERAL</div>
                          </div>
                        </div>
                        <div className="wallet-total" style={{ color: 'var(--text-muted)' }}>{fmt(w.totalBalance)}</div>
                        <div className="wallet-bal-row"><span className="k">{t('wallet.frozenAmount')}</span><span className="v">{fmt(w.freeBalance)}</span></div>
                        <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          {t('wallet.collateralNote')}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        <div className="card animate-fade-up">
          <div className="card-title"><div className="gold-dot" />{t('wallet.recentTransactions')}</div>
          {txs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('wallet.noTransactions')}</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="order-table">
                <thead>
                  <tr>
                    <th>{t('wallet.type')}</th><th>{t('wallet.asset')}</th><th>{t('wallet.amount')}</th><th>{t('wallet.fee')}</th><th>{t('wallet.status')}</th><th>{t('wallet.date')}</th>
                  </tr>
                </thead>
                <tbody>
                  {txs.map((t) => {
                    const credit = CREDIT_TYPES.includes(t.type)
                    return (
                      <tr key={t.id}>
                        <td className={credit ? 'txt-buy' : 'txt-sell'}>{t.type}</td>
                        <td>{t.symbol?.slug || t.symbol?.name || '—'}</td>
                        <td className={credit ? 'txt-buy' : 'txt-sell'}>
                          {credit ? '+' : '−'}{fmt(Math.abs(t.amount))}
                        </td>
                        <td>{fmt(t.fee)}</td>
                        <td><span className={`badge ${TX_BADGE[t.status] || 'badge-warning'}`}>{t.status}</span></td>
                        <td>{formatDateTime(t.createdAt)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card animate-fade-up">
          <div className="card-title"><div className="gold-dot" />{t('wallet.warehouseRequests')}</div>
          {requests.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('wallet.noRequests')}</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="order-table">
                <thead>
                  <tr>
                    <th>{t('wallet.type')}</th><th>{t('wallet.status')}</th><th>{t('wallet.weight')}</th><th>{t('wallet.warehouse')}</th><th>{t('wallet.delivery')}</th><th>{t('wallet.notes')}</th><th>{t('wallet.created')}</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td className={r.type === 'INPUT' ? 'txt-buy' : 'txt-sell'}>{r.type === 'INPUT' ? t('wallet.depositLabel') : t('wallet.withdrawLabel')}</td>
                      <td><span className={`badge ${REQ_BADGE[r.status] || 'badge-warning'}`}>{r.status}</span></td>
                      <td>{fmt(r.weight)}g</td>
                      <td>{r.warehouse?.name || '—'}</td>
                      <td>{r.deliveryDate ? formatDateTime(r.deliveryDate) : '—'}</td>
                      <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.notes || '—'}</td>
                      <td>{formatDateTime(r.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card animate-fade-up">
          <div className="card-title"><div className="gold-dot" />{t('wallet.depositRequests')}</div>
          {deposits.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('wallet.noRequests')}</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="order-table">
                <thead>
                  <tr>
                    <th>{t('wallet.receiptPicture')}</th><th>{t('wallet.asset')}</th><th>{t('wallet.type')}</th><th>{t('wallet.amount')}</th><th>{t('wallet.status')}</th><th>{t('wallet.created')}</th><th />
                  </tr>
                </thead>
                <tbody>
                  {deposits.map((d) => (
                    <tr key={d.id}>
                      <td>
                        {d.picturePath
                          ? <img src={`/api/v1/deposit/picture/${encodeURIComponent(d.picturePath)}`} alt="pic" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, cursor: 'pointer' }} onClick={() => window.open(`/api/v1/deposit/picture/${encodeURIComponent(d.picturePath)}`, '_blank')} />
                          : '—'}
                      </td>
                      <td>{d.symbol?.slug || d.symbol?.name || '—'}</td>
                      <td>{d.type}</td>
                      <td>{fmt(d.amount)}</td>
                      <td><span className={`badge ${DWT_BADGE[d.status] || 'badge-warning'}`}>{d.status}</span></td>
                      <td>{formatDateTime(d.createAt)}</td>
                      <td>
                        {d.metadata?.payment?.gatewayUrl && (
                          <button className="btn" style={{ marginInlineEnd: 6 }} onClick={() => window.open(d.metadata.payment.gatewayUrl, '_blank', 'noopener')}>
                            {t('wallet.openGateway')}
                          </button>
                        )}
                        {d.status === 'PENDING' && (
                          <button className="btn btn-danger" onClick={() => cancelReq(depositApi, d.id, load, t)}>{t('common.cancel')}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card animate-fade-up">
          <div className="card-title"><div className="gold-dot" />{t('wallet.withdrawRequests')}</div>
          {withdraws.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('wallet.noRequests')}</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="order-table">
                <thead>
                  <tr>
                    <th>{t('wallet.asset')}</th><th>{t('wallet.type')}</th><th>{t('wallet.amount')}</th><th>{t('wallet.status')}</th><th>{t('wallet.created')}</th><th />
                  </tr>
                </thead>
                <tbody>
                  {withdraws.map((w) => (
                    <tr key={w.id}>
                      <td>{w.symbol?.slug || w.symbol?.name || '—'}</td>
                      <td>{w.type}</td>
                      <td>{fmt(w.amount)}</td>
                      <td><span className={`badge ${DWT_BADGE[w.status] || 'badge-warning'}`}>{w.status}</span></td>
                      <td>{formatDateTime(w.createAt)}</td>
                      <td>
                        {w.status === 'PENDING' && (
                          <button className="btn btn-danger" onClick={() => cancelReq(withdrawApi, w.id, load, t)}>{t('common.cancel')}</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {modal?.type === 'deposit' && (
        <DepositModal
          symbolId={modal.wallet.symbol?.id}
          symbolSlug={modal.wallet.symbol?.slug || modal.wallet.symbol?.name}
          depositTypes={modal.wallet.symbol?.depositTypes}
          depositGateways={modal.wallet.symbol?.depositGateways}
          defaultDepositGateway={modal.wallet.symbol?.defaultDepositGateway}
          onClose={() => setModal(null)}
          onDone={load}
        />
      )}
      {modal?.type === 'withdraw' && (
        <WithdrawModal
          symbolId={modal.wallet.symbol?.id}
          symbolSlug={modal.wallet.symbol?.slug || modal.wallet.symbol?.name}
          withdrawTypes={modal.wallet.symbol?.withdrawTypes}
          withdrawGateways={modal.wallet.symbol?.withdrawGateways}
          defaultWithdrawGateway={modal.wallet.symbol?.defaultWithdrawGateway}
          onClose={() => setModal(null)}
          onDone={load}
        />
      )}
    </div>
  )
}
