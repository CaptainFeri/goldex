import { useEffect, useState } from 'react'
import { levelApi } from '../services/api'
import { Spinner, Alert } from '../components/UI'

const fmtNum = (n) => {
  if (n === null || n === undefined) return '—'
  if (typeof n === 'number' && n >= 999) return 'Unlimited'
  return Number(n).toLocaleString('en-US')
}

const FEATURE_META = {
  TRADING_DAILY_LIMIT: { label: 'Daily Trading Limit', category: 'Trading' },
  TRADING_MAX_ORDER_VALUE: { label: 'Max Order Value', category: 'Trading' },
  TRADING_MAX_OPEN_ORDERS: { label: 'Max Open Orders', category: 'Trading' },
  WALLET_WITHDRAWAL_DAILY_LIMIT: { label: 'Daily Withdrawal Limit', category: 'Wallet' },
  WALLET_WITHDRAWAL_PER_TX_LIMIT: { label: 'Per-Transaction Withdrawal Limit', category: 'Wallet' },
  CREDIT_MAX_AMOUNT: { label: 'Max Credit Amount', category: 'Credit' },
  CREDIT_MAX_DURATION_DAYS: { label: 'Max Credit Duration (days)', category: 'Credit' },
  TELEGRAM_BOT_ENABLED: { label: 'Telegram Bot', category: 'Access' },
  API_ACCESS_ENABLED: { label: 'API Access', category: 'Access' },
  ELITE_TRADE_ENABLED: { label: 'Elite Trade', category: 'Access' },
  PRIORITY_SUPPORT: { label: 'Priority Support', category: 'Access' },
  MAX_MARKET_TYPES: { label: 'Allowed Market Types', category: 'Access' },
}

const CAT_ORDER = ['Trading', 'Wallet', 'Credit', 'Access']

function LevelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 32, height: 32, color: 'var(--accent)' }}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function renderValue(key, val) {
  if (val === null || val === undefined) return <span className="field-value muted">Not set</span>
  if (typeof val === 'object') {
    if ('enabled' in val) {
      return val.enabled
        ? <span className="badge badge-success">Enabled</span>
        : <span className="badge badge-danger">Disabled</span>
    }
    if ('amount' in val) {
      if (val.amount === 0) return <span className="field-value accent">Unlimited</span>
      return <span>{fmtNum(val.amount)} {val.currency || ''}</span>
    }
    return <span>{JSON.stringify(val)}</span>
  }
  if (typeof val === 'boolean') {
    return val
      ? <span className="badge badge-success">Enabled</span>
      : <span className="badge badge-danger">Disabled</span>
  }
  if (typeof val === 'number') {
    if (val === 0) return <span className="field-value accent">Unlimited</span>
    return <span>{fmtNum(val)}</span>
  }
  return <span>{String(val)}</span>
}

export default function LevelPage() {
  const [level, setLevel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    levelApi.getMyLevel()
      .then(setLevel)
      .catch((err) => setError(err?.response?.data?.message || err.message || 'Failed to load level info'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="main-header">
          <h1 className="main-header-title">Account Level</h1>
          <p className="main-header-sub">Your current tier and feature entitlements</p>
        </div>
        <div className="main-body" style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
          <Spinner />
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="animate-fade-in">
        <div className="main-header">
          <h1 className="main-header-title">Account Level</h1>
          <p className="main-header-sub">Your current tier and feature entitlements</p>
        </div>
        <div className="main-body"><Alert type="error">{error}</Alert></div>
      </div>
    )
  }

  const features = level?.features ?? {}
  const grouped = {}
  for (const [key, val] of Object.entries(features)) {
    const cat = FEATURE_META[key]?.category ?? 'Other'
    if (!grouped[cat]) grouped[cat] = []
    grouped[cat].push({ key, val, label: FEATURE_META[key]?.label ?? key })
  }

  return (
    <div className="animate-fade-in">
      <div className="main-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="main-header-title">Account Level</h1>
          <p className="main-header-sub">Your current tier and feature entitlements</p>
        </div>
      </div>

      <div className="main-body" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

        {level && (
          <div className="card animate-fade-up">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <LevelIcon />
              <div>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  {level.name}
                </div>
                {level.description && (
                  <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 2 }}>{level.description}</div>
                )}
              </div>
            </div>
          </div>
        )}

        {CAT_ORDER.filter((cat) => grouped[cat]).map((cat) => (
          <div key={cat} className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />{cat}</div>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="level-feature-table">
                <thead>
                  <tr>
                    <th>Feature</th>
                    <th>Value</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[cat].map(({ key, val, label }) => (
                    <tr key={key}>
                      <td style={{ fontWeight: 500 }}>{label}</td>
                      <td>{renderValue(key, val)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
