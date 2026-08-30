import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { creditApi, walletApi, levelApi, marketApi } from '../services/api'
import { Spinner, Alert, Button, Field, ConfirmDialog } from '../components/UI'
import { useToast } from '../context/ToastContext'

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

const STATUS_BADGE = {
  ACTIVE: 'badge-success',
  SUSPENDED: 'badge-danger',
  SETTLED: 'badge-info',
  EXPIRED: 'badge-danger',
  CANCELLED: 'badge-secondary',
  PENDING: 'badge-warning',
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

function KV({ label, value, accent }) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <span className={`field-value ${accent ? 'accent' : ''}`}>{value}</span>
    </div>
  )
}

export default function CreditPage() {
  const { t } = useTranslation()
  const toast = useToast()
  const [activeCredit, setActiveCredit] = useState(null)
  const [overview, setOverview] = useState(null)
  const [history, setHistory] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('history') // history | notifications
  const [confirmSettle, setConfirmSettle] = useState(false)
  const [settling, setSettling] = useState(false)

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

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <Alert type="error">{error}</Alert>}
        {blocked && <Alert type="error">{t('credit.blockedMessage')}</Alert>}

        {activeCredit ? (
          <div className="card animate-fade-up" style={{ border: '2px solid var(--gold)' }}>
            <div className="card-title">
              <div className="gold-dot" />{t('credit.active')}
              <span className="badge badge-success" style={{ marginInlineStart: 'auto' }}>{statusLabel(t, 'ACTIVE')}</span>
            </div>

            <div className="profile-grid">
              <KV label={t('credit.creditCode')} value={<code>{activeCredit.creditCode}</code>} />
              <KV label={t('credit.amount')} value={`${fmtNum(activeCredit.amount)} IRR`} accent />
              <KV label={t('credit.expiryDate')} value={fmtDate(activeCredit.expireAt)} />
              {activeCredit.leverage != null && <KV label={t('credit.leverage')} value={`${activeCredit.leverage}x`} accent />}
              {activeCredit.creditLimit != null && <KV label={t('credit.creditLimit')} value={`${fmtNum(activeCredit.creditLimit)} IRR`} />}
              {overview?.usedCredit != null && <KV label={t('credit.usedCredit')} value={`${fmtNum(overview.usedCredit)} IRR`} accent />}
              {overview?.availableCredit != null && <KV label={t('credit.availableCredit')} value={`${fmtNum(overview.availableCredit)} IRR`} />}
              {overview?.currentCollateralValue != null && <KV label={t('credit.collateralValue')} value={`${fmtNum(overview.currentCollateralValue)} IRR`} />}
              {overview?.collateralLocked != null && <KV label={t('credit.collateralLocked')} value={fmtNum(overview.collateralLocked)} accent />}
              {overview?.collateralAvailable != null && <KV label={t('credit.collateralAvailable')} value={fmtNum(overview.collateralAvailable)} />}
              {activeCredit.drawdownPercent != null && (
                <KV label={t('credit.drawdown')} value={`${(Number(activeCredit.lastDrawdownPercent ?? 0)).toFixed(1)}% / ${activeCredit.drawdownPercent}%`} />
              )}
              {activeCredit.hasCallMargin && (
                <KV label={t('credit.marginCall')} value={<span className="badge badge-warning">{activeCredit.callMarginPercent}%</span>} />
              )}
              {overview?.maxTradeChainDepth != null && <KV label={t('credit.maxAssetDepth')} value={overview.maxTradeChainDepth} />}
              {overview?.maxConcurrentOrders != null && <KV label={t('credit.maxParallelTrades')} value={overview.maxConcurrentOrders} />}
              {overview?.maxCreditNotional != null && <KV label={t('credit.maxCreditNotional')} value={`${fmtNum(overview.maxCreditNotional)} IRR`} />}
              {overview?.maxTotalLockedCollateral != null && <KV label={t('credit.maxLockedCollateral')} value={`${(Number(overview.maxTotalLockedCollateral) * 100).toFixed(0)}%`} />}
              {activeCredit.maxExecutionTradeLevel != null && <KV label={t('credit.maxExecutionLevel')} value={`${activeCredit.executedTradeLevel ?? 0} / ${activeCredit.maxExecutionTradeLevel}`} />}
              <KV label={t('credit.reminderEvery')} value={`${activeCredit.reminderTimerHours} hr`} />
              {activeCredit.metadata?.increasedWallets?.length
                ? <KV label={t('credit.increasedWallets')} value={activeCredit.metadata.increasedWallets.map((iw) => `${iw.symbolName || iw.symbolId}: ${fmtNum(iw.amount)}`).join('، ')} />
                : <KV label={t('credit.creditWallet')} value={activeCredit.metadata?.creditSymbol || 'RIAL'} />}
            </div>

            {/* Auto-reminder progress */}
            <div className="field-row" style={{ marginTop: '1.25rem' }}>
              <span className="field-label">{t('credit.autoReminder')}</span>
              <div style={{ background: 'var(--border)', borderRadius: 4, height: 8, overflow: 'hidden', marginTop: 6 }}>
                <div style={{
                  width: `${progressPct}%`,
                  height: '100%',
                  background: 'var(--gold)',
                  borderRadius: 4,
                  transition: 'width 0.5s',
                }} />
              </div>
            </div>

            {/* Outstanding negative positions block settlement until covered */}
            {(() => {
              const negativePositions = (overview?.positions || []).filter((p) => Number(p.netXau) < 0)
              if (negativePositions.length === 0) return null
              return (
                <div style={{ marginTop: '1.25rem' }}>
                  <Alert type="error">
                    <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>{t('credit.negativePositionsTitle')}</div>
                    <ul style={{ margin: 0, paddingInlineStart: '1.1rem' }}>
                      {negativePositions.map((p) => (
                        <li key={p.symbolId}>
                          {t('credit.negativePositionLine', { amount: fmtNum(Math.abs(Number(p.netXau))), symbol: p.baseSymbolSlug })}
                        </li>
                      ))}
                    </ul>
                  </Alert>
                </div>
              )
            })()}

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
              <Button
                disabled={overview?.settlementEligible === false}
                title={overview?.settlementEligible === false ? t('credit.settleBlockedTooltip') : undefined}
                onClick={() => setConfirmSettle(true)}>
                {t('credit.settleCredit')}
              </Button>
            </div>

            {confirmSettle && (
              <ConfirmDialog
                title={t('credit.settleCredit')}
                message={t('credit.settleConfirm')}
                confirmLabel={t('credit.settleCredit')}
                cancelLabel={t('common.cancel')}
                loading={settling}
                onCancel={() => setConfirmSettle(false)}
                onConfirm={async () => {
                  setSettling(true)
                  try {
                    await creditApi.settleCredit(activeCredit.id)
                    toast.success(t('credit.settlementSucceeded'))
                    setConfirmSettle(false)
                    await load()
                  } catch (err) {
                    toast.error(err?.response?.data?.message || err.message || t('credit.settlementFailed'))
                  } finally {
                    setSettling(false)
                  }
                }}
              />
            )}

            <SettlementWorkflows creditId={activeCredit.id} onChanged={load} />
          </div>
        ) : (
          <CreditRequestForm onCreated={load} />
        )}

        {/* Tabs: History / Notifications */}
        <div className="tabs">
          <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
            {t('credit.creditHistory')}
          </button>
          <button className={`tab ${tab === 'notifications' ? 'active' : ''}`} onClick={() => setTab('notifications')}>
            {t('credit.notifications')}
            {notifications.filter((n) => !n.isRead).length > 0 && ` (${notifications.filter((n) => !n.isRead).length})`}
          </button>
        </div>

        {tab === 'history' && (
          <div className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />{t('credit.creditHistory')}</div>
            {history.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('credit.noHistory')}</p>
            ) : (
              <div className="table-wrap">
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
                        <td className="txt-buy">{fmtNum(c.amount)}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[c.status] || 'badge-warning'}`}>{statusLabel(t, c.status)}</span>
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
          <div className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />{t('credit.notifications')}</div>
            {notifications.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('credit.noNotifications')}</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {notifications.map((n) => {
                  const nt = NOTIF_TYPES[n.type] || { key: null, cls: 'badge-info' }
                  return (
                    <div
                      key={n.id}
                      onClick={() => {
                        if (!n.isRead) {
                          creditApi.markAsRead(n.id).then(() => {
                            setNotifications((prev) => prev.map((x) => x.id === n.id ? { ...x, isRead: true } : x))
                          }).catch(() => {})
                        }
                      }}
                      style={{
                        padding: '0.85rem 1rem',
                        background: n.isRead ? 'transparent' : 'var(--surface)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--border)',
                        opacity: n.isRead ? 0.6 : 1,
                        cursor: n.isRead ? 'default' : 'pointer',
                        transition: 'opacity 0.2s',
                      }}
                    >
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
  const toast = useToast()
  const [items, setItems] = useState(null)
  const [dialog, setDialog] = useState(null) // { kind: 'method'|'fund'|'deliver', settlementId, currentMethod }
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await creditApi.getSettlements(creditId)
      setItems(Array.isArray(data) ? data : [])
    } catch {
      setItems([])
    }
  }, [creditId])

  useEffect(() => { load() }, [load])

  const act = async (fn, successMessage) => {
    try {
      await fn()
      if (successMessage) toast.success(successMessage)
      await load()
      if (onChanged) onChanged()
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || t('credit.settlementFailed'))
    }
  }

  const submitDialog = async (value) => {
    if (!dialog) return
    setSubmitting(true)
    try {
      if (dialog.kind === 'method') {
        await act(() => creditApi.selectSettlementMethod(creditId, dialog.settlementId, value), t('credit.methodSaved'))
      } else if (dialog.kind === 'fund') {
        await act(() => creditApi.fundSettlement(creditId, dialog.settlementId, value), t('credit.fundSaved'))
      } else {
        await act(() => creditApi.deliverAsset(creditId, dialog.settlementId, value), t('credit.deliverSaved'))
      }
      setDialog(null)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>{t('credit.settlementWorkflows')}</span>
        <Button variant="ghost" onClick={() => act(() => creditApi.requestSettlement(creditId), t('credit.settlementRequested'))}>
          {t('credit.requestSettlement')}
        </Button>
      </div>
      {!items ? (
        <div style={{ textAlign: 'center', padding: '0.5rem' }}><Spinner size={16} /></div>
      ) : items.length === 0 ? (
        <div style={{ padding: '0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{t('credit.noSettlements')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {items.map((s) => (
            <div key={s.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1rem', display: 'flex', flexDirection: 'column', gap: 6 }}>
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
                  <button className="btn sm" onClick={() => act(() => creditApi.valuateSettlement(creditId, s.id), t('credit.valuated'))}>{t('credit.valuate')}</button>
                )}
                {(s.status === 'APPROVED' || s.status === 'VALUATED' || s.status === 'METHOD_SELECTED' || s.status === 'FUNDING_REQUIRED') && (
                  <button className="btn sm" onClick={() => setDialog({ kind: 'method', settlementId: s.id, currentMethod: s.settlementMethod })}>{t('credit.selectMethod')}</button>
                )}
                {(s.status === 'METHOD_SELECTED' || s.status === 'FUNDING_REQUIRED' || s.status === 'READY') && Number(s.shortfall) > 0 && (
                  <button className="btn sm" onClick={() => setDialog({ kind: 'fund', settlementId: s.id })}>{t('credit.fund')}</button>
                )}
                {(s.status === 'APPROVED' || s.status === 'VALUATED' || s.status === 'METHOD_SELECTED' || s.status === 'FUNDING_REQUIRED' || s.status === 'READY' || s.status === 'ASSET_RECEIVED' || s.status === 'ASSET_VERIFIED') && (
                  <button className="btn sm" onClick={() => setDialog({ kind: 'deliver', settlementId: s.id })}>{t('credit.deliver')}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <SettlementActionDialog
          kind={dialog.kind}
          currentMethod={dialog.currentMethod}
          submitting={submitting}
          onCancel={() => setDialog(null)}
          onSubmit={submitDialog}
        />
      )}
    </div>
  )
}

function SettlementActionDialog({ kind, currentMethod, submitting, onCancel, onSubmit }) {
  const { t } = useTranslation()
  const [method, setMethod] = useState(currentMethod || 'FULL')
  const [amount, setAmount] = useState('')

  const titles = {
    method: t('credit.selectMethod'),
    fund: t('credit.fund'),
    deliver: t('credit.deliver'),
  }
  const descriptions = {
    method: t('credit.selectMethodHint'),
    fund: t('credit.fundHint'),
    deliver: t('credit.deliverHint'),
  }

  const submit = (e) => {
    e.preventDefault()
    if (kind === 'method') { onSubmit(method); return }
    const n = Number(amount)
    if (!(n > 0)) return
    onSubmit(n)
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 400 }}>
        <div className="card-title">{titles[kind]}</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0.5rem 0 1rem' }}>
          {descriptions[kind]}
        </p>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {kind === 'method' ? (
            <div className="field">
              <label>{t('credit.settlementMethod')}</label>
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                {['FULL', 'NET', 'TOPUP'].map((m) => (
                  <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', fontFamily: 'monospace' }}>
                    <input type="radio" name="settlement-method" value={m} checked={method === m} onChange={() => setMethod(m)} />
                    {m}
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="field">
              <label>{kind === 'fund' ? t('credit.fundAmountLabel') : t('credit.deliverAmountLabel')}</label>
              <input className="form-input" dir="ltr" type="number" step="0.00000001" min="0" autoFocus
                value={amount} onChange={(e) => setAmount(e.target.value)} required />
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
            <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>{t('common.cancel')}</Button>
            <Button type="submit" loading={submitting}>{t('common.submit')}</Button>
          </div>
        </form>
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

  const eligibleWallets = baseSymbolIds.length > 0
    ? wallets.filter((x) => baseSymbolIds.includes(x.symbol?.id))
    : wallets

  useEffect(() => {
    if (eligibleWallets.length > 0 && !eligibleWallets.some((x) => x.id === selectedWallet)) {
      setSelectedWallet(eligibleWallets[0].id)
    }
  }, [eligibleWallets, selectedWallet])

  const selectedWalletObj = wallets.find((w) => w.id === selectedWallet)
  const selectedSymId = selectedWalletObj?.symbol?.id
  const isBaseSymbol = selectedSymId === creditBaseSymbolId
  const pair = pairs.find(
    (p) => p.baseSymbol?.id === selectedSymId && p.quoteSymbol?.id === creditBaseSymbolId
  )
  const unitPrice = isBaseSymbol ? 1 : Number(pair?.bestSellGramPrice || pair?.bestSellPrice || 0)
  const lev = Number(leverage) || 0
  const amt = Number(amount) || 0
  const projectedCredit = unitPrice > 0 ? amt * unitPrice * lev : 0
  const maxed = maxAmount > 0 && projectedCredit > maxAmount

  const availableCollateral = Number(selectedWalletObj?.freeBalance) || 0
  const noBalance = eligibleWallets.length > 0 && availableCollateral <= 0
  const insufficient = amt > 0 && amt > availableCollateral

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedWallet || !amount || !leverage) {
      setError(t('credit.fillAllFields'))
      return
    }
    if (noBalance || insufficient) {
      setError(t('credit.depositFirst'))
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
    <div className="card animate-fade-up">
      <div className="card-title"><div className="gold-dot" />{t('credit.requestFacility')}</div>

      {noBalance && (
        <Alert type="error">{t('credit.depositFirst')}</Alert>
      )}

      <form onSubmit={handleSubmit}>
        {error && <Alert type="error">{error}</Alert>}

        <Field label={t('credit.collateralWallet')}>
          <select
            className="form-input"
            value={selectedWallet}
            onChange={(e) => setSelectedWallet(e.target.value)}
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
        </Field>

        <Field
          label={t('credit.collateralAmount')}
          hint={insufficient ? t('credit.insufficientCollateral') : undefined}
        >
          <input
            className="form-input"
            type="number"
            min="0"
            step="any"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={t('credit.collateralAmountPlaceholder')}
          />
        </Field>

        <Field label={`${t('credit.leverage')}: ${lev ? `${lev}x` : '—'} (${t('credit.leverageMax', { max: maxLeverage })})`}>
          <input
            type="range"
            min="1"
            max={maxLeverage || 10}
            step="0.1"
            value={leverage || 1}
            onChange={(e) => setLeverage(e.target.value)}
            style={{ width: '100%', accentColor: 'var(--gold)' }}
          />
        </Field>

        {unitPrice > 0 && amt > 0 && lev > 0 && (
          <div style={{ marginTop: '0.5rem' }}>
            <div className="ticket-summary">
              <span className="label">{t('credit.collateralValueLabel')}</span>
              <span className="val">{fmtNum(amt * unitPrice)} IRR</span>
            </div>
            <div className="ticket-summary">
              <span className="label">{t('credit.projectedCreditLimit')}</span>
              <span className="val" style={{ color: maxed ? 'var(--danger)' : 'var(--gold)', fontWeight: 600 }}>
                {fmtNum(projectedCredit)} IRR
              </span>
            </div>
            {maxAmount > 0 && (
              <div className="ticket-summary">
                <span className="label">{t('credit.levelMax')}</span>
                <span className="val">{fmtNum(maxAmount)} IRR</span>
              </div>
            )}
            <div style={{ marginTop: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              {t('credit.immediateNote')}
            </div>
          </div>
        )}

        <div style={{ marginTop: '1rem' }}>
          <Button type="submit" disabled={loading || maxed || noBalance || insufficient}>
            {loading ? <Spinner size={16} /> : null}
            {loading ? t('credit.creating') : t('credit.requestCredit')}
          </Button>
        </div>
      </form>
    </div>
  )
}
