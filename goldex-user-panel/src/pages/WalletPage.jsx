import { useEffect, useState } from 'react'
import { walletApi } from '../services/api'
import { Spinner, Alert } from '../components/UI'

const TX_BADGE = {
  completed: 'badge-success',
  pending: 'badge-warning',
  processing: 'badge-warning',
  failed: 'badge-danger',
  cancelled: 'badge-danger',
  refunded: 'badge-warning'
}

const CREDIT_TYPES = ['DEPOSIT', 'BUY', 'REFERRAL', 'REFUND']

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

export default function WalletPage() {
  const [wallets, setWallets] = useState([])
  const [txs, setTxs] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = async () => {
    try {
      const [w, t] = await Promise.all([
        walletApi.getWallets(),
        walletApi.getTransactions({ limit: 25 }).catch(() => ({ transactions: [] }))
      ])
      setWallets(Array.isArray(w) ? w : [])
      setTxs(t?.transactions || [])
    } catch (_) {
      setError('Failed to load your wallets.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // Refresh so balances reflect freezes/settlements from pending orders.
    const t = setInterval(load, 8000)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus) }
  }, [])

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

        {/* Balances */}
        {wallets.length === 0 ? (
          <div className="card"><p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>You don't have any wallets yet.</p></div>
        ) : (
          <div className="wallet-grid animate-fade-up">
            {wallets.map((w) => {
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
                  <div className="wallet-bal-row"><span className="k">Available</span><span className="v">{fmt(w.availableBalance)}</span></div>
                  <div className="wallet-bal-row"><span className="k">Locked</span><span className="v">{fmt(w.lockedBalance)}</span></div>
                  {w.status && w.status !== 'ACTIVE' && (
                    <div style={{ marginTop: '0.6rem' }}>
                      <span className="badge badge-danger">{w.status}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Transactions */}
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
      </div>
    </div>
  )
}
