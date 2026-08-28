import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
  const { t } = useTranslation()
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

  const loadActiveCredit = async () => {
    try {
      const credit = await creditApi.getActiveCredit()
      setActiveCredit(credit || null)
    } catch (_) {
      setActiveCredit(null)
    }
  }

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
        setError(t('offer.marketLoadFailed'))
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [marketAccess, t])

  useEffect(() => { loadRequests() }, [statusFilter])

  useEffect(() => {
    const hasOpen = requests.some((r) => CANCELLABLE.includes(r.status))
    if (!hasOpen) return
    const t = setInterval(() => { loadRequests(); loadWallets(); loadActiveCredit() }, 4000)
    return () => clearInterval(t)
  }, [requests])

  const pr = selected ? priceOf(selected) : { buy: 0, sell: 0, buyGram: 0, sellGram: 0, displayBuyGram: 0, displaySellGram: 0 }
  const marketPrice = side === 'BUY' ? pr.displayBuyGram : pr.sellGram
  const mesghalPrice = side === 'BUY' ? pr.buy : pr.sell
  const askPrice = Number(price) || 0
  const qty = Number(quantity) || 0 // grams
  const estTotal = qty * askPrice
  const decimals = selected?.decimals ?? 2

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
    if (qty <= 0) { toast.error(t('trade.enterValidQty')); return }
    if (askPrice <= 0) { toast.error(t('offer.enterValidPrice')); return }
    if (insufficient) { toast.error(t('trade.insufficientBalance', { symbol: availSymbol })); return }
    if (belowMin) { toast.error(t('trade.minimum', { min: fmt(minQ, decimals) })); return }
    if (aboveMax) { toast.error(t('trade.maximum', { max: fmt(maxQ, decimals) })); return }
    setPlacing(true)
    try {
      const res = await quoteRequestApi.create({
        pricePairId: selected.id,
        side,
        quantity: qty,
        price: askPrice,
        useCredit: !!(useCredit && activeCredit)
      })
      const sideLabel = side === 'BUY' ? t('trade.buy') : t('trade.sell')
      if (res?.matched) {
        toast.success(t('offer.matchedInstant', { side: sideLabel }))
      } else {
        toast.success(t('offer.placedCustom', { side: sideLabel }))
      }
      setQuantity('')
      await Promise.all([loadRequests(), loadWallets()])
    } catch (err) {
      toast.error(err.response?.data?.message || t('offer.offerFailed'))
    } finally {
      setPlacing(false)
    }
  }

  const cancelOrder = async (id) => {
    setCancelling(id)
    try {
      await quoteRequestApi.cancel(id)
      toast.success(t('offer.offerCancelled'))
      await Promise.all([loadRequests(), loadWallets()])
    } catch (err) {
      toast.error(err.response?.data?.message || t('offer.cancelOfferFailed'))
    } finally {
      setCancelling(null)
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Spinner light />
    </div>
  )

  if (!(marketAccess?.marketKinds || []).includes('OFFER')) {
    return (
      <div className="animate-fade-in">
        <div className="main-header">
          <h1 className="main-header-title">{t('offer.title')}</h1>
          <p className="main-header-sub">{t('offer.subtitle')}</p>
        </div>
        <div className="main-body">
          <div className="card">
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              {t('offer.noAccess')}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <h1 className="main-header-title">{t('offer.title')}</h1>
        <p className="main-header-sub">{t('offer.subtitle')}</p>
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        {error && <Alert type="error">{error}</Alert>}

        {pairs.length === 0 ? (
          <div className="card"><p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{t('offer.noPairs')}</p></div>
        ) : (
          <div className="trade-grid">
            {/* Custom market list */}
            <div className="card animate-fade-up">
              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div className="gold-dot" />{t('offer.markets')}</span>
                <span className={`live-dot ${connected ? 'on' : 'off'}`}>
                  <span className="live-pip" />{connected ? t('offer.live') : t('offer.offline')}
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

            {/* Custom offer ticket */}
            <form className="card animate-fade-up" onSubmit={placeOrder}>
              <div className="card-title" style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="gold-dot" />{selected ? pairLabel(selected) : t('offer.offer')}
                </span>
              </div>

              <div className="side-toggle">
                <button type="button" className={`side-btn buy ${side === 'BUY' ? 'active' : ''}`} onClick={() => setSide('BUY')}>{t('trade.buy')}</button>
                <button type="button" className={`side-btn sell ${side === 'SELL' ? 'active' : ''}`} onClick={() => setSide('SELL')}>{t('trade.sell')}</button>
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
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{t('trade.availSellCredit')}:</span>
                        <span style={{ color: 'var(--gold)', fontWeight: 600 }}>
                          {fmt(sellAvailable, decimals)} {selected?.baseSymbol?.slug || 'XAU'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

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

              <Field
                label={`${t('offer.yourPriceGram')}${connected ? ` (${fmt(marketPrice, decimals)})` : ''}`}
                hint={t('offer.priceHint')}
              >
                <input className="form-input" type="number" step="any" min="0" value={price}
                  onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
              </Field>

              {mesghalPrice > 0 && (
                <div className="ticket-summary">
                  <span className="label">{t('offer.refPriceMesghal')}</span>
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

        {/* Custom offers history */}
        <div className="card animate-fade-up">
          <div className="card-title" style={{ justifyContent: 'space-between' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}><div className="gold-dot" />{t('offer.yourOffers')}</span>
            <select
              className="form-input"
              style={{ width: 'auto', padding: '0.4rem 2.2rem 0.4rem 0.8rem', fontSize: '0.82rem' }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">{t('trade.allStatuses')}</option>
              <option value="PENDING">{t('trade.pending')}</option>
              <option value="MATCHED">{t('offer.matched')}</option>
              <option value="CANCELLED">{t('trade.cancelled')}</option>
            </select>
          </div>
          {requests.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {statusFilter ? t('offer.noOffersStatus') : t('offer.noOffers')}
            </p>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="order-table">
                <thead>
                  <tr>
                    <th>{t('trade.pair')}</th><th>{t('trade.side')}</th><th>{t('trade.qty')}</th><th>{t('trade.price')}</th><th>{t('trade.total')}</th><th>{t('trade.status')}</th><th>{t('trade.date')}</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r) => {
                    const p = pairMap[r.pricePairId] || r.pricePair
                    const d = p?.decimals ?? 2
                    return (
                      <tr key={r.id}>
                        <td>{p ? pairLabel(p) : '—'}</td>
                        <td className={r.side === 'BUY' ? 'txt-buy' : 'txt-sell'}>{r.side === 'BUY' ? t('trade.buy') : t('trade.sell')}</td>
                        <td>{fmt(r.quantity, d)}</td>
                        <td>{r.price ? fmt(r.price, d) : t('trade.marketOrder')}</td>
                        <td>{r.price ? fmt(Number(r.quantity) * Number(r.price), 2) : '—'}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[r.status] || 'badge-warning'}`}>
                            {r.status === 'MATCHED' ? t('offer.matched') : t(`trade.${r.status === 'PENDING' ? 'pending' : 'cancelled'}`)}
                          </span>
                          {r.status === 'MATCHED' && r.matchedAt && (
                            <div className="pair-sub">{formatDateTime(r.matchedAt)}</div>
                          )}
                        </td>
                        <td>{formatDateTime(r.createAt || r.createdAt)}</td>
                        <td>
                          {CANCELLABLE.includes(r.status) && (
                            <button className="btn btn-danger" disabled={cancelling === r.id} onClick={() => cancelOrder(r.id)}>
                              {cancelling === r.id ? <Spinner light /> : t('common.cancel')}
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
