import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { creditApi, walletApi, levelApi, marketApi } from '../services/api'
import { Spinner, Alert, Button } from '../components/UI'

const fmtNum = (n) => (n ?? 0).toLocaleString('en-US')
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const STATUS_LABELS = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  SETTLED: 'Settled',
  EXPIRED: 'Expired',
  CANCELLED: 'Cancelled',
}

const NOTIF_TYPES = {
  REMINDER: { label: 'Reminder', cls: 'badge-warning' },
  MARGIN_CALL: { label: 'Margin Call', cls: 'badge-danger' },
  EXPIRY_WARNING: { label: 'Expiry Warning', cls: 'badge-warning' },
  SETTLEMENT: { label: 'Settlement', cls: 'badge-success' },
  EXPIRED: { label: 'Expired', cls: 'badge-danger' },
}

function CreditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 24, height: 24 }}>
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
      <circle cx="12" cy="15" r="2" />
    </svg>
  )
}

export default function CreditPage() {
  const { t } = useTranslation()
  const [activeCredit, setActiveCredit] = useState(null)
  const [overview, setOverview] = useState(null)
  const [history, setHistory] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('active') // active | history | notifications

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [active, all, notifs, ovw] = await Promise.all([
        creditApi.getActiveCredit(),
        creditApi.getCredits(),
        creditApi.getNotifications(),
        creditApi.getOverview().catch(() => null),
      ])
      setActiveCredit(active)
      setHistory(Array.isArray(all) ? all : [])
      setNotifications(Array.isArray(notifs) ? notifs : [])
      setOverview(ovw || null)
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to load credit data')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="main-header">
          <h1 className="main-header-title">Credit</h1>
          <p className="main-header-sub">Credit Management & Notifications</p>
        </div>
        <div className="main-body" style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <Spinner />
        </div>
      </div>
    )
  }

  // A credit that triggered a margin call stays ACTIVE but the user's wallets
  // are frozen (blocked) until the admin settles the credit.
  const blocked = activeCredit && (activeCredit.creditOrders || []).some((o) => o?.status === 'MARGIN_CALLED')

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <CreditIcon />
          <div>
            <h1 className="main-header-title">Credit</h1>
            <p className="main-header-sub">Credit Management & Notifications</p>
          </div>
        </div>
      </div>

      <div className="main-body">
        {error && <Alert type="error">{error}</Alert>}

        {blocked && (
          <Alert type="error">
            Your credit triggered a margin call. Your wallets are frozen and you cannot place new orders.
            Please contact support or ask an admin to settle your credit to resume trading.
          </Alert>
        )}

        {/* Active Credit Card */}
        {activeCredit ? (
          <div className="card" style={{ marginBottom: '1.5rem', border: '2px solid var(--gold)' }}>
            <div className="card-title">Active Credit</div>
            <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Credit Code</div>
                <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{activeCredit.creditCode}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Amount</div>
                <div style={{ fontWeight: 600, color: 'var(--gold)' }}>{fmtNum(activeCredit.amount)} IRR</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Status</div>
                <span className={`badge badge-success`}>Active</span>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Expiry Date</div>
                <div style={{ fontWeight: 500 }}>{fmtDate(activeCredit.expireAt)}</div>
              </div>
              {activeCredit.hasCallMargin && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Margin Call</div>
                  <span className="badge badge-warning">{activeCredit.callMarginPercent}%</span>
                </div>
              )}
              {activeCredit.leverage != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Leverage</div>
                  <div style={{ fontWeight: 600, color: 'var(--gold)' }}>{activeCredit.leverage}x</div>
                </div>
              )}
              {activeCredit.creditLimit != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Credit Limit</div>
                  <div style={{ fontWeight: 600 }}>{fmtNum(activeCredit.creditLimit)} IRR</div>
                </div>
              )}
              {(overview?.usedCredit != null || overview?.availableCredit != null) && (
                <>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Used Credit</div>
                    <div style={{ fontWeight: 600, color: 'var(--gold)' }}>{fmtNum(overview.usedCredit)} IRR</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Available Credit</div>
                    <div style={{ fontWeight: 600 }}>{fmtNum(overview.availableCredit)} IRR</div>
                  </div>
                </>
              )}
              {overview?.currentCollateralValue != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Collateral Value</div>
                  <div style={{ fontWeight: 600 }}>{fmtNum(overview.currentCollateralValue)} IRR</div>
                </div>
              )}
              {(overview?.collateralLocked != null || overview?.collateralAmount != null) && (
                <>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Collateral Locked</div>
                    <div style={{ fontWeight: 600, color: 'var(--gold)' }}>{fmtNum(overview.collateralLocked ?? 0)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Collateral Available</div>
                    <div style={{ fontWeight: 600 }}>{fmtNum(overview.collateralAvailable ?? overview.collateralAmount ?? 0)}</div>
                  </div>
                </>
              )}
              {overview?.maxTradeChainDepth != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Max Asset Depth</div>
                  <div style={{ fontWeight: 500 }}>{overview.maxTradeChainDepth}</div>
                </div>
              )}
              {overview?.maxConcurrentOrders != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Max Parallel Trades</div>
                  <div style={{ fontWeight: 500 }}>{overview.maxConcurrentOrders}</div>
                </div>
              )}
              {overview?.maxCreditNotional != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Max Credit Notional</div>
                  <div style={{ fontWeight: 500 }}>{fmtNum(overview.maxCreditNotional)} IRR</div>
                </div>
              )}
              {overview?.maxTotalLockedCollateral != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Max Locked Collateral</div>
                  <div style={{ fontWeight: 500 }}>{(Number(overview.maxTotalLockedCollateral) * 100).toFixed(0)}%</div>
                </div>
              )}
              {activeCredit.drawdownPercent != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Drawdown</div>
                  <div style={{ fontWeight: 500, color: Number(activeCredit.lastDrawdownPercent ?? 0) >= Number(activeCredit.drawdownPercent ?? 100) ? 'var(--red)' : 'inherit' }}>
                    {Number(activeCredit.lastDrawdownPercent ?? 0).toFixed(1)}% / {activeCredit.drawdownPercent}%
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Reminder Every</div>
                <div style={{ fontWeight: 500 }}>{activeCredit.reminderTimerHours} hr</div>
              </div>
              {activeCredit.maxExecutionTradeLevel != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Max Execution Level</div>
                  <div style={{ fontWeight: 500 }}>
                    {(activeCredit.executedTradeLevel ?? 0)} / {activeCredit.maxExecutionTradeLevel}
                  </div>
                </div>
              )}
              {activeCredit.metadata?.increasedWallets?.length ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Increased Wallets</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {activeCredit.metadata.increasedWallets.map((iw, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ fontWeight: 600 }}>{iw.symbolName || iw.symbolId}</span>
                        <span style={{ fontFamily: 'monospace' }}>{fmtNum(iw.amount)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Credit Wallet</div>
                  <div style={{ fontWeight: 500 }}>{activeCredit.metadata?.creditSymbol || 'RIAL'}</div>
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Auto Reminder</div>
                <div className="progress-bar" style={{ background: 'var(--border)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.max(0, Math.min(100, ((new Date(activeCredit.expireAt) - new Date()) / (new Date(activeCredit.expireAt) - new Date(activeCredit.activatedAt || activeCredit.createAt)) * 100)))}%`,
                    height: '100%',
                    background: 'var(--gold)',
                    borderRadius: 4,
                    transition: 'width 0.5s',
                  }} />
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <Button onClick={async () => {
                  if (!window.confirm('Settle this credit? Your credit debt will be repaid and assets released to your deposit wallet.')) return
                  try {
                    await creditApi.settleCredit(activeCredit.id)
                    await load()
                  } catch (err) {
                    alert(err?.response?.data?.message || err.message || 'Settlement failed')
                  }
                }}>
                  Settle Credit
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <CreditRequestForm onCreated={load} />
        )}

        {/* Tabs: History / Notifications */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button
            className={`btn ${tab === 'active' ? '' : 'ghost'}`}
            onClick={() => setTab('active')}
          >
            Credit History
          </button>
          <button
            className={`btn ${tab === 'notifications' ? '' : 'ghost'}`}
            onClick={() => setTab('notifications')}
          >
            Notifications {notifications.filter((n) => !n.isRead).length > 0 && `(${notifications.filter((n) => !n.isRead).length})`}
          </button>
        </div>

        {tab === 'active' && (
          <div className="card">
            <div className="card-title">Credit History</div>
            {history.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No credit history
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="order-table">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Amount</th>
                      <th>Status</th>
                      <th>Created</th>
                      <th>Expiry</th>
                      <th>Settled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((c) => (
                      <tr key={c.id}>
                        <td><code>{c.creditCode}</code></td>
                        <td style={{ color: 'var(--gold)', fontWeight: 600 }}>{fmtNum(c.amount)}</td>
                        <td>
                          <span className={`badge ${
                            c.status === 'ACTIVE' ? 'badge-success' :
                            c.status === 'SUSPENDED' ? 'badge-danger' :
                            c.status === 'SETTLED' ? 'badge-info' :
                            c.status === 'EXPIRED' ? 'badge-danger' :
                            c.status === 'CANCELLED' ? 'badge-secondary' :
                            'badge-warning'
                          }`}>{STATUS_LABELS[c.status] || c.status}</span>
                        </td>
                        <td>{fmtDate(c.createAt)}</td>
                        <td>{fmtDate(c.expireAt)}</td>
                        <td>{fmtDate(c.settledAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === 'notifications' && (
          <div className="card">
            <div className="card-title">Credit Notifications</div>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                No notifications
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem 0' }}>
                {notifications.map((n) => {
                  const nt = NOTIF_TYPES[n.type] || { label: n.type, cls: 'badge-info' }
                  return (
                    <div key={n.id} onClick={() => {
                      if (!n.isRead) {
                        creditApi.markAsRead(n.id).then(() => {
                          setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, isRead: true } : x))
                        }).catch(() => {})
                      }
                    }} style={{
                      padding: '0.75rem 1rem',
                      background: n.isRead ? 'transparent' : 'var(--surface)',
                      borderRadius: 8,
                      borderBottom: '1px solid var(--border)',
                      opacity: n.isRead ? 0.6 : 1,
                      cursor: n.isRead ? 'default' : 'pointer',
                      transition: 'opacity 0.2s',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span className={`badge ${nt.cls}`}>{nt.label}</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{fmtDate(n.sentAt)}</span>
                      </div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{n.message}</div>
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

function CreditRequestForm({ onCreated }) {
  const { t } = useTranslation()
  const [wallets, setWallets] = useState([])
  const [selectedWallet, setSelectedWallet] = useState('')
  const [amount, setAmount] = useState('')
  const [leverage, setLeverage] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [maxLeverage, setMaxLeverage] = useState(10)
  const [maxAmount, setMaxAmount] = useState(0)
  const [creditBaseSymbolId, setCreditBaseSymbolId] = useState(null)
  const [baseSymbolIds, setBaseSymbolIds] = useState([])
  const [pairs, setPairs] = useState([])

  useEffect(() => {
    (async () => {
      try {
        const [level, features] = await Promise.all([levelApi.getMyLevel(), levelApi.getMyFeatures()])
        if (level?.creditMaxLeverage != null) setMaxLeverage(Number(level.creditMaxLeverage))
        if (level?.creditBaseSymbolId) setCreditBaseSymbolId(level.creditBaseSymbolId)
        // Collateral can be either the BASE or the QUOTE symbol of the level's
        // pairs (XAU/IRR → XAU or IRR, XAU/USD → XAU or USD, USD/IRR → USD or IRR).
        // The credit base symbol itself is always eligible.
        const pairIds = (level?.pairs || []).flatMap((p) => [
          p.baseSymbol?.id,
          p.quoteSymbol?.id,
        ]).filter(Boolean)
        setBaseSymbolIds([...new Set([...pairIds, creditBaseSymbolId].filter(Boolean))])
        const maxAmt = features?.CREDIT_MAX_AMOUNT
        const ma = typeof maxAmt === 'object' ? Number(maxAmt?.amount) : Number(maxAmt)
        if (ma > 0) setMaxAmount(ma)
      } catch (_) {}
    })()
    walletApi.getWallets().then((w) => {
      const depositWallets = (w || []).filter((x) => !x.walletType || x.walletType === 'DEPOSIT')
      setWallets(depositWallets)
    }).catch(() => {})
    marketApi.getPairs().then((p) => setPairs(Array.isArray(p) ? p : [])).catch(() => {})
  }, [])

  // Only base-symbol deposit wallets are eligible collateral.
  const eligibleWallets = baseSymbolIds.length > 0
    ? wallets.filter((x) => baseSymbolIds.includes(x.symbol?.id))
    : wallets

  useEffect(() => {
    if (eligibleWallets.length > 0 && !eligibleWallets.some((x) => x.id === selectedWallet)) {
      setSelectedWallet(eligibleWallets[0].id)
    }
  }, [eligibleWallets, selectedWallet])

  const selectedSymId = wallets.find((w) => w.id === selectedWallet)?.symbol?.id
  const isBaseSymbol = selectedSymId === creditBaseSymbolId
  const pair = pairs.find(
    (p) => p.baseSymbol?.id === selectedSymId && p.quoteSymbol?.id === creditBaseSymbolId
  )
  const unitPrice = isBaseSymbol ? 1 : Number(pair?.bestSellGramPrice || pair?.bestSellPrice || 0)
  const lev = Number(leverage) || 0
  const amt = Number(amount) || 0
  const projectedCredit = unitPrice > 0 ? amt * unitPrice * lev : 0
  const maxed = maxAmount > 0 && projectedCredit > maxAmount

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedWallet || !amount || !leverage) {
      setError('Please fill all fields')
      return
    }
    if (maxed) {
      setError(`Projected credit would exceed your level max of ${maxAmount.toLocaleString('en-US')}`)
      return
    }
    setLoading(true)
    setError('')
    try {
      await creditApi.requestCredit({
        depositWalletId: selectedWallet,
        amount: amt,
        leverage: lev,
      })
      onCreated()
    } catch (err) {
      setError(err?.response?.data?.message || err.message || 'Failed to create credit')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div className="card-title">Request Credit Facility</div>
      <form onSubmit={handleSubmit} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && <Alert type="error">{error}</Alert>}
        <div>
          <label style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: 4, display: 'block' }}>Collateral Wallet</label>
          <select
            className="input"
            value={selectedWallet}
            onChange={(e) => setSelectedWallet(e.target.value)}
            style={{ width: '100%' }}
          >
            {eligibleWallets.length === 0 && (
              <option value="">— هیچ دارایی پایه/قیمت‌گذاری‌شده‌ای برای وثیقه موجود نیست —</option>
            )}
            {eligibleWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.symbol?.name || w.symbol?.slug || w.id} — Free: {fmtNum(w.freeBalance)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: 4, display: 'block' }}>Collateral Amount</label>
          <input
            className="input"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount to freeze as collateral"
          />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: 4, display: 'block' }}>
            Leverage: {lev ? `${lev}x` : '—'} (max {maxLeverage}x)
          </label>
          <input
            className="input"
            type="range"
            min="1"
            max={maxLeverage || 10}
            step="0.1"
            value={leverage || 1}
            onChange={(e) => setLeverage(e.target.value)}
            style={{ width: '100%' }}
          />
        </div>

        {unitPrice > 0 && amt > 0 && lev > 0 && (
          <div style={{ background: 'var(--bg)', padding: '0.75rem', borderRadius: 8, fontSize: '0.85rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Collateral value</span>
              <span className="mono">{fmtNum(amt * unitPrice)} IRR</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>Projected credit limit</span>
              <span style={{ color: maxed ? 'var(--danger)' : 'var(--gold)', fontWeight: 600 }} className="mono">
                {fmtNum(projectedCredit)} IRR
              </span>
            </div>
            {maxAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>Level max</span>
                <span className="mono">{fmtNum(maxAmount)} IRR</span>
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              The credit line is issued immediately at creation, based on the current market price.
            </div>
          </div>
        )}

        <Button type="submit" disabled={loading || maxed}>
          {loading ? <Spinner size={16} /> : null}
          {loading ? 'Creating...' : 'Request Credit'}
        </Button>
      </form>
    </div>
  )
}
