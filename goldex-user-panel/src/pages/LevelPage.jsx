import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { levelApi } from '../services/api'
import { Spinner, Alert } from '../components/UI'

const fmtNum = (n) => {
  if (n === null || n === undefined) return '—'
  if (typeof n === 'number' && n >= 999) return null
  return Number(n).toLocaleString('en-US')
}

const FEATURE_KEY = {
  TRADING_DAILY_LIMIT: { label: 'fDailyTradingLimit', category: 'catTrading' },
  TRADING_MAX_ORDER_VALUE: { label: 'fMaxOrderValue', category: 'catTrading' },
  TRADING_MAX_OPEN_ORDERS: { label: 'fMaxOpenOrders', category: 'catTrading' },
  WALLET_WITHDRAWAL_DAILY_LIMIT: { label: 'fDailyWithdrawalLimit', category: 'catWallet' },
  WALLET_WITHDRAWAL_PER_TX_LIMIT: { label: 'fPerTxWithdrawalLimit', category: 'catWallet' },
  CREDIT_MAX_AMOUNT: { label: 'fMaxCreditAmount', category: 'catCredit' },
  CREDIT_MAX_DURATION_DAYS: { label: 'fMaxCreditDuration', category: 'catCredit' },
  TELEGRAM_BOT_ENABLED: { label: 'fTelegramBot', category: 'catAccess' },
  API_ACCESS_ENABLED: { label: 'fApiAccess', category: 'catAccess' },
  ELITE_TRADE_ENABLED: { label: 'fEliteTrade', category: 'catAccess' },
  PRIORITY_SUPPORT: { label: 'fPrioritySupport', category: 'catAccess' },
  MAX_MARKET_TYPES: { label: 'fMaxMarketTypes', category: 'catAccess' },
}

const CAT_KEYS = ['catTrading', 'catWallet', 'catCredit', 'catAccess']

function LevelIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 32, height: 32, color: 'var(--accent)' }}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function renderValue(key, val, t) {
  if (val === null || val === undefined) return <span className="field-value muted">{t('level.notSet')}</span>
  if (typeof val === 'object') {
    if ('enabled' in val) {
      return val.enabled
        ? <span className="badge badge-success">{t('level.enabled')}</span>
        : <span className="badge badge-danger">{t('level.disabled')}</span>
    }
    if ('amount' in val) {
      if (val.amount === 0) return <span className="field-value accent">{t('level.unlimited')}</span>
      return <span>{fmtNum(val.amount)} {val.currency || ''}</span>
    }
    return <span>{JSON.stringify(val)}</span>
  }
  if (typeof val === 'boolean') {
    return val
      ? <span className="badge badge-success">{t('level.enabled')}</span>
      : <span className="badge badge-danger">{t('level.disabled')}</span>
  }
  if (typeof val === 'number') {
    if (val === 0) return <span className="field-value accent">{t('level.unlimited')}</span>
    return <span>{fmtNum(val) ?? t('level.unlimited')}</span>
  }
  return <span>{String(val)}</span>
}

export default function LevelPage() {
  const { t } = useTranslation()
  const [level, setLevel] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    levelApi.getMyLevel()
      .then(setLevel)
      .catch((err) => setError(err?.response?.data?.message || err.message || t('level.loadFailed')))
      .finally(() => setLoading(false))
  }, [t])

  if (loading) {
    return (
      <div className="animate-fade-in">
        <div className="main-header">
          <h1 className="main-header-title">{t('level.title')}</h1>
          <p className="main-header-sub">{t('level.subtitle')}</p>
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
          <h1 className="main-header-title">{t('level.title')}</h1>
          <p className="main-header-sub">{t('level.subtitle')}</p>
        </div>
        <div className="main-body"><Alert type="error">{error}</Alert></div>
      </div>
    )
  }

  const features = level?.features ?? {}
  const grouped = {}
  for (const [key, val] of Object.entries(features)) {
    const catKey = FEATURE_KEY[key]?.category ?? 'catAccess'
    if (!grouped[catKey]) grouped[catKey] = []
    grouped[catKey].push({ key, val, label: t(`level.${FEATURE_KEY[key]?.label || 'fMaxOrderValue'}`) })
  }

  return (
    <div className="animate-fade-in">
      <div className="main-header" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 className="main-header-title">{t('level.title')}</h1>
          <p className="main-header-sub">{t('level.subtitle')}</p>
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

        {CAT_KEYS.filter((cat) => grouped[cat]).map((catKey) => (
          <div key={catKey} className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />{t(`level.${catKey}`)}</div>
            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table className="level-feature-table">
                <thead>
                  <tr>
                    <th>{t('level.feature')}</th>
                    <th>{t('level.value')}</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped[catKey].map(({ key, val, label }) => (
                    <tr key={key}>
                      <td style={{ fontWeight: 500 }}>{label}</td>
                      <td>{renderValue(key, val, t)}</td>
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
