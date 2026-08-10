import { useEffect, useMemo, useState, useCallback } from 'react'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { marketApi, orderApi, walletApi, orderBookApi } from '../services/api'
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

const MESQAL_TO_GRAM = 4.3318

export default function EliteTradePage() {
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

  const pairKeys = useMemo(() => pairs.map((p) => p.pairKey).filter(Boolean), [pairs])
  const { prices: live, connected } = useMarketPrices(pairKeys)

  const selected = useMemo(() => pairs.find((p) => p.id === selectedId), [pairs, selectedId])
  const pairMap = useMemo(() => Object.fromEntries(pairs.map((p) => [p.id, p])), [pairs])

  const priceOf = (p) => {
    if (!p) return { buy: 0, sell: 0, buyGram: 0, sellGram: 0 }
    const lp = live[p.pairKey]
    return {
      buy: lp?.bestBuyPrice ?? p.bestBuyPrice ?? 0,
      sell: lp?.bestSellPrice ?? p.bestSellPrice ?? 0,
      buyGram: lp?.bestBuyGramPrice ?? p.bestBuyGramPrice ?? 0,
      sellGram: lp?.bestSellGramPrice ?? p.bestSellGramPrice ?? 0
    }
  }

  const walletFor = (symbolId) => wallets.find((w) => w.symbol?.id === symbolId)

  const loadOrders = useCallback(async () => {
    try {
      const res = await orderApi.list({ limit: 20, offset: 0, status: statusFilter || undefined, orderType: 'LIMIT' })
      setOrders(res?.orders || [])
    } catch (_) {}
  }, [statusFilter])

  const loadWallets = async () => {
    try {
      const w = await walletApi.getWallets()
      setWallets(Array.isArray(w) ? w : [])
    } catch (_) {}
  }

  useEffect(() => {
    const init = async () => {
      try {
        const [list] = await Promise.all([marketApi.getPairs(), loadWallets()])
        let arr = Array.isArray(list) ? list : []
        // The backend already filters by market type; keep a client-side safety
        // net so pairs outside the user's allowed market types never render.
        const allowedTypes = marketAccess?.marketTypes
        if (allowedTypes && allowedTypes.length > 0) {
          arr = arr.filter((p) => allowedTypes.includes(p.marketType))
        }
        setPairs(arr)
        if (arr.length) setSelectedId(arr[0].id)
      } catch (_) {
        setError('Failed to load the market.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [marketAccess])

  useEffect(() => { loadOrders() }, [loadOrders])

  useEffect(() => {
    const hasOpen = orders.some((o) => CANCELLABLE.includes(o.status))
    if (!hasOpen) return
    const t = setInterval(() => { loadOrders(); loadWallets() }, 4000)
    return () => clearInterval(t)
  }, [orders, loadOrders])

  const pr = selected ? priceOf(selected) : { buy: 0, sell: 0, buyGram: 0, sellGram: 0 }
  const marketPrice = side === 'BUY' ? pr.sellGram : pr.buyGram
  const mesghalPrice = side === 'BUY' ? pr.sell : pr.buy
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
      // Backend returns mesghal prices; convert to per-gram to match the
      // rest of the UI (limit price input, market price display, etc.).
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

  const baseWallet = selected ? walletFor(selected.baseSymbol?.id) : null
  const quoteWallet = selected ? walletFor(selected.quoteSymbol?.id) : null
  const available = side === 'BUY' ? (quoteWallet?.availableBalance ?? 0) : (baseWallet?.availableBalance ?? 0)
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
    if (qty <= 0) { toast.error('Enter a valid quantity.'); return }
    if (!Number(price) || Number(price) <= 0) { toast.error('Enter a limit price.'); return }
    if (insufficient) { toast.error(`Insufficient ${availSymbol} balance.`); return }
    if (belowMin) { toast.error(`Minimum is ${fmt(minQ, decimals)}.`); return }
    if (aboveMax) { toast.error(`Maximum is ${fmt(maxQ, decimals)}.`); return }
    setPlacing(true)
    try {
      await orderApi.create({
        pricePairId: selected.id,
        side,
        orderType: 'LIMIT',
        quantity: qty,
        price: Number(price),
      })
      toast.success(`Limit ${side === 'BUY' ? 'buy' : 'sell'} order placed.`)
      setQuantity('')
      setPrice(marketPrice ? String(marketPrice) : '')
      await Promise.all([loadOrders(), loadWallets()])
    } catch (err) {
      toast.error(err.response?.data?.message || 'Order could not be placed.')
    } finally {
      setPlacing(false)
    }
  }

  const cancelOrder = async (id) => {
    setCancelling(id)
    try {
      await orderApi.cancel(id)
      toast.success('Order cancelled.')
      await Promise.all([loadOrders(), loadWallets()])
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not cancel order.')
    } finally {
      setCancelling(null)
    }
  }

  // -- Order book computations --
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

  // Access control: LIMIT trading must be enabled for this user.
  const limitKindAllowed = !marketAccess || (marketAccess.marketKinds || []).includes('LIMIT')
  if (!limitKindAllowed) {
    return (
      <div className="animate-fade-in">
        <div className="main-header">
          <h1 className="main-header-title">Elite Trade</h1>
          <p className="main-header-sub">Advanced limit order trading with live order book</p>
        </div>
        <div className="main-body">
          <div className="card">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              You do not have access to limit (elite) trading. Please contact support.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <h1 className="main-header-title">Elite Trade</h1>
        <p className="main-header-sub">Advanced limit order trading with live order book</p>
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <Alert type="error">{error}</Alert>}

        {pairs.length === 0 ? (
          <div className="card"><p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No trading pairs are available right now.</p></div>
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
                  <div className="gold-dot" />Order Book
                </span>
                <span className={`live-dot ${connected ? 'on' : 'off'}`}>
                  <span className="live-pip" />{connected ? 'Live' : 'Offline'}
                </span>
              </div>

              {!connected && asks.length === 0 && bids.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  Waiting for live prices…
                </div>
              ) : (
                <div className="ob-container">
                  {/* ASKS */}
                  <div className="ob-side">
                    <div className="ob-header">
                      <span className="ob-h-price">Price (IRR)</span>
                      <span className="ob-h-size">Amount (g)</span>
                    </div>
                    <div className="ob-rows ob-asks">
                      {asks.length === 0 ? (
                        <div className="ob-empty">No sell orders</div>
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

                  {/* Spread */}
                  <div className="ob-spread">
                    <span>Spread {fmt(spread, decimals)} ({fmt(spreadPercent, 2)}%)</span>
                  </div>

                  {/* BIDS */}
                  <div className="ob-side">
                    <div className="ob-rows ob-bids">
                      {bids.length === 0 ? (
                        <div className="ob-empty">No buy orders</div>
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
                      <span className="ob-h-price">Price (IRR)</span>
                      <span className="ob-h-size">Amount (g)</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Limit Order Ticket ── */}
            <form className="card animate-fade-up" onSubmit={placeOrder}>
              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="gold-dot" />Limit Order
                </span>
                {selected && <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>{pairLabel(selected)}</span>}
              </div>

              <div className="side-toggle">
                <button type="button" className={`side-btn buy ${side === 'BUY' ? 'active' : ''}`} onClick={() => setSide('BUY')}>Buy</button>
                <button type="button" className={`side-btn sell ${side === 'SELL' ? 'active' : ''}`} onClick={() => setSide('SELL')}>Sell</button>
              </div>

              <div className="ticket-summary">
                <span className="label">Available</span>
                <span className="val">
                  {fmt(available, side === 'BUY' ? 2 : decimals)} {availSymbol || ''}
                  <button type="button" className="btn-link" style={{ marginLeft: 8 }} onClick={setMax}>Max</button>
                </span>
              </div>

              <Field
                label="Quantity (gram)"
                hint={selected ? `Min ${fmt(minQ, decimals)} · Max ${fmt(maxQ, decimals)} gram` : ''}
              >
                <input className="form-input" type="number" step="any" min="0" value={quantity}
                  onChange={(e) => setQuantity(e.target.value)} placeholder="0.00" />
              </Field>

              <Field label="Limit Price (per gram)">
                <input className="form-input" type="number" step="any" min="0.01" value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  placeholder={fmt(marketPrice, decimals)} />
              </Field>

              {mesghalPrice > 0 && (
                <div className="ticket-summary">
                  <span className="label">Price / mesghal</span>
                  <span className="val">{fmt(mesghalPrice, decimals)}</span>
                </div>
              )}

              <div className="ticket-summary" style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem' }}>
                <span className="label">{side === 'BUY' ? 'You pay' : 'Gross'}</span>
                <span className="val">{estTotal > 0 ? fmt(estTotal, 2) : '—'} {selected?.quoteSymbol?.slug || ''}</span>
              </div>

              <div className="ticket-summary">
                <span className="label">You receive {commRate > 0 ? `(after ${commRate}% commission)` : ''}</span>
                <span className="val">{youReceive > 0 ? fmt(youReceive, side === 'BUY' ? decimals : 2) : '—'} {youReceiveUnit}</span>
              </div>

              {insufficient && <Alert type="error">Insufficient {availSymbol} balance.</Alert>}
              {belowMin && <Alert type="error">Below minimum order of {fmt(minQ, decimals)}.</Alert>}
              {aboveMax && <Alert type="error">Above maximum order of {fmt(maxQ, decimals)}.</Alert>}

              <div style={{ marginTop: '1rem' }}>
                <Button type="submit" loading={placing} disabled={blocked}
                  variant={side === 'BUY' ? 'primary' : 'secondary'}>
                  Place {side === 'BUY' ? 'Buy' : 'Sell'} Limit Order
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* ── Order history ── */}
        <div className="card animate-fade-up">
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div className="gold-dot" />Limit Orders</span>
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.4rem 2.2rem 0.4rem 0.8rem', fontSize: '0.82rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="PARTIALLY_COMPLETED">Partially completed</option>
              <option value="COMPLETED">Completed</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
          {orders.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {statusFilter ? 'No limit orders with this status.' : 'No limit orders yet.'}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="order-table">
                <thead>
                  <tr>
                    <th>Pair</th><th>Side</th><th>Qty</th><th>Price</th><th>Filled</th><th>Total</th><th>Status</th><th>Date</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((o) => {
                    const p = pairMap[o.pricePairId] || o.pricePair
                    const d = p?.decimals ?? 2
                    return (
                      <tr key={o.id}>
                        <td>{p ? pairLabel(p) : '—'}</td>
                        <td className={o.side === 'BUY' ? 'txt-buy' : 'txt-sell'}>{o.side}</td>
                        <td>{fmt(o.quantity, d)}</td>
                        <td>{fmt(o.averagePrice > 0 ? o.averagePrice : o.price, d)}</td>
                        <td>{fmt(o.executedQuantity, d)}</td>
                        <td>{fmt(o.totalValue, 2)}</td>
                        <td><span className={`badge ${STATUS_BADGE[o.status] || 'badge-warning'}`}>{o.status?.replace('_', ' ')}</span></td>
                        <td>{formatDateTime(o.createAt || o.createdAt)}</td>
                        <td>
                          {CANCELLABLE.includes(o.status) && (
                            <button className="btn btn-danger" disabled={cancelling === o.id} onClick={() => cancelOrder(o.id)}>
                              {cancelling === o.id ? <Spinner light /> : 'Cancel'}
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
