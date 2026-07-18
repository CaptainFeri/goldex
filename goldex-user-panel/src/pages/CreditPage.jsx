import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { creditApi } from '../services/api'
import { Spinner, Alert, Button } from '../components/UI'

const fmtNum = (n) => (n ?? 0).toLocaleString('en-US')
const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const STATUS_LABELS = {
  PENDING: 'Pending',
  ACTIVE: 'Active',
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
  const [history, setHistory] = useState([])
  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('active') // active | history | notifications

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [active, all, notifs] = await Promise.all([
        creditApi.getActiveCredit(),
        creditApi.getCredits(),
        creditApi.getNotifications(),
      ])
      setActiveCredit(active)
      setHistory(Array.isArray(all) ? all : [])
      setNotifications(Array.isArray(notifs) ? notifs : [])
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
              <div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Reminder Every</div>
                <div style={{ fontWeight: 500 }}>{activeCredit.reminderTimerHours} hr</div>
              </div>
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
            </div>
          </div>
        ) : (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div className="card-title">Active Credit</div>
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No active credit
            </div>
          </div>
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
