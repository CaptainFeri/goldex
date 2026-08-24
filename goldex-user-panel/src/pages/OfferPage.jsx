import { useEffect, useMemo, useState } from 'react'
import { useToast } from '../context/ToastContext'
import { useAuth } from '../context/AuthContext'
import { marketApi, walletApi, quoteRequestApi, creditApi } from '../services/api'
import { useMarketPrices } from '../hooks/useMarketPrices'
import { Spinner, Alert, Button, Field } from '../components/UI'

const STATUS_BADGE = {
  PENDING: 'badge-warning',
  MATCHED: 'badge-success',
  CANCELLED: 'badge-danger',
}
const CANCELLABLE = ['PENDING']

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

export default function OfferPage() {
  const toast = useToast()
  const { marketAccess } = useAuth()
  const [pairs, setPairs] = useState([])
  const [requests, setRequests] = useState([])
  const [wallets, setWallets] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedId, setSelectedId] = useState(null)
  const [side, setSide] = useState('BUY')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('')
  const [placing, setPlacing] = useState(false)
  const [cancelling, setCancelling] = useState(null)
  const [statusFilter, setStatusFilter] = useState('')
  const [activeCredit, setActiveCredit] = useState(null)
  const [useCredit, setUseCredit] = useState(false)

  const pairKeys = useMemo(() => pairs.map((p) => p.pairKey).filter(Boolean), [pairs])
  const { prices: live, connected } = useMarketPrices(pairKeys)

  const selected = useMemo(() => pairs.find((p) => p.id === selectedId), [pairs, selectedId])
  const pairMap = useMemo(() => Object.fromEntries(pairs.map((p) => [p.id, p])), [pairs])

  // The custom market price is chosen by the customer; we prefill it with the
  // live pure gram price so offers quote a fair starting point.
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

  const walletFor = (symbolId, walletType = 'DEPOSIT') =>
    wallets.find((w) => w.symbol?.id === symbolId && (!w.walletType || w.walletType === walletType))

  const loadActiveCredit = async () => {
    try {
      const credit = await creditApi.getActiveCredit()
      setActiveCredit(credit || null)
    } catch (_) {
      setActiveCredit(null)
    }
  }

  // Prefill the price whenever the pair or the side changes (only while the
  // user has not typed a custom value).
  useEffect(() => {
    if (!selected) return
    const pr = priceOf(selected)
    const gram = side === 'BUY' ? pr.buyGram : pr.sellGram
    if (gram > 0) setPrice(String(Number(gram)))
  }, [selectedId, side])

  const loadRequests = async () => {
    try {
      const res = await quoteRequestApi.my()
      let arr = Array.isArray(res) ? res : []
      if (statusFilter) arr = arr.filter((r) => r.status === statusFilter)
      setRequests(arr)
    } catch (_) {}
  }

  const loadWallets = async () => {
    try {
      const w = await walletApi.getWallets()
      setWallets(Array.isArray(w) ? w : [])
    } catch (_) {}
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
        setError('Failed to load the offer market.')
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [marketAccess])

  useEffect(() => { loadRequests() }, [statusFilter])

  // While any custom request is still open (PENDING) it can be matched by
  // another customer at any time — poll so the user sees the outcome without
  // a manual refresh.
  useEffect(() => {
    const hasOpen = requests.some((r) => CANCELLABLE.includes(r.status))
    if (!hasOpen) return
    const t = setInterval(() => { loadRequests(); loadWallets(); loadActiveCredit() }, 4000)
    return () => clearInterval(t)
  }, [requests])

  const pr = selected ? priceOf(selected) : { buy: 0, sell: 0, buyGram: 0, sellGram: 0 }
  const marketPrice = side === 'BUY' ? pr.buyGram : pr.sellGram
  const mesghalPrice = side === 'BUY' ? pr.buy : pr.sell
  const askPrice = Number(price) || 0
  const qty = Number(quantity) || 0 // grams
  const estTotal = qty * askPrice
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

  // The credit line is only issued by the backend on the first request. Before
  // that, project the balances from the frozen collateral and the current pair
  // price: BUY = collateral × price × leverage (IRR), SELL = collateral ×
  // leverage (XAU).
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
  const availSymbol = side === 'BUY' ? selected?.quoteSymbol?.slug : selected?.baseSymbol?.slug
  const required = side === 'BUY' ? estTotal : qty
  const insufficient = qty > 0 && required > available

  const minQ = side === 'BUY' ? selected?.minBuy : selected?.minSell
  const maxQ = side === 'BUY' ? selected?.maxBuy : selected?.maxSell
  const belowMin = minQ > 0 && qty > 0 && qty < minQ
  const aboveMax = maxQ > 0 && qty > maxQ

  const blocked = !selected || qty <= 0 || askPrice <= 0 || insufficient || belowMin || aboveMax

  const setMax = () => {
    if (!selected) return
    if (side === 'BUY') {
      const px = askPrice || marketPrice
      if (px > 0) setQuantity(String(Number((available / px).toFixed(8))))
    } else {
      setQuantity(String(available))
    }
  }

  const placeOrder = async (e) => {
    e.preventDefault()
    if (!selected) return
    if (qty <= 0) { toast.error('Enter a valid quantity.'); return }
    if (askPrice <= 0) { toast.error('Enter a valid price per gram.'); return }
    if (insufficient) { toast.error(`Insufficient ${availSymbol} balance.`); return }
    if (belowMin) { toast.error(`Minimum is ${fmt(minQ, decimals)}.`); return }
    if (aboveMax) { toast.error(`Maximum is ${fmt(maxQ, decimals)}.`); return }
    setPlacing(true)
    try {
      const res = await quoteRequestApi.create({
        pricePairId: selected.id,
        side,
        quantity: qty,
        price: askPrice,
        useCredit: !!(useCredit && activeCredit)
      })
      if (res?.matched) {
        toast.success(`${side === 'BUY' ? 'Buy' : 'Sell'} request matched instantly with another customer!`)
      } else {
        toast.success(`${side === 'BUY' ? 'Buy' : 'Sell'} request placed in the custom market.`)
      }
      setQuantity('')
      await Promise.all([loadRequests(), loadWallets()])
    } catch (err) {
      toast.error(err.response?.data?.message || 'Offer could not be placed.')
    } finally {
      setPlacing(false)
    }
  }

  const cancelOrder = async (id) => {
    setCancelling(id)
    try {
      await quoteRequestApi.cancel(id)
      toast.success('Offer cancelled.')
      await Promise.all([loadRequests(), loadWallets()])
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not cancel offer.')
    } finally {
      setCancelling(null)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Spinner light />
    </div>
  )

  // Access control: OFFER trading must be enabled for this user.
  if (!(marketAccess?.marketKinds || []).includes('OFFER')) {
    return (
      <div className="animate-fade-in">
        <div className="main-header">
          <h1 className="main-header-title">Offer Market</h1>
          <p className="main-header-sub">Trade via Telegram offers</p>
        </div>
        <div className="main-body">
          <div className="card">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              You do not have access to the offer market. Please contact support.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <h1 className="main-header-title">Offer Market</h1>
        <p className="main-header-sub">Custom demand & supply — matches with other customers instantly</p>
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <Alert type="error">{error}</Alert>}

        {pairs.length === 0 ? (
          <div className="card"><p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No trading pairs are available right now.</p></div>
        ) : (
          <div className="trade-grid">
            {/* Custom market list */}
            <div className="card animate-fade-up">
              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div className="gold-dot" />Markets</span>
                <span className={`live-dot ${connected ? 'on' : 'off'}`}>
                  <span className="live-pip" />{connected ? 'Live' : 'Offline'}
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
                        <div className="price-buy">Buy {fmt(q.buy, p.decimals)}</div>
                        <div className="price-sell">Sell {fmt(q.sell, p.decimals)}</div>
                        {q.buyGram > 0 && <div className="pair-gram">/g {fmt(q.buyGram, p.decimals)}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Custom offer ticket */}
            <form className="card animate-fade-up" onSubmit={placeOrder}>
              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="gold-dot" />{selected ? pairLabel(selected) : 'Offer'}
                </span>
              </div>

              <div className="side-toggle">
                <button type="button" className={`side-btn buy ${side === 'BUY' ? 'active' : ''}`} onClick={() => setSide('BUY')}>Buy</button>
                <button type="button" className={`side-btn sell ${side === 'SELL' ? 'active' : ''}`} onClick={() => setSide('SELL')}>Sell</button>
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
                        💳 Use Credit
                      </span>
                    </label>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {activeCredit.leverage}x leverage
                    </span>
                  </div>
                  {useCredit && (
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span>Credit Limit:</span>
                        <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
                          {fmt(creditIssued ? activeCredit.creditLimit : projectedCredit, 0)} IRR
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Sell Capacity:</span>
                        <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
                          {fmt(projectedSellCredit, decimals)} {selected?.baseSymbol?.slug || 'XAU'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="ticket-summary">
                <span className="label">
                  Available {useCredit && activeCredit ? '(Credit)' : ''}
                </span>
                <span className="val" style={{ color: useCredit && activeCredit ? 'var(--gold)' : 'inherit' }}>
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

              <Field
                label={`Your price / gram ${connected ? '(ref ' + fmt(marketPrice, decimals) + ')' : ''}`}
                hint="A compatible opposite order with the same quantity matches instantly"
              >
                <input className="form-input" type="number" step="any" min="0" value={price}
                  onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
              </Field>

              {mesghalPrice > 0 && (
                <div className="ticket-summary">
                  <span className="label">Ref price / mesghal</span>
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
                  {side === 'BUY' ? 'Buy' : 'Sell'} {selected?.baseSymbol?.slug || selected?.baseSymbol?.name || ''}
                </Button>
              </div>
            </form>
          </div>
        )}

        {/* Custom offers history */}
        <div className="card animate-fade-up">
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div className="gold-dot" />Your Offers</span>
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.4rem 2.2rem 0.4rem 0.8rem', fontSize: '0.82rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="PENDING">Pending</option>
              <option value="MATCHED">Matched</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          {requests.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {statusFilter ? 'No offers with this status.' : 'No offers yet.'}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="order-table">
                <thead>
                  <tr>
                    <th>Pair</th><th>Side</th><th>Qty</th><th>Price</th><th>Total</th><th>Status</th><th>Date</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => {
                    const p = pairMap[r.pricePairId] || r.pricePair
                    const d = p?.decimals ?? 2
                    return (
                      <tr key={r.id}>
                        <td>{p ? pairLabel(p) : '—'}</td>
                        <td className={r.side === 'BUY' ? 'txt-buy' : 'txt-sell'}>{r.side}</td>
                        <td>{fmt(r.quantity, d)}</td>
                        <td>{r.price ? fmt(r.price, d) : 'Market'}</td>
                        <td>{r.price ? fmt(Number(r.quantity) * Number(r.price), 2) : '—'}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[r.status] || 'badge-warning'}`}>
                            {r.status === 'MATCHED' ? 'Matched' : r.status?.replace('_', ' ')}
                          </span>
                          {r.status === 'MATCHED' && r.matchedAt && (
                            <div className="pair-sub">{formatDateTime(r.matchedAt)}</div>
                          )}
                        </td>
                        <td>{formatDateTime(r.createAt || r.createdAt)}</td>
                        <td>
                          {CANCELLABLE.includes(r.status) && (
                            <button className="btn btn-danger" disabled={cancelling === r.id} onClick={() => cancelOrder(r.id)}>
                              {cancelling === r.id ? <Spinner light /> : 'Cancel'}
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