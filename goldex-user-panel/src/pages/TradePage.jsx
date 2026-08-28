import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { marketApi, orderApi, walletApi, creditApi } from '../services/api'
import { useMarketPrices } from '../hooks/useMarketPrices'
import { Spinner, Alert, Button, Field } from '../components/UI'

const STATUS_BADGE = {
  PENDING: 'badge-warning',
  PARTIALLY_COMPLETED: 'badge-warning',
  COMPLETED: 'badge-success',
  CANCELLED: 'badge-danger',
  REJECTED: 'badge-danger'
}
const CANCELLABLE = ['PENDING', 'PARTIALLY_COMPLETED']

const fmt = (n, d = 2) => {
  const num = Number(n)
  if (!isFinite(num)) return '—'
  return num.toLocaleString('en-US', { maximumFractionDigits: d })
}

const pairLabel = (p) =>
  `${p.baseSymbol?.slug || p.baseSymbol?.name || '—'}/${p.quoteSymbol?.slug || p.quoteSymbol?.name || '—'}`

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

const ORDER_STATUS_KEY = {
  PENDING: 'pending',
  PARTIALLY_COMPLETED: 'partiallyCompleted',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  REJECTED: 'rejected',
}

export default function TradePage() {
  const { t } = useTranslation()
  const toast = useToast()
  const { marketAccess } = useAuth()
  const [pairs, setPairs] = useState([])
  const [orders, setOrders] = useState([])
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const [side, setSide] = useState('BUY')
  const orderType = 'MARKET'
  const [quantity, setQuantity] = useState('')
  const [placing, setPlacing] = useState(false)
  const [cancelling, setCancelling] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [activeCredit, setActiveCredit] = useState(null)
  const [useCredit, setUseCredit] = useState(false)

  // Live prices over the socket, keyed by pairKey
  const pairKeys = useMemo(() => pairs.map((p) => p.pairKey).filter(Boolean), [pairs])
  const { prices: live, connected } = useMarketPrices(pairKeys)

  const selected = useMemo(() => pairs.find((p) => p.id === selectedId), [pairs, selectedId])
  const pairMap = useMemo(() => Object.fromEntries(pairs.map((p) => [p.id, p])), [pairs])

  // Orders settle at the PURE gram price; commission is taken in-kind from what
  // the customer receives. So the trading price is the pure (best) gram price.
  const priceOf = (p) => {
    if (!p) return { buy: 0, sell: 0, buyGram: 0, sellGram: 0, displayBuyGram: 0, displaySellGram: 0 }
    const lp = live[p.pairKey]
    return {
      buy: lp?.bestBuyPrice ?? p.bestBuyPrice ?? 0,
      sell: lp?.bestSellPrice ?? p.bestSellPrice ?? 0,
      buyGram: lp?.bestBuyGramPrice ?? p.bestBuyGramPrice ?? 0,
      sellGram: lp?.bestSellGramPrice ?? p.bestSellGramPrice ?? 0,
      displayBuyGram: lp?.displayBuyGramPrice ?? p.displayBuyGramPrice ?? 0,
      displaySellGram: lp?.displaySellGramPrice ?? p.displaySellGramPrice ?? 0
    }
  }

  const walletFor = (symbolId, walletType = 'DEPOSIT') =>
    wallets.find((w) => w.symbol?.id === symbolId && (!w.walletType || w.walletType === walletType))

  const loadOrders = async () => {
    try {
      const res = await orderApi.list({ limit: 20, offset: 0, status: statusFilter || undefined })
      setOrders(res?.orders || [])
    } catch (_) {}
  }

  const loadWallets = async () => {
    try {
      const w = await walletApi.getWallets()
      setWallets(Array.isArray(w) ? w : [])
    } catch (_) {}
  }

  const loadActiveCredit = async () => {
    try {
      const credit = await creditApi.getActiveCredit()
      setActiveCredit(credit || null)
    } catch (_) {
      setActiveCredit(null)
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        const [list] = await Promise.all([marketApi.getPairs(), loadWallets(), loadActiveCredit()])
        let arr = Array.isArray(list) ? list : []
        const allowedTypes = marketAccess?.marketTypes
        if (allowedTypes && allowedTypes.length > 0) {
          arr = arr.filter((p) => allowedTypes.includes(p.marketType))
        }
        setPairs(arr)
        if (arr.length) setSelectedId(arr[0].id)
      } catch (_) {
        setError(t('trade.marketLoadFailed'))
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [marketAccess, t])

  // (Re)load orders on mount and whenever the status filter changes.
  useEffect(() => { loadOrders() }, [statusFilter])

  // While any order is still open it resolves (success/fail) asynchronously on
  // the provider side — poll so the user sees the outcome and the updated
  // balances without a manual refresh.
  useEffect(() => {
    const hasOpen = orders.some((o) => CANCELLABLE.includes(o.status))
    if (!hasOpen) return
    const t = setInterval(() => { loadOrders(); loadWallets(); loadActiveCredit() }, 4000)
    return () => clearInterval(t)
  }, [orders])

  const pr = selected ? priceOf(selected) : { buy: 0, sell: 0, buyGram: 0, sellGram: 0, displayBuyGram: 0, displaySellGram: 0 }
  // Orders are placed and settled PER GRAM. A BUY is charged at the DISPLAY
  // (customer) gram price — the same price the backend locks — while a SELL is
  // valued at the pure gram price (commission taken in gold).
  const marketPrice = side === 'BUY' ? pr.displayBuyGram : pr.sellGram
  const mesghalPrice = side === 'BUY' ? pr.buy : pr.sell
  const effectivePrice = Number(marketPrice)
  const qty = Number(quantity) || 0 // grams
  const estTotal = qty * (effectivePrice || 0)
  const decimals = selected?.decimals ?? 2

  // Commission is taken in-kind from what the user receives.
  const commRate = selected ? Number(side === 'BUY' ? selected.buyCommission : selected.sellCommission) || 0 : 0
  const youReceive = side === 'BUY'
    ? qty * (1 - commRate / 100) // grams of gold
    : estTotal * (1 - commRate / 100) // IRR
  const youReceiveUnit = side === 'BUY'
    ? (selected?.baseSymbol?.slug || '')
    : (selected?.quoteSymbol?.slug || '')

  // ── Balance constraints ──────────────────────────────────
  const walletType = useCredit && activeCredit ? 'CREDIT' : 'DEPOSIT'
  const baseWallet = selected ? walletFor(selected.baseSymbol?.id, walletType) : null
  const quoteWallet = selected ? walletFor(selected.quoteSymbol?.id, walletType) : null

  const creditIssued = useCredit && activeCredit && Number(activeCredit.creditLimit || 0) > 0
  const collateralMatches = useCredit && activeCredit && selected &&
    selected.baseSymbol?.id === activeCredit.collateralSymbolId
  const projectedCredit = collateralMatches
    ? (Number(activeCredit.collateralAmount) || 0) * (pr.sellGram || 0) * (Number(activeCredit.leverage) || 1)
    : 0
  const projectedSellCredit = collateralMatches
    ? (Number(activeCredit.collateralAmount) || 0) * (Number(activeCredit.leverage) || 1)
    : 0

  const available = side === 'BUY'
    ? (useCredit && activeCredit
        ? (creditIssued ? (quoteWallet?.freeBalance || 0) : projectedCredit)
        : (quoteWallet?.creditBalance || quoteWallet?.availableBalance || 0))
    : (useCredit && activeCredit
        ? (creditIssued ? (baseWallet?.freeBalance || 0) : projectedSellCredit)
        : (baseWallet?.creditBalance || baseWallet?.availableBalance || 0))
  const buyAvailable = useCredit && activeCredit
    ? (creditIssued ? (quoteWallet?.freeBalance || 0) : projectedCredit)
    : (quoteWallet?.creditBalance || quoteWallet?.availableBalance || 0)
  const sellAvailable = useCredit && activeCredit
    ? (creditIssued ? (baseWallet?.freeBalance || 0) : projectedSellCredit)
    : (baseWallet?.creditBalance || baseWallet?.availableBalance || 0)
  const availSymbol = side === 'BUY' ? selected?.quoteSymbol?.slug : selected?.baseSymbol?.slug
  const required = side === 'BUY' ? estTotal : qty
  const insufficient = qty > 0 && required > available

  const minQ = side === 'BUY' ? selected?.minBuy : selected?.minSell
  const maxQ = side === 'BUY' ? selected?.maxBuy : selected?.maxSell
  const belowMin = minQ > 0 && qty > 0 && qty < minQ
  const aboveMax = maxQ > 0 && qty > maxQ

  const blocked = !selected || qty <= 0 || insufficient || belowMin || aboveMax

  const setMax = () => {
    if (!selected) return
    if (side === 'BUY') {
      const px = effectivePrice || marketPrice
      if (px > 0) setQuantity(String(Number((available / px).toFixed(8))))
    } else {
      setQuantity(String(available))
    }
  }

  const placeOrder = async (e) => {
    e.preventDefault()
    if (!selected) return
    if (qty <= 0) { toast.error(t('trade.enterValidQty')); return }
    if (insufficient) { toast.error(t('trade.insufficientBalance', { symbol: availSymbol })); return }
    if (belowMin) { toast.error(t('trade.minimum', { min: fmt(minQ, decimals) })); return }
    if (aboveMax) { toast.error(t('trade.maximum', { max: fmt(maxQ, decimals) })); return }
    setPlacing(true)
    try {
      await orderApi.create({
        pricePairId: selected.id,
        side,
        orderType,
        quantity: qty,
        useCredit: !!(useCredit && activeCredit)
      })
      toast.success(side === 'BUY' ? t('trade.buyOrderPlaced') : t('trade.sellOrderPlaced'))
      setQuantity('')
      await Promise.all([loadOrders(), loadWallets(), loadActiveCredit()])
    } catch (err) {
      toast.error(err.response?.data?.message || t('trade.orderFailed'))
    } finally {
      setPlacing(false)
    }
  }

  const cancelOrder = async (id) => {
    setCancelling(id)
    try {
      await orderApi.cancel(id)
      toast.success(t('trade.orderCancelled'))
      await Promise.all([loadOrders(), loadWallets(), loadActiveCredit()])
    } catch (err) {
      toast.error(err.response?.data?.message || t('trade.cancelFailed'))
    } finally {
      setCancelling(null)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Spinner light />
    </div>
  )

  // Access control: MARKET trading must be enabled for this user.
  const marketKindAllowed = !marketAccess || (marketAccess.marketKinds || []).includes('MARKET')
  if (!marketKindAllowed) {
    return (
      <div className="animate-fade-in">
        <div className="main-header">
          <h1 className="main-header-title">{t('trade.title')}</h1>
          <p className="main-header-sub">{t('trade.subtitle')}</p>
        </div>
        <div className="main-body">
          <div className="card">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {t('trade.noAccess')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <h1 className="main-header-title">{t('trade.title')}</h1>
        <p className="main-header-sub">{t('trade.subtitle')}</p>
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <Alert type="error">{error}</Alert>}

        {pairs.length === 0 ? (
          <div className="card"><p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('trade.noPairs')}</p></div>
        ) : (
          <div className="trade-grid">
            {/* Market list */}
            <div className="card animate-fade-up">
              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div className="gold-dot" />{t('trade.markets')}</span>
                <span className={`live-dot ${connected ? 'on' : 'off'}`}>
                  <span className="live-pip" />{connected ? t('trade.live') : t('trade.offline')}
                </span>
              </div>
              <div className="pair-list">
                {pairs.map((p) => {
                  const q = priceOf(p)
                  return (
                    <div
                      key={p.id}
                      className={`pair-row ${p.id === selectedId ? 'active' : ''}`}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <div>
                        <div className="pair-name">{pairLabel(p)}</div>
                        <div className="pair-sub">{p.baseSymbol?.name || ''}</div>
                      </div>
                      <div className="pair-prices">
                        <div className="price-buy">{t('trade.buy')} {fmt(q.buy, p.decimals)}</div>
                        <div className="price-sell">{t('trade.sell')} {fmt(q.sell, p.decimals)}</div>
                        {q.buyGram > 0 && <div className="pair-gram">/g {fmt(q.buyGram, p.decimals)}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Order ticket */}
            <form className="card animate-fade-up" onSubmit={placeOrder}>
              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="gold-dot" />{selected ? pairLabel(selected) : t('trade.order')}
                </span>
              </div>

              <div className="side-toggle">
                <button type="button" className={`side-btn buy ${side === 'BUY' ? 'active' : ''}`} onClick={() => setSide('BUY')}>{t('trade.buy')}</button>
                <button type="button" className={`side-btn sell ${side === 'SELL' ? 'active' : ''}`} onClick={() => setSide('SELL')}>{t('trade.sell')}</button>
              </div>

              <div className="type-toggle">
                <button type="button" className={`type-btn active`}>{t('trade.marketOrder')}</button>
              </div>

              {/* Credit toggle - only show if user has active credit */}
              {activeCredit && (
                <div style={{
                  padding: '0.75rem',
                  background: useCredit ? 'rgba(212, 175, 55, 0.1)' : 'var(--bg)',
                  borderRadius: '8px',
                  border: useCredit ? '1px solid var(--gold)' : '1px solid var(--border)',
                  marginBottom: '0.5rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: useCredit ? '0.5rem' : '0' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', margin: 0 }}>
                      <input
                        type="checkbox"
                        checked={useCredit}
                        onChange={(e) => setUseCredit(e.target.checked)}
                        style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                      />
                      <span style={{ fontWeight: 600, color: useCredit ? 'var(--gold)' : 'inherit' }}>
                        💳 {t('trade.useCredit')}
                      </span>
                    </label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {t('trade.leverage', { x: activeCredit.leverage })}
                    </span>
                  </div>
                  {useCredit && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span>{t('trade.availBuyCredit')}:</span>
                        <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
                          {fmt(buyAvailable, 0)} IRR
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span>{t('trade.availSellCredit')}:</span>
                        <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
                          {fmt(sellAvailable, decimals)} {selected?.baseSymbol?.slug || 'XAU'}
                        </span>
                      </div>
                      {activeCredit.drawdownPercent != null && (
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{t('trade.drawdown')}:</span>
                          <span style={{
                            color: Number(activeCredit.lastDrawdownPercent || 0) >= Number(activeCredit.drawdownPercent || 100)
                              ? 'var(--danger)' : 'inherit'
                          }}>
                            {Number(activeCredit.lastDrawdownPercent || 0).toFixed(1)}% / {activeCredit.drawdownPercent}%
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Available balance */}
              <div className="ticket-summary">
                <span className="label">
                  {t('trade.available')} {useCredit && activeCredit ? `(${t('trade.useCredit')})` : ''}
                </span>
                <span className="val" style={{ color: useCredit && activeCredit ? 'var(--gold)' : 'inherit' }}>
                  {fmt(available, side === 'BUY' ? 2 : decimals)} {availSymbol || ''}
                  <button type="button" className="btn-link" style={{ marginInlineStart: 8 }} onClick={setMax}>{t('trade.max')}</button>
                </span>
              </div>

              <Field
                label={t('trade.quantityGram')}
                hint={selected ? t('trade.minMaxGram', { min: fmt(minQ, decimals), max: fmt(maxQ, decimals) }) : ''}
              >
                <input className="form-input" type="number" step="any" min="0" value={quantity}
                  onChange={(e) => setQuantity(e.target.value)} placeholder="0.00" />
              </Field>

              <div className="ticket-summary">
                <span className="label">{t('trade.priceGram')} {connected && <span className="live-pip inline" />}</span>
                <span className="val">{fmt(marketPrice, decimals)}</span>
              </div>

              {mesghalPrice > 0 && (
                <div className="ticket-summary">
                  <span className="label">{t('trade.priceMesghal')}</span>
                  <span className="val">{fmt(mesghalPrice, decimals)}</span>
                </div>
              )}

              <div className="ticket-summary" style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem' }}>
                <span className="label">{side === 'BUY' ? t('trade.youPay') : t('trade.gross')}</span>
                <span className="val">{estTotal > 0 ? fmt(estTotal, 2) : '—'} {selected?.quoteSymbol?.slug || ''}</span>
              </div>

              <div className="ticket-summary">
                <span className="label">{t('trade.youReceive')} {commRate > 0 ? t('trade.afterCommission', { rate: commRate }) : ''}</span>
                <span className="val">{youReceive > 0 ? fmt(youReceive, side === 'BUY' ? decimals : 2) : '—'} {youReceiveUnit}</span>
              </div>

              {insufficient && <Alert type="error">{t('trade.insufficient', { symbol: availSymbol })}</Alert>}
              {belowMin && <Alert type="error">{t('trade.belowMin', { min: fmt(minQ, decimals) })}</Alert>}
              {aboveMax && <Alert type="error">{t('trade.aboveMax', { max: fmt(maxQ, decimals) })}</Alert>}

              <div style={{ marginTop: '1rem' }}>
                <Button type="submit" loading={placing} disabled={blocked}
                  variant={side === 'BUY' ? 'primary' : 'secondary'}>
                  {side === 'BUY' ? t('trade.buy') : t('trade.sell')} {selected?.baseSymbol?.slug || selected?.baseSymbol?.name || ''}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Order history */}
        <div className="card animate-fade-up">
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div className="gold-dot" />{t('trade.yourOrders')}</span>
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.4rem 2.2rem 0.4rem 0.8rem', fontSize: '0.82rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">{t('trade.allStatuses')}</option>
              <option value="PENDING">{t('trade.pending')}</option>
              <option value="PARTIALLY_COMPLETED">{t('trade.partiallyCompleted')}</option>
              <option value="COMPLETED">{t('trade.completed')}</option>
              <option value="CANCELLED">{t('trade.cancelled')}</option>
              <option value="REJECTED">{t('trade.rejected')}</option>
            </select>
          </div>
          {orders.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {statusFilter ? t('trade.noOrdersStatus') : t('trade.noOrders')}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="order-table">
                <thead>
                  <tr>
                    <th>{t('trade.pair')}</th><th>{t('trade.side')}</th><th>{t('trade.type')}</th><th>{t('trade.qty')}</th><th>{t('trade.price')}</th><th>{t('trade.total')}</th><th>{t('trade.status')}</th><th>{t('trade.date')}</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const p = pairMap[o.pricePairId] || o.pricePair
                    const d = p?.decimals ?? 2
                    return (
                      <tr key={o.id}>
                        <td>{p ? pairLabel(p) : '—'}</td>
                        <td className={o.side === 'BUY' ? 'txt-buy' : 'txt-sell'}>{o.side === 'BUY' ? t('trade.buy') : t('trade.sell')}</td>
                        <td>{o.orderType}</td>
                        <td>{fmt(o.quantity, d)}</td>
                        <td>{fmt(o.averagePrice > 0 ? o.averagePrice : o.price, d)}</td>
                        <td>{fmt(o.totalValue, 2)}</td>
                        <td><span className={`badge ${STATUS_BADGE[o.status] || 'badge-warning'}`}>{t(`trade.${ORDER_STATUS_KEY[o.status] || 'pending'}`)}</span></td>
                        <td>{formatDateTime(o.createAt || o.createdAt)}</td>
                        <td>
                          {CANCELLABLE.includes(o.status) && (
                            <button className="btn btn-danger" disabled={cancelling === o.id} onClick={() => cancelOrder(o.id)}>
                              {cancelling === o.id ? <Spinner light /> : t('common.cancel')}
                            </button>
                          )}
                        </td>
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
