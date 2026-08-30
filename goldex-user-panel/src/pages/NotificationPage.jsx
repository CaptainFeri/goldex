import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { notificationApi } from '../services/api'
import { getNotificationSocket } from '../services/socket'
import { Spinner, Alert, Button } from '../components/UI'

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

const TYPE_STYLES = {
  INFO: 'badge-info', SUCCESS: 'badge-success', WARNING: 'badge-warning',
  ERROR: 'badge-danger', PROMOTION: 'badge-gold', SYSTEM: 'badge-secondary',
}

const TYPE_KEYS = {
  INFO: 'typeInfo', SUCCESS: 'typeSuccess', WARNING: 'typeWarning',
  ERROR: 'typeError', PROMOTION: 'typePromotion', SYSTEM: 'typeSystem',
}

const CHANNELS = ['IN_APP', 'EMAIL', 'SMS', 'TELEGRAM']
const CATEGORIES = ['TRADE', 'CREDIT', 'KYC', 'SECURITY', 'PROMOTION', 'SYSTEM']

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" style={{ width: 24, height: 24 }}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function PreferencesTab() {
  const { t } = useTranslation()
  const [prefs, setPrefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const loadPrefs = useCallback(async () => {
    setLoading(true)
    try {
      const data = await notificationApi.getPreferences()
      setPrefs(data || [])
    } catch { } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadPrefs() }, [loadPrefs])

  const togglePref = (channel, category) => {
    setPrefs((prev) => {
      const existing = prev.find((p) => p.channel === channel && p.category === category)
      if (existing) {
        return prev.map((p) => p.id === existing.id ? { ...p, enabled: !p.enabled } : p)
      }
      return [...prev, { channel, category, enabled: false }]
    })
  }

  const getPref = (channel, category) => {
    const p = prefs.find((p) => p.channel === channel && p.category === category)
    return p ? p.enabled : true
  }

  const savePrefs = async () => {
    setSaving(true)
    try {
      const preferences = []
      for (const ch of CHANNELS) {
        for (const cat of CATEGORIES) {
          preferences.push({ channel: ch, category: cat, enabled: getPref(ch, cat) })
        }
      }
      const data = await notificationApi.savePreferences(preferences)
      setPrefs(data || [])
    } catch { } finally {
      setSaving(false)
    }
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}><Spinner /></div>

  return (
    <div>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
        {t('notification.choosePrefs')}
      </p>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'start' }}>{t('notification.channelCategory')}</th>
              {CATEGORIES.map((cat) => (
                <th key={cat} style={{ padding: '0.75rem 0.5rem', textAlign: 'center' }}>{cat}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHANNELS.map((ch) => (
              <tr key={ch} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 500 }}>{ch}</td>
                {CATEGORIES.map((cat) => (
                  <td key={cat} style={{ padding: '0.5rem', textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={getPref(ch, cat)}
                      onChange={() => togglePref(ch, cat)}
                      style={{ cursor: 'pointer', width: 18, height: 18 }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <Button onClick={savePrefs} loading={saving}>{t('notification.savePreferences')}</Button>
      </div>
    </div>
  )
}

export default function NotificationPage() {
  const { t } = useTranslation()
  const [notifications, setNotifications] = useState([])
  const [total, setTotal] = useState(0)
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [page, setPage] = useState(1)
  const [tab, setTab] = useState('list')
  const pageSize = 50

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await notificationApi.getNotifications(page, pageSize)
      setNotifications(data.data || [])
      setTotal(data.total || 0)
      setUnreadCount(data.unreadCount || 0)
    } catch (err) {
      setError(err?.response?.data?.message || t('notification.loadFailed'))
    } finally {
      setLoading(false)
    }
  }, [page, t])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    let ns = null
    try {
      ns = getNotificationSocket()
      ns.on('notification:new', () => load())
      ns.on('unread-count', () => load())
    } catch {
      ns = null
    }
    return () => {
      if (ns) {
        ns.off('notification:new')
        ns.off('unread-count')
      }
    }
  }, [load])

  const handleMarkRead = async (id) => {
    try {
      await notificationApi.markAsRead(id)
      setNotifications((prev) => prev.map((n) => n.id === id ? { ...n, status: 'READ', readAt: new Date().toISOString() } : n))
      setUnreadCount((c) => Math.max(0, c - 1))
    } catch { }
  }

  const handleMarkAllRead = async () => {
    try {
      await notificationApi.markAllAsRead()
      setNotifications((prev) => prev.map((n) => ({ ...n, status: 'READ', readAt: new Date().toISOString() })))
      setUnreadCount(0)
    } catch { }
  }

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <BellIcon />
          <div>
            <h1 className="main-header-title">{t('notification.title')}</h1>
            <p className="main-header-sub">
              {tab === 'list' ? (unreadCount > 0 ? t('notification.unread', { count: unreadCount }) : t('notification.allCaughtUp')) : t('notification.managePrefs')}
            </p>
          </div>
        </div>
      </div>

      <div className="main-body">
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <button className={`btn ${tab === 'list' ? '' : 'ghost'}`} onClick={() => setTab('list')}>
            {t('notification.notifications')}
          </button>
          <button className={`btn ${tab === 'prefs' ? '' : 'ghost'}`} onClick={() => setTab('prefs')}>
            {t('notification.preferences')}
          </button>
        </div>

        {tab === 'prefs' ? <PreferencesTab /> : (
          <>
            {error && <Alert type="error">{error}</Alert>}

            {unreadCount > 0 && (
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'flex-end' }}>
                <Button className="btn-auto ghost" onClick={handleMarkAllRead}>
                  {t('notification.markAllRead')}
                </Button>
              </div>
            )}

            {loading ? (
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem 0' }}>
                <Spinner />
              </div>
            ) : notifications.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.3 }}>🔔</div>
                <div style={{ color: 'var(--text-muted)' }}>{t('notification.noNotifications')}</div>
              </div>
            ) : (
              <div className="card" style={{ padding: 0 }}>
                {notifications.map((n) => {
                  const isUnread = n.status === 'SENT' || n.status === 'PENDING'
                  return (
                    <div
                      key={n.id}
                      onClick={() => isUnread && handleMarkRead(n.id)}
                      style={{
                        padding: '1rem 1.25rem',
                        background: isUnread ? 'var(--surface)' : 'transparent',
                        borderBottom: '1px solid var(--border)',
                        opacity: isUnread ? 1 : 0.6,
                        cursor: isUnread ? 'pointer' : 'default',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                          <span className={`badge ${TYPE_STYLES[n.type] || 'badge-info'}`}>
                            {t(`notification.${TYPE_KEYS[n.type] || 'typeInfo'}`)}
                          </span>
                          {n.category && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{n.category}</span>
                          )}
                        </div>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{fmtDate(n.sentAt)}</span>
                      </div>
                      <div style={{ fontWeight: isUnread ? 600 : 400, marginBottom: 4 }}>{n.title}</div>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{n.body}</div>
                    </div>
                  )
                })}
              </div>
            )}

            {total > pageSize && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                <Button className="btn-auto" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                  {t('notification.previous')}
                </Button>
                <span style={{ padding: '0.5rem 1rem', color: 'var(--text-muted)' }}>
                  {t('notification.pageOf', { page, total: Math.ceil(total / pageSize) })}
                </span>
                <Button className="btn-auto" disabled={page >= Math.ceil(total / pageSize)} onClick={() => setPage((p) => p + 1)}>
                  {t('notification.next')}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
