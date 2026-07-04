import { useEffect, useState, useCallback } from 'react'
import { walletApi, warehouseApi } from '../services/api'
import { Spinner, Alert, Button } from '../components/UI'

const TX_BADGE = {
  completed: 'badge-success',
  pending: 'badge-warning',
  processing: 'badge-warning',
  failed: 'badge-danger',
  cancelled: 'badge-danger',
  refunded: 'badge-warning'
}

const CREDIT_TYPES = ['DEPOSIT', 'BUY', 'REFERRAL', 'REFUND', 'MATERIAL_DEPOSIT']

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

function DepositModal({ symbolId, symbolSlug, onClose, onDone }) {
  const [weight, setWeight] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!symbolId || !weight) return
    setSubmitting(true)
    setError('')
    try {
      const warehouses = await warehouseApi.getWarehouses()
      const wh = Array.isArray(warehouses) ? warehouses[0] : null
      if (!wh) { setError('No warehouse available. Please try again later.'); return }
      await warehouseApi.createDeposit({
        warehouseId: wh.id,
        weight: Number(weight),
        symbolId,
        notes: notes || undefined,
      })
      onDone()
      onClose()
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to submit deposit')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><div className="gold-dot" style={{ display: 'inline-block', marginRight: 8 }} />Deposit {symbolSlug}</span>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '1.2rem', lineHeight: 1, padding: '0.25rem 0.5rem' }}>✕</button>
        </div>
        {error && <Alert type="error">{error}</Alert>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
          <div className="field">
            <label>Weight (grams)</label>
            <input className="form-input" type="number" step="0.00000001" min="0.00000001"
              value={weight} onChange={(e) => setWeight(e.target.value)} required placeholder="e.g. 10" />
          </div>
          <div className="field">
            <label>Notes (optional)</label>
            <textarea className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)}
              rows={2} placeholder="Any additional information…" />
          </div>
          <Button type="submit" loading={submitting} style={{ alignSelf: 'flex-start' }}>
            Submit Deposit
          </Button>
        </form>
      </div>
    </div>
  )
}

function WithdrawModal({ symbolId, symbolSlug, onClose, onDone }) {
  const [warehouses, setWarehouses] = useState([])
  const [warehouseId, setWarehouseId] = useState('')
  const [weight, setWeight] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      try {
        const list = await warehouseApi.getWarehouses()
        const arr = Array.isArray(list) ? list : []
        setWarehouses(arr)
        if (arr.length > 0) setWarehouseId(arr[0].id)
      } catch (_) {
        setError('Failed to load warehouses')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!symbolId || !weight || !warehouseId) return
    setSubmitting(true)
    setError('')
    try {
      await warehouseApi.createWithdraw({
        warehouseId,
        weight: Number(weight),
        symbolId,
        notes: notes || undefined,
      })
      onDone()
      onClose()
    } catch (e) {
      setError(e?.response?.data?.message || e?.message || 'Failed to submit withdrawal')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()}>
        <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span><div className="gold-dot" style={{ display: 'inline-block', marginRight: 8 }} />Withdraw {symbolSlug}</span>
          <button className="btn btn-ghost" onClick={onClose} style={{ fontSize: '1.2rem', lineHeight: 1, padding: '0.25rem 0.5rem' }}>✕</button>
        </div>
        {error && <Alert type="error">{error}</Alert>}
        {loading ? (
          <div style={{ padding: '2rem', textAlign: 'center' }}><Spinner light /></div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
            <div className="field">
              <label>Warehouse</label>
              <select className="form-input" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} required>
                <option value="">Select warehouse…</option>
                {warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>Weight (grams)</label>
              <input className="form-input" type="number" step="0.00000001" min="0.00000001"
                value={weight} onChange={(e) => setWeight(e.target.value)} required placeholder="e.g. 10" />
            </div>
            <div className="field">
              <label>Notes (optional)</label>
              <textarea className="form-input" value={notes} onChange={(e) => setNotes(e.target.value)}
                rows={2} placeholder="Any additional information…" />
            </div>
            <Button type="submit" loading={submitting} style={{ alignSelf: 'flex-start' }}>
              Submit Withdrawal
            </Button>
          </form>
        )}
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
  const [wallets, setWallets] = useState([])
  const [txs, setTxs] = useState([])
  const [requests, setRequests] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [modal, setModal] = useState(null)

  const load = useCallback(async () => {
    try {
      const [w, t, r] = await Promise.all([
        walletApi.getWallets(),
        walletApi.getTransactions({ limit: 25 }).catch(() => ({ transactions: [] })),
        warehouseApi.getRequests({ limit: '20' }).catch(() => ({ requests: [] })),
      ])
      setWallets(Array.isArray(w) ? w : [])
      setTxs(t?.transactions || [])
      setRequests(Array.isArray(r) ? r : r?.requests || [])
    } catch (_) {
      setError('Failed to load your wallets.')
    } finally {
      setLoading(false)
    }
  }, [])

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
        <h1 className="main-header-title">Wallet</h1>
        <p className="main-header-sub">Your balances across all assets</p>
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <Alert type="error">{error}</Alert>}

        {wallets.length === 0 ? (
          <div className="card"><p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>You don't have any wallets yet.</p></div>
        ) : (
          <div className="wallet-grid animate-fade-up">
            {wallets.map((w) => {
              const sym = w.symbol?.slug || w.symbol?.name || '—'
              const isMaterial = w.symbol?.type === 'material'
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
                  <div className="wallet-bal-row"><span className="k">Available</span><span className="v">{fmt(w.availableBalance)}</span></div>
                  <div className="wallet-bal-row"><span className="k">Locked</span><span className="v">{fmt(w.lockedBalance)}</span></div>
                  {w.status && w.status !== 'ACTIVE' && (
                    <div style={{ marginTop: '0.6rem' }}>
                      <span className="badge badge-danger">{w.status}</span>
                    </div>
                  )}
                  {isMaterial && (
                    <div className="wallet-actions">
                      <Button variant="ghost" onClick={() => setModal({ type: 'deposit', wallet: w })}>
                        Deposit
                      </Button>
                      <Button variant="ghost" onClick={() => setModal({ type: 'withdraw', wallet: w })}>
                        Withdraw
                      </Button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="card animate-fade-up">
          <div className="card-title"><div className="gold-dot" />Recent Transactions</div>
          {txs.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No transactions yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="order-table">
                <thead>
                  <tr>
                    <th>Type</th><th>Asset</th><th>Amount</th><th>Fee</th><th>Status</th><th>Date</th>
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
          <div className="card-title"><div className="gold-dot" />Warehouse Requests</div>
          {requests.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No warehouse requests yet.</p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="order-table">
                <thead>
                  <tr>
                    <th>Type</th><th>Status</th><th>Weight</th><th>Warehouse</th><th>Delivery</th><th>Notes</th><th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => (
                    <tr key={r.id}>
                      <td className={r.type === 'INPUT' ? 'txt-buy' : 'txt-sell'}>{r.type === 'INPUT' ? 'Deposit' : 'Withdraw'}</td>
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
      </div>

      {modal?.type === 'deposit' && (
        <DepositModal
          symbolId={modal.wallet.symbol?.id}
          symbolSlug={modal.wallet.symbol?.slug || modal.wallet.symbol?.name}
          onClose={() => setModal(null)}
          onDone={load}
        />
      )}
      {modal?.type === 'withdraw' && (
        <WithdrawModal
          symbolId={modal.wallet.symbol?.id}
          symbolSlug={modal.wallet.symbol?.slug || modal.wallet.symbol?.name}
          onClose={() => setModal(null)}
          onDone={load}
        />
      )}
    </div>
  )
}
