import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { creditApi, walletApi, levelApi, marketApi } from '../services/api'
import { Spinner, Alert, Button } from '../components/UI'

const fmtNum = (n) => (n ?? 0).toLocaleString('en-US')
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const statusLabel = (t, s) => t(`credit.status${s ? s.charAt(0) + s.slice(1).toLowerCase() : ''}`)

const NOTIF_TYPES = {
  REMINDER: { key: 'notifReminder', cls: 'badge-warning' },
  MARGIN_CALL: { key: 'notifMarginCall', cls: 'badge-danger' },
  EXPIRY_WARNING: { key: 'notifExpiryWarning', cls: 'badge-warning' },
  SETTLEMENT: { key: 'notifSettlement', cls: 'badge-success' },
  EXPIRED: { key: 'notifExpired', cls: 'badge-danger' },
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
  const [tab, setTab] = useState('active') // active | notifications

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
      setError(err?.response?.data?.message || err.message || t('credit.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="main-header">
          <h1 className="main-header-title">{t('credit.title')}</h1>
          <p className="main-header-sub">{t('credit.subtitle')}</p>
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

  // Auto-reminder progress bar, guarded against a zero/negative window.
  const expireMs = activeCredit ? new Date(activeCredit.expireAt).getTime() : 0
  const activatedMs = activeCredit ? new Date(activeCredit.activatedAt || activeCredit.createAt).getTime() : 0
  const progressPct = expireMs > activatedMs
    ? Math.max(0, Math.min(100, ((expireMs - Date.now()) / (expireMs - activatedMs)) * 100))
    : 0

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <CreditIcon />
          <div>
            <h1 className="main-header-title">{t('credit.title')}</h1>
            <p className="main-header-sub">{t('credit.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="main-body">
        {error && <Alert type="error">{error}</Alert>}

        {blocked && <Alert type="error">{t('credit.blockedMessage')}</Alert>}

        {/* Active Credit Card */}
        {activeCredit ? (
          <div className="card" style={{ marginBottom: '1.5rem', border: '2px solid var(--gold)' }}>
            <div className="card-title">{t('credit.active')}</div>
            <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.creditCode')}</div>
                <div style={{ fontWeight: 600, fontFamily: 'monospace' }}>{activeCredit.creditCode}</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.amount')}</div>
                <div style={{ fontWeight: 600, color: 'var(--gold)' }}>{fmtNum(activeCredit.amount)} IRR</div>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.status')}</div>
                <span className="badge badge-success">{statusLabel(t, 'ACTIVE')}</span>
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.expiryDate')}</div>
                <div style={{ fontWeight: 500 }}>{fmtDate(activeCredit.expireAt)}</div>
              </div>
              {activeCredit.hasCallMargin && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.marginCall')}</div>
                  <span className="badge badge-warning">{activeCredit.callMarginPercent}%</span>
                </div>
              )}
              {activeCredit.leverage != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.leverage')}</div>
                  <div style={{ fontWeight: 600, color: 'var(--gold)' }}>{activeCredit.leverage}x</div>
                </div>
              )}
              {activeCredit.creditLimit != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.creditLimit')}</div>
                  <div style={{ fontWeight: 600 }}>{fmtNum(activeCredit.creditLimit)} IRR</div>
                </div>
              )}
              {(overview?.usedCredit != null || overview?.availableCredit != null) && (
                <>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.usedCredit')}</div>
                    <div style={{ fontWeight: 600, color: 'var(--gold)' }}>{fmtNum(overview.usedCredit)} IRR</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.availableCredit')}</div>
                    <div style={{ fontWeight: 600 }}>{fmtNum(overview.availableCredit)} IRR</div>
                  </div>
                </>
              )}
              {overview?.currentCollateralValue != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.collateralValue')}</div>
                  <div style={{ fontWeight: 600 }}>{fmtNum(overview.currentCollateralValue)} IRR</div>
                </div>
              )}
              {(overview?.collateralLocked != null || overview?.collateralAmount != null) && (
                <>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.collateralLocked')}</div>
                    <div style={{ fontWeight: 600, color: 'var(--gold)' }}>{fmtNum(overview.collateralLocked ?? 0)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.collateralAvailable')}</div>
                    <div style={{ fontWeight: 600 }}>{fmtNum(overview.collateralAvailable ?? overview.collateralAmount ?? 0)}</div>
                  </div>
                </>
              )}
              {overview?.maxTradeChainDepth != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.maxAssetDepth')}</div>
                  <div style={{ fontWeight: 500 }}>{overview.maxTradeChainDepth}</div>
                </div>
              )}
              {overview?.maxConcurrentOrders != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.maxParallelTrades')}</div>
                  <div style={{ fontWeight: 500 }}>{overview.maxConcurrentOrders}</div>
                </div>
              )}
              {overview?.maxCreditNotional != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.maxCreditNotional')}</div>
                  <div style={{ fontWeight: 500 }}>{fmtNum(overview.maxCreditNotional)} IRR</div>
                </div>
              )}
              {overview?.maxTotalLockedCollateral != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.maxLockedCollateral')}</div>
                  <div style={{ fontWeight: 500 }}>{(Number(overview.maxTotalLockedCollateral) * 100).toFixed(0)}%</div>
                </div>
              )}
              {activeCredit.drawdownPercent != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.drawdown')}</div>
                  <div style={{ fontWeight: 500, color: Number(activeCredit.lastDrawdownPercent ?? 0) >= Number(activeCredit.drawdownPercent ?? 100) ? 'var(--red)' : 'inherit' }}>
                    {Number(activeCredit.lastDrawdownPercent ?? 0).toFixed(1)}% / {activeCredit.drawdownPercent}%
                  </div>
                </div>
              )}
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.reminderEvery')}</div>
                <div style={{ fontWeight: 500 }}>{activeCredit.reminderTimerHours} hr</div>
              </div>
              {activeCredit.maxExecutionTradeLevel != null && (
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.maxExecutionLevel')}</div>
                  <div style={{ fontWeight: 500 }}>
                    {(activeCredit.executedTradeLevel ?? 0)} / {activeCredit.maxExecutionTradeLevel}
                  </div>
                </div>
              )}
              {activeCredit.metadata?.increasedWallets?.length ? (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{t('credit.increasedWallets')}</div>
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
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('credit.creditWallet')}</div>
                  <div style={{ fontWeight: 500 }}>{activeCredit.metadata?.creditSymbol || 'RIAL'}</div>
                </div>
              )}
              <div style={{ gridColumn: '1 / -1' }}>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>{t('credit.autoReminder')}</div>
                <div className="progress-bar" style={{ background: 'var(--border)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
                  <div style={{
                    width: `${progressPct}%`,
                    height: '100%',
                    background: 'var(--gold)',
                    borderRadius: 4,
                    transition: 'width 0.5s',
                  }} />
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
                <Button onClick={async () => {
                  if (!window.confirm(t('credit.settleConfirm'))) return
                  try {
                    await creditApi.settleCredit(activeCredit.id)
                    await load()
                  } catch (err) {
                    alert(err?.response?.data?.message || err.message || t('credit.settlementFailed'))
                  }
                }}>
                  {t('credit.settleCredit')}
                </Button>
              </div>
            </div>

            <SettlementWorkflows creditId={activeCredit.id} onChanged={load} />
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
            {t('credit.creditHistory')}
          </button>
          <button
            className={`btn ${tab === 'notifications' ? '' : 'ghost'}`}
            onClick={() => setTab('notifications')}
          >
            {t('credit.notifications')} {notifications.filter((n) => !n.isRead).length > 0 && `(${notifications.filter((n) => !n.isRead).length})`}
          </button>
        </div>

        {tab === 'active' && (
          <div className="card">
            <div className="card-title">{t('credit.creditHistory')}</div>
            {history.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                {t('credit.noHistory')}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="order-table">
                  <thead>
                    <tr>
                      <th>{t('credit.code')}</th>
                      <th>{t('credit.amount')}</th>
                      <th>{t('credit.status')}</th>
                      <th>{t('credit.created')}</th>
                      <th>{t('credit.expiry')}</th>
                      <th>{t('credit.settled')}</th>
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
                          }`}>{statusLabel(t, c.status)}</span>
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
            <div className="card-title">{t('credit.notifications')}</div>
            {notifications.length === 0 ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                {t('credit.noNotifications')}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.5rem 0' }}>
                {notifications.map((n) => {
                  const nt = NOTIF_TYPES[n.type] || { key: null, cls: 'badge-info' }
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
                        <span className={`badge ${nt.cls}`}>{nt.key ? t(`credit.${nt.key}`) : n.type}</span>
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

function SettlementWorkflows({ creditId, onChanged }) {
  const { t } = useTranslation()
  const [items, setItems] = useState(null)

  const load = useCallback(async () => {
    try {
      const data = await creditApi.getSettlements(creditId)
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setItems([])
    }
  }, [creditId])

  useEffect(() => { load() }, [load])

  const act = async (fn) => {
    try {
      await fn()
      await load()
      if (onChanged) onChanged()
    } catch (err) {
      alert(err?.response?.data?.message || err.message || t('credit.settlementFailed'))
    }
  }

  const promptAmount = (label) => {
    const v = window.prompt(label)
    if (v === null || v === '') return null
    return Number(v)
  }

  return (
    <div style={{ padding: '0 1rem 1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{t('credit.settlementWorkflows')}</span>
        <button className="btn ghost" onClick={() => act(() => creditApi.requestSettlement(creditId))}>
          {t('credit.requestSettlement')}
        </button>
      </div>
      {!items ? (
        <div style={{ textAlign: 'center', padding: '0.5rem' }}><Spinner size={16} /></div>
      ) : items.length === 0 ? (
        <div style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('credit.noSettlements')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((s) => (
            <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="badge badge-info">{s.status}</span>
                {s.settlementMethod && <span style={{ fontSize: '0.8rem', fontFamily: 'monospace' }}>{s.settlementMethod}</span>}
              </div>
              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {t('credit.required')}: {fmtNum(s.requiredAmount)} · {t('credit.received')}: {fmtNum(s.receivedAmount)} · {t('credit.funded')}: {fmtNum(s.fundedAmount ?? 0)}
                {Number(s.shortfall) > 0 && ` · ${t('credit.shortfall')}: ${fmtNum(s.shortfall)}`}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(s.status === 'APPROVED' || s.status === 'VALUATED') && (
                  <button className="btn sm" onClick={() => act(() => creditApi.valuateSettlement(creditId, s.id))}>{t('credit.valuate')}</button>
                )}
                {(s.status === 'APPROVED' || s.status === 'VALUATED' || s.status === 'METHOD_SELECTED' || s.status === 'FUNDING_REQUIRED') && (
                  <button className="btn sm" onClick={() => {
                    const m = window.prompt('FULL/NET/TOPUP', s.settlementMethod || 'FULL')
                    if (!m) return
                    act(() => creditApi.selectSettlementMethod(creditId, s.id, m.toUpperCase()))
                  }}>{t('credit.selectMethod')}</button>
                )}
                {(s.status === 'METHOD_SELECTED' || s.status === 'FUNDING_REQUIRED' || s.status === 'READY') && Number(s.shortfall) > 0 && (
                  <button className="btn sm" onClick={() => {
                    const a = promptAmount(t('credit.fund'))
                    if (a === null || !(a > 0)) return
                    act(() => creditApi.fundSettlement(creditId, s.id, a))
                  }}>{t('credit.fund')}</button>
                )}
                {(s.status === 'APPROVED' || s.status === 'VALUATED' || s.status === 'METHOD_SELECTED' || s.status === 'FUNDING_REQUIRED' || s.status === 'READY' || s.status === 'ASSET_RECEIVED' || s.status === 'ASSET_VERIFIED') && (
                  <button className="btn sm" onClick={() => {
                    const a = promptAmount(t('credit.deliver'))
                    if (a === null || !(a > 0)) return
                    act(() => creditApi.deliverAsset(creditId, s.id, a))
                  }}>{t('credit.deliver')}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
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
      setError(t('credit.fillAllFields'))
      return
    }
    if (maxed) {
      setError(t('credit.exceedLevelMax', { max: maxAmount.toLocaleString('en-US') }))
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
      setError(err?.response?.data?.message || err.message || t('credit.createFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="card" style={{ marginBottom: '1.5rem' }}>
      <div className="card-title">{t('credit.requestFacility')}</div>
      <form onSubmit={handleSubmit} style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {error && <Alert type="error">{error}</Alert>}
        <div>
          <label style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: 4, display: 'block' }}>{t('credit.collateralWallet')}</label>
          <select
            className="input"
            value={selectedWallet}
            onChange={(e) => setSelectedWallet(e.target.value)}
            style={{ width: '100%' }}
          >
            {eligibleWallets.length === 0 && (
              <option value="">{t('credit.noEligibleWallets')}</option>
            )}
            {eligibleWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.symbol?.name || w.symbol?.slug || w.id} — {t('credit.free')}: {fmtNum(w.freeBalance)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: 4, display: 'block' }}>{t('credit.collateralAmount')}</label>
          <input
            className="input"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t('credit.collateralAmountPlaceholder')}
          />
        </div>
        <div>
          <label style={{ fontSize: '0.85rem', fontWeight: 500, marginBottom: 4, display: 'block' }}>
            {t('credit.leverage')}: {lev ? `${lev}x` : '—'} ({t('credit.leverageMax', { max: maxLeverage })})
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
              <span style={{ color: 'var(--text-muted)' }}>{t('credit.collateralValueLabel')}</span>
              <span className="mono">{fmtNum(amt * unitPrice)} IRR</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: 'var(--text-muted)' }}>{t('credit.projectedCreditLimit')}</span>
              <span style={{ color: maxed ? 'var(--danger)' : 'var(--gold)', fontWeight: 600 }} className="mono">
                {fmtNum(projectedCredit)} IRR
              </span>
            </div>
            {maxAmount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--text-muted)' }}>{t('credit.levelMax')}</span>
                <span className="mono">{fmtNum(maxAmount)} IRR</span>
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {t('credit.immediateNote')}
            </div>
          </div>
        )}

        <Button type="submit" disabled={loading || maxed}>
          {loading ? <Spinner size={16} /> : null}
          {loading ? t('credit.creating') : t('credit.requestCredit')}
        </Button>
      </form>
    </div>
  )
}
