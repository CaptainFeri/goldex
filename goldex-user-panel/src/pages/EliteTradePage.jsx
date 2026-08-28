import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { marketApi, orderApi, walletApi, orderBookApi, creditApi } from '../services/api'
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

const MESQAL_TO_GRAM = 4.3318

export default function EliteTradePage() {
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
  const [quantity, setQuantity] = useState('')
  const [price, setPrice] = useState('')
  const [placing, setPlacing] = useState(false)
  const [cancelling, setCancelling] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [activeCredit, setActiveCredit] = useState(null)
  const [useCredit, setUseCredit] = useState(false)

  const pairKeys = useMemo(() => pairs.map((p) => p.pairKey).filter(Boolean), [pairs])
  const { prices: live, connected } = useMarketPrices(pairKeys)

  const selected = useMemo(() => pairs.find((p) => p.id === selectedId), [pairs, selectedId])
  const pairMap = useMemo(() => Object.fromEntries(pairs.map((p) => [p.id, p])), [pairs])

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

  const loadOrders = useCallback(async () => {
    try {
      const types = marketAccess?.marketTypes?.filter(Boolean)
      const res = await orderApi.list({
        limit: 20,
        offset: 0,
        status: statusFilter || undefined,
        orderType: 'LIMIT',
        marketTypes: types && types.length > 0 ? types.join(',') : undefined,
      })
      setOrders(res?.orders || [])
    } catch (_) {}
  }, [statusFilter, marketAccess])

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
        setError(t('eliteTrade.marketLoadFailed'))
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [marketAccess, t])

  useEffect(() => { loadOrders() }, [loadOrders])

  useEffect(() => {
    const hasOpen = orders.some((o) => CANCELLABLE.includes(o.status))
    if (!hasOpen) return
    const t = setInterval(() => { loadOrders(); loadWallets(); loadActiveCredit() }, 4000)
    return () => clearInterval(t)
  }, [orders, loadOrders])

  const pr = selected ? priceOf(selected) : { buy: 0, sell: 0, buyGram: 0, sellGram: 0, displayBuyGram: 0, displaySellGram: 0 }
  const marketPrice = side === 'BUY' ? pr.displayBuyGram : pr.sellGram
  const mesghalPrice = side === 'BUY' ? pr.buy : pr.sell
  const effectivePrice = Number(price) || Number(marketPrice)
  const qty = Number(quantity) || 0
  const estTotal = qty * (effectivePrice || 0)
  const decimals = selected?.decimals ?? 2

  useEffect(() => {
    if (marketPrice && !price) setPrice(String(marketPrice))
  }, [selectedId, marketPrice])

  const [depth, setDepth] = useState({ bids: [], asks: [] })

  const loadDepth = useCallback(async () => {
    if (!selectedId) return
    try {
      const data = await orderBookApi.getDepth(selectedId)
      const toGram = (d) => ({ ...d, price: d.price / MESQAL_TO_GRAM })
      setDepth({
        bids: (data.bids || []).map(toGram),
        asks: (data.asks || []).map(toGram),
      })
    } catch (_) {
      /* stale depth is acceptable */
    }
  }, [selectedId])

  useEffect(() => {
    loadDepth()
    const t = setInterval(loadDepth, 3000)
    return () => clearInterval(t)
  }, [loadDepth])

  const commRate = selected ? Number(side === 'BUY' ? selected.buyCommission : selected.sellCommission) || 0 : 0
  const youReceive = side === 'BUY'
    ? qty * (1 - commRate / 100)
    : estTotal * (1 - commRate / 100)
  const youReceiveUnit = side === 'BUY'
    ? (selected?.baseSymbol?.slug || '')
    : (selected?.quoteSymbol?.slug || '')

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

  const blocked = !selected || qty <= 0 || insufficient || belowMin || aboveMax ||
    (!Number(price) || Number(price) <= 0)

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
    if (qty <= 0) { toast.error(t('eliteTrade.enterValidQty')); return }
    if (!Number(price) || Number(price) <= 0) { toast.error(t('eliteTrade.enterLimitPrice')); return }
    if (insufficient) { toast.error(t('eliteTrade.insufficientBalance', { symbol: availSymbol })); return }
    if (belowMin) { toast.error(t('eliteTrade.minimum', { min: fmt(minQ, decimals) })); return }
    if (aboveMax) { toast.error(t('eliteTrade.maximum', { max: fmt(maxQ, decimals) })); return }
    setPlacing(true)
    try {
      await orderApi.create({
        pricePairId: selected.id,
        side,
        orderType: 'LIMIT',
        quantity: qty,
        price: Number(price),
        useCredit: !!(useCredit && activeCredit)
      })
      toast.success(side === 'BUY' ? t('eliteTrade.limitBuyPlaced') : t('eliteTrade.limitSellPlaced'))
      setQuantity('')
      setPrice(marketPrice ? String(marketPrice) : '')
      await Promise.all([loadOrders(), loadWallets(), loadActiveCredit()])
    } catch (err) {
      toast.error(err.response?.data?.message || t('eliteTrade.orderFailed'))
    } finally {
      setPlacing(false)
    }
  }

  const cancelOrder = async (id) => {
    setCancelling(id)
    try {
      await orderApi.cancel(id)
      toast.success(t('eliteTrade.orderCancelled'))
      await Promise.all([loadOrders(), loadWallets(), loadActiveCredit()])
    } catch (err) {
      toast.error(err.response?.data?.message || t('eliteTrade.cancelFailed'))
    } finally {
      setCancelling(null)
    }
  }

  const asks = depth.asks || []
  const bids = depth.bids || []
  const bestAsk = asks.length > 0 ? asks[0].price : 0
  const bestBid = bids.length > 0 ? bids[0].price : 0
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0
  const spreadPercent = bestAsk > 0 ? (spread / bestAsk) * 100 : 0

  const maxAskSize = Math.max(...asks.map((a) => a.size), 1)
  const maxBidSize = Math.max(...bids.map((b) => b.size), 1)

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Spinner light />
    </div>
  )

  const limitKindAllowed = !marketAccess || (marketAccess.marketKinds || []).includes('LIMIT')
  if (!limitKindAllowed) {
    return (
      <div className="animate-fade-in">
        <div className="main-header">
          <h1 className="main-header-title">{t('eliteTrade.title')}</h1>
          <p className="main-header-sub">{t('eliteTrade.subtitle')}</p>
        </div>
        <div className="main-body">
          <div className="card">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {t('eliteTrade.noAccess')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <h1 className="main-header-title">{t('eliteTrade.title')}</h1>
        <p className="main-header-sub">{t('eliteTrade.subtitle')}</p>
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <Alert type="error">{error}</Alert>}

        {pairs.length === 0 ? (
          <div className="card"><p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('eliteTrade.noPairs')}</p></div>
        ) : (
          <div className="elite-grid">
            {/* ── Pair selector ── */}
            <div className="card animate-fade-up" style={{ gridColumn: '1 / -1' }}>
              <div className="card-title" style={{ gap: '1rem', flexWrap: 'wrap' }}>
                {pairs.map((p) => (
                  <button
                    key={p.id}
                    className={`elite-pair-btn ${p.id === selectedId ? 'active' : ''}`}
                    onClick={() => setSelectedId(p.id)}
                  >
                    <span className="elite-pair-name">{pairLabel(p)}</span>
                    <span className="elite-pair-price">{fmt(priceOf(p).buyGram, p.decimals)} / {fmt(priceOf(p).sellGram, p.decimals)}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Order Book ── */}
            <div className="card animate-fade-up">
              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="gold-dot" />{t('eliteTrade.orderBook')}
                </span>
                <span className={`live-dot ${connected ? 'on' : 'off'}`}>
                  <span className="live-pip" />{connected ? t('eliteTrade.live') : t('eliteTrade.offline')}
                </span>
              </div>

              {!connected && asks.length === 0 && bids.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {t('eliteTrade.waitingPrices')}
                </div>
              ) : (
                <div className="ob-container">
                  <div className="ob-side">
                    <div className="ob-header">
                      <span className="ob-h-price">{t('eliteTrade.priceIrr')}</span>
                      <span className="ob-h-size">{t('eliteTrade.amountG')}</span>
                    </div>
                    <div className="ob-rows ob-asks">
                      {asks.length === 0 ? (
                        <div className="ob-empty">{t('eliteTrade.noSellOrders')}</div>
                      ) : (
                        [...asks].reverse().map((a, i) => (
                          <div key={`ask-${i}`} className="ob-row">
                            <div className="ob-bar ob-bar-ask" style={{ width: `${(a.size / maxAskSize) * 100}%` }} />
                            <span className="ob-price ob-ask-price">{fmt(a.price, decimals)}</span>
                            <span className="ob-size">{fmt(a.size, decimals)}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="ob-spread">
                    <span>{t('eliteTrade.spread', { price: fmt(spread, decimals), percent: fmt(spreadPercent, 2) })}</span>
                  </div>

                  <div className="ob-side">
                    <div className="ob-rows ob-bids">
                      {bids.length === 0 ? (
                        <div className="ob-empty">{t('eliteTrade.noBuyOrders')}</div>
                      ) : (
                        bids.map((b, i) => (
                          <div key={`bid-${i}`} className="ob-row">
                            <div className="ob-bar ob-bar-bid" style={{ width: `${(b.size / maxBidSize) * 100}%` }} />
                            <span className="ob-price ob-bid-price">{fmt(b.price, decimals)}</span>
                            <span className="ob-size">{fmt(b.size, decimals)}</span>
                          </div>
                        ))
                      )}
                    </div>
                    <div className="ob-header">
                      <span className="ob-h-price">{t('eliteTrade.priceIrr')}</span>
                      <span className="ob-h-size">{t('eliteTrade.amountG')}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Limit Order Ticket ── */}
            <form className="card animate-fade-up" onSubmit={placeOrder}>
              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="gold-dot" />{t('eliteTrade.limitOrder')}
                </span>
                {selected && <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{pairLabel(selected)}</span>}
              </div>

              <div className="side-toggle">
                <button type="button" className={`side-btn buy ${side === 'BUY' ? 'active' : ''}`} onClick={() => setSide('BUY')}>{t('eliteTrade.buy')}</button>
                <button type="button" className={`side-btn sell ${side === 'SELL' ? 'active' : ''}`} onClick={() => setSide('SELL')}>{t('eliteTrade.sell')}</button>
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

              <div className="ticket-summary">
                <span className="label">
                  {t('eliteTrade.available')} {useCredit && activeCredit ? `(${t('trade.useCredit')})` : ''}
                </span>
                <span className="val" style={{ color: useCredit && activeCredit ? 'var(--gold)' : 'inherit' }}>
                  {fmt(available, side === 'BUY' ? 2 : decimals)} {availSymbol || ''}
                  <button type="button" className="btn-link" style={{ marginInlineStart: 8 }} onClick={setMax}>{t('eliteTrade.max')}</button>
                </span>
              </div>

              <Field
                label={t('eliteTrade.quantityGram')}
                hint={selected ? t('eliteTrade.minMaxGram', { min: fmt(minQ, decimals), max: fmt(maxQ, decimals) }) : ''}
              >
                <input className="form-input" type="number" step="any" min="0" value={quantity}
                  onChange={(e) => setQuantity(e.target.value)} placeholder="0.00" />
              </Field>

              <Field label={t('eliteTrade.limitPrice')}>
                <input className="form-input" type="number" step="any" min="0.01" value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={fmt(marketPrice, decimals)} />
              </Field>

              {mesghalPrice > 0 && (
                <div className="ticket-summary">
                  <span className="label">{t('eliteTrade.priceMesghal')}</span>
                  <span className="val">{fmt(mesghalPrice, decimals)}</span>
                </div>
              )}

              <div className="ticket-summary" style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem' }}>
                <span className="label">{side === 'BUY' ? t('eliteTrade.youPay') : t('eliteTrade.gross')}</span>
                <span className="val">{estTotal > 0 ? fmt(estTotal, 2) : '—'} {selected?.quoteSymbol?.slug || ''}</span>
              </div>

              <div className="ticket-summary">
                <span className="label">{t('eliteTrade.youReceive')} {commRate > 0 ? t('eliteTrade.afterCommission', { rate: commRate }) : ''}</span>
                <span className="val">{youReceive > 0 ? fmt(youReceive, side === 'BUY' ? decimals : 2) : '—'} {youReceiveUnit}</span>
              </div>

              {insufficient && <Alert type="error">{t('eliteTrade.insufficient', { symbol: availSymbol })}</Alert>}
              {belowMin && <Alert type="error">{t('eliteTrade.belowMin', { min: fmt(minQ, decimals) })}</Alert>}
              {aboveMax && <Alert type="error">{t('eliteTrade.aboveMax', { max: fmt(maxQ, decimals) })}</Alert>}

              <div style={{ marginTop: '1rem' }}>
                <Button type="submit" loading={placing} disabled={blocked}
                  variant={side === 'BUY' ? 'primary' : 'secondary'}>
                  {side === 'BUY' ? t('eliteTrade.placeBuyLimit') : t('eliteTrade.placeSellLimit')}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* ── Order history ── */}
        <div className="card animate-fade-up">
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div className="gold-dot" />{t('eliteTrade.limitOrders')}</span>
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.4rem 2.2rem 0.4rem 0.8rem', fontSize: '0.82rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">{t('eliteTrade.allStatuses')}</option>
              <option value="PENDING">{t('eliteTrade.pending')}</option>
              <option value="PARTIALLY_COMPLETED">{t('eliteTrade.partiallyCompleted')}</option>
              <option value="COMPLETED">{t('eliteTrade.completed')}</option>
              <option value="CANCELLED">{t('eliteTrade.cancelled')}</option>
              <option value="REJECTED">{t('eliteTrade.rejected')}</option>
            </select>
          </div>
          {orders.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {statusFilter ? t('eliteTrade.noOrdersStatus') : t('eliteTrade.noOrders')}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="order-table">
                <thead>
                  <tr>
                    <th>{t('eliteTrade.pair')}</th><th>{t('eliteTrade.side')}</th><th>{t('eliteTrade.qty')}</th><th>{t('eliteTrade.price')}</th><th>{t('eliteTrade.filled')}</th><th>{t('eliteTrade.total')}</th><th>{t('eliteTrade.status')}</th><th>{t('eliteTrade.date')}</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const p = pairMap[o.pricePairId] || o.pricePair
                    const d = p?.decimals ?? 2
                    return (
                      <tr key={o.id}>
                        <td>{p ? pairLabel(p) : '—'}</td>
                        <td className={o.side === 'BUY' ? 'txt-buy' : 'txt-sell'}>{o.side === 'BUY' ? t('eliteTrade.buy') : t('eliteTrade.sell')}</td>
                        <td>{fmt(o.quantity, d)}</td>
                        <td>{fmt(o.averagePrice > 0 ? o.averagePrice : o.price, d)}</td>
                        <td>{fmt(o.executedQuantity, d)}</td>
                        <td>{fmt(o.totalValue, 2)}</td>
                        <td><span className={`badge ${STATUS_BADGE[o.status] || 'badge-warning'}`}>{t(`eliteTrade.${ORDER_STATUS_KEY[o.status] || 'pending'}`)}</span></td>
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
