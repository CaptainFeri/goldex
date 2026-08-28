import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { warehouseApi, walletApi } from '../services/api'
import { Spinner, Alert, Button } from '../components/UI'

const STATUS_BADGE = {
  PENDING: 'badge-warning',
  APPROVED: 'badge-success',
  COMPLETED: 'badge-success',
  REJECTED: 'badge-danger',
  CANCELLED: 'badge-danger',
}
const PKT_BADGE = {
  PENDING: 'badge-warning',
  IN_WAREHOUSE: 'badge-success',
  WITHDRAWN: 'badge-danger',
  RELEASED: 'badge-info',
  ORPHAN: 'badge-info',
}

const fmt = (n, d = 8) => {
  const num = Number(n)
  if (!isFinite(num)) return '—'
  return num.toLocaleString('en-US', { maximumFractionDigits: d })
}

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })
}

const TAB_KEYS = [
  { key: 'deposit', label: 'tabDeposit' },
  { key: 'withdraw', label: 'tabWithdraw' },
  { key: 'requests', label: 'tabRequests' },
  { key: 'packets', label: 'tabPackets' },
]

export default function WarehousePage() {
  const { t } = useTranslation()
  const [tab, setTab] = useState('deposit')
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [depWarehouseId, setDepWarehouseId] = useState('')
  const [depWeight, setDepWeight] = useState('')
  const [depSymbolId, setDepSymbolId] = useState('')
  const [depNotes, setDepNotes] = useState('')
  const [depSubmitting, setDepSubmitting] = useState(false)

  const [wdWeight, setWdWeight] = useState('')
  const [wdSymbolId, setWdSymbolId] = useState('')
  const [wdNotes, setWdNotes] = useState('')
  const [wdSubmitting, setWdSubmitting] = useState(false)

  const [requests, setRequests] = useState([])
  const [packets, setPackets] = useState([])
  const [warehouses, setWarehouses] = useState([])

  const loadAll = async (keepLoading = false) => {
    try {
      if (!keepLoading) setLoading(true)
      setError('')
      const [r, p, w, wl] = await Promise.all([
        warehouseApi.getRequests({ limit: '50' }).catch(() => ({ requests: [] })),
        warehouseApi.getPackets({ limit: '50' }).catch(() => ({ packets: [] })),
        warehouseApi.getWarehouses().catch(() => []),
        walletApi.getWallets().catch(() => []),
      ])
      setRequests(Array.isArray(r) ? r : r?.requests || [])
      setPackets(Array.isArray(p) ? p : p?.packets || [])
      setWarehouses(Array.isArray(w) ? w : [])
      setWallets(Array.isArray(wl) ? wl : [])
    } catch (_) {
      setError(t('warehouse.dataLoadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAll() }, [t])

  const handleDeposit = async (e) => {
    e.preventDefault()
    if (!depWarehouseId || !depWeight || !depSymbolId) return
    setDepSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const result = await warehouseApi.createDeposit({
        warehouseId: depWarehouseId,
        weight: Number(depWeight),
        symbolId: depSymbolId,
        notes: depNotes || undefined,
      })
      const info = []
      if (result?.deliveryDate) info.push(new Date(result.deliveryDate).toLocaleDateString('en-GB'))
      if (result?.deliveryTime) info.push(result.deliveryTime)
      if (result?.deliveryLocation) info.push(result.deliveryLocation)
      setSuccess(t('warehouse.depositSubmitted', { info: info.join(' · ') }))
      setDepWarehouseId('')
      setDepWeight('')
      setDepSymbolId('')
      setDepNotes('')
      loadAll(true)
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || t('warehouse.depositSubmitFailed'))
    } finally {
      setDepSubmitting(false)
    }
  }

  const handleWithdraw = async (e) => {
    e.preventDefault()
    if (!wdWeight || !wdSymbolId) return
    setWdSubmitting(true)
    setError('')
    setSuccess('')
    try {
      const result = await warehouseApi.createWithdraw({
        weight: Number(wdWeight),
        symbolId: wdSymbolId,
        notes: wdNotes || undefined,
      })
      if (result?.status === 'APPROVED') {
        const info = []
        if (result.deliveryDate) info.push(new Date(result.deliveryDate).toLocaleDateString('en-GB'))
        if (result.deliveryTime) info.push(result.deliveryTime)
        if (result.deliveryLocation) info.push(result.deliveryLocation)
        setSuccess(t('warehouse.withdrawalApproved', { info: info.join(' · ') }))
      } else {
        setSuccess(t('warehouse.withdrawalPending'))
      }
      setWdWeight('')
      setWdSymbolId('')
      setWdNotes('')
      loadAll(true)
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || t('warehouse.withdrawalSubmitFailed'))
    } finally {
      setWdSubmitting(false)
    }
  }

  const handleCancel = async (id) => {
    try {
      await warehouseApi.cancelRequest(id)
      loadAll(true)
    } catch (e) {
      setError(e?.response?.data?.message || t('warehouse.cancelFailed'))
    }
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Spinner light />
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <h1 className="main-header-title">{t('warehouse.title')}</h1>
        <p className="main-header-sub">{t('warehouse.subtitle')}</p>
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <Alert type="error">{error}</Alert>}
        {success && <Alert type="success">{success}</Alert>}

        {/* Tabs */}
        <div className="tabs" style={{ marginBottom: 0 }}>
          {TAB_KEYS.map((t) => (
            <button key={t.key} className={`tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
              {t(`warehouse.${t.label}`)}
            </button>
          ))}
        </div>

        {/* Deposit Tab */}
        {tab === 'deposit' && (
          <div className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />{t('warehouse.depositTitle')}</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {t('warehouse.depositDesc')}
            </p>
            <form onSubmit={handleDeposit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480 }}>
              <div className="field">
                <label>{t('warehouse.warehouse')}</label>
                <select className="form-input" value={depWarehouseId} onChange={(e) => setDepWarehouseId(e.target.value)} required>
                  <option value="">{t('warehouse.warehousePlaceholder')}</option>
                  {warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{t('warehouse.warehouseCapacity', { name: w.name, capacity: fmt(w.capacityRemaining) })}</option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('warehouse.weightGrams')}</label>
                <input className="form-input" type="number" step="0.00000001" min="0.00000001"
                  value={depWeight} onChange={(e) => setDepWeight(e.target.value)} required placeholder={t('warehouse.weightPlaceholder')} />
              </div>
              <div className="field">
                <label>{t('warehouse.symbol')}</label>
                <select className="form-input" value={depSymbolId} onChange={(e) => setDepSymbolId(e.target.value)} required>
                  <option value="">{t('warehouse.symbolPlaceholder')}</option>
                  {wallets.map((w) => (
                    <option key={w.symbol?.id || w.symbolId} value={w.symbol?.id || w.symbolId}>
                      {w.symbol?.slug || w.symbol?.name || t('warehouse.unknown')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('warehouse.notesOptional')}</label>
                <textarea className="form-input" value={depNotes} onChange={(e) => setDepNotes(e.target.value)}
                  rows={2} placeholder={t('warehouse.notesPlaceholder')} />
              </div>
              <Button type="submit" disabled={depSubmitting} style={{ alignSelf: 'flex-start' }}>
                {depSubmitting ? t('warehouse.submitting') : t('warehouse.submitDeposit')}
              </Button>
            </form>
          </div>
        )}

        {/* Withdraw Tab */}
        {tab === 'withdraw' && (
          <div className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />{t('warehouse.withdrawTitle')}</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {t('warehouse.withdrawDesc')}
            </p>
            <form onSubmit={handleWithdraw} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: 480 }}>
              <div className="field">
                <label>{t('warehouse.weightGrams')}</label>
                <input className="form-input" type="number" step="0.00000001" min="0.00000001"
                  value={wdWeight} onChange={(e) => setWdWeight(e.target.value)} required placeholder={t('warehouse.weightPlaceholder')} />
              </div>
              <div className="field">
                <label>{t('warehouse.symbol')}</label>
                <select className="form-input" value={wdSymbolId} onChange={(e) => setWdSymbolId(e.target.value)} required>
                  <option value="">{t('warehouse.symbolPlaceholder')}</option>
                  {wallets.map((w) => (
                    <option key={w.symbol?.id || w.symbolId} value={w.symbol?.id || w.symbolId}>
                      {w.symbol?.slug || w.symbol?.name || t('warehouse.unknown')} — {t('warehouse.balance', { balance: fmt(w.freeBalance || 0) })}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>{t('warehouse.notesOptional')}</label>
                <textarea className="form-input" value={wdNotes} onChange={(e) => setWdNotes(e.target.value)}
                  rows={2} placeholder={t('warehouse.notesPlaceholder')} />
              </div>
              <Button type="submit" disabled={wdSubmitting} style={{ alignSelf: 'flex-start' }}>
                {wdSubmitting ? t('warehouse.submitting') : t('warehouse.submitWithdrawal')}
              </Button>
            </form>
          </div>
        )}

        {/* Requests Tab */}
        {tab === 'requests' && (
          <div className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />{t('warehouse.myRequests')}</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {t('warehouse.requestsDesc')}
            </p>
            {requests.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('warehouse.noRequests')}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="order-table">
                  <thead>
                    <tr>
                      <th>{t('warehouse.type')}</th><th>{t('warehouse.status')}</th><th>{t('warehouse.weightG')}</th><th>{t('warehouse.warehouseCol')}</th><th>{t('warehouse.deliveryCol')}</th><th>{t('warehouse.notesCol')}</th><th>{t('warehouse.createdCol')}</th><th>{t('warehouse.actionCol')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {requests.map((r) => (
                      <tr key={r.id}>
                        <td><span className={`badge ${r.type === 'INPUT' ? 'badge-success' : 'badge-warning'}`}>{r.type}</span></td>
                        <td><span className={`badge ${STATUS_BADGE[r.status] || 'badge-warning'}`}>{r.status}</span></td>
                        <td>{fmt(r.weight)}g</td>
                        <td>{r.warehouse?.name || '—'}</td>
                        <td style={{ maxWidth: 200, whiteSpace: 'normal', fontSize: '0.8rem' }}>
                          {r.deliveryDate ? formatDateTime(r.deliveryDate) : ''}
                          {r.deliveryTime ? ` ${r.deliveryTime}` : ''}
                          {r.deliveryLocation ? <br /> : ''}
                          {r.deliveryLocation || '—'}
                        </td>
                        <td style={{ maxWidth: 150, whiteSpace: 'normal', fontSize: '0.8rem' }}>{r.notes || '—'}</td>
                        <td>{formatDateTime(r.createAt || r.createdAt)}</td>
                        <td>
                          {r.status === 'PENDING' ? (
                            <button className="btn btn-danger sm" onClick={() => handleCancel(r.id)}>
                              {t('warehouse.cancel')}
                            </button>
                          ) : (
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Packets Tab */}
        {tab === 'packets' && (
          <div className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />{t('warehouse.myPackets')}</div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              {t('warehouse.packetsDesc')}
            </p>
            {packets.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('warehouse.noPackets')}</p>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="order-table">
                  <thead>
                    <tr>
                      <th>{t('warehouse.id')}</th><th>{t('warehouse.status')}</th><th>{t('warehouse.weightG')}</th><th>{t('warehouse.apparent')}</th><th>{t('warehouse.wastage')}</th><th>{t('warehouse.warehouseCol')}</th><th>{t('warehouse.ang')}</th><th>{t('warehouse.ayar')}</th><th>{t('warehouse.batch')}</th><th>{t('warehouse.createdCol')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {packets.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{p.idSecure}</td>
                        <td><span className={`badge ${PKT_BADGE[p.status] || 'badge-warning'}`}>{p.status}</span></td>
                        <td>{fmt(p.pureWeight)}g</td>
                        <td>{p.apparentWeight != null ? `${fmt(p.apparentWeight)}g` : '—'}</td>
                        <td>{p.wastage != null ? `${fmt(p.wastage)}g` : '—'}</td>
                        <td>{p.warehouse?.name || '—'}</td>
                        <td>{p.ang != null ? p.ang : '—'}</td>
                        <td>{p.ayar != null ? p.ayar : '—'}</td>
                        <td>{p.batchNumber || '—'}</td>
                        <td>{formatDateTime(p.dateTime || p.createAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
