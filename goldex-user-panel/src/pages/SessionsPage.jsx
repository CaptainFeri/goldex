import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { profileApi, authApi } from '../services/api'
import { Spinner, Alert } from '../components/UI'

function formatDateTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  })
}

export default function SessionsPage() {
  const { t } = useTranslation()
  const { deviceId } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('devices')
  const [revoking, setRevoking] = useState(null)

  const load = async () => {
    try {
      const d = await profileApi.getLoginHistory()
      setData(d)
    } catch (_) {
      setError(t('sessions.loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [t])

  const handleRevoke = async (dId) => {
    setRevoking(dId)
    try {
      await authApi.logout(dId)
      await load()
    } catch (_) {}
    setRevoking(null)
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
      <Spinner light />
    </div>
  )

  return (
    <div className="animate-fade-in">
      <div className="main-header">
        <h1 className="main-header-title">{t('sessions.title')}</h1>
        <p className="main-header-sub">{t('sessions.subtitle')}</p>
      </div>

      <div className="main-body">
        {error && <Alert type="error">{error}</Alert>}

        <div className="tabs">
          <button className={`tab ${tab === 'devices' ? 'active' : ''}`} onClick={() => setTab('devices')}>
            {t('sessions.activeDevices')}
          </button>
          <button className={`tab ${tab === 'history' ? 'active' : ''}`} onClick={() => setTab('history')}>
            {t('sessions.loginHistory')}
          </button>
        </div>

        {tab === 'devices' && (
          <div className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />{t('sessions.activeSessions')}</div>
            {data?.currentDeviceList?.length ? (
              <div className="device-list">
                {data.currentDeviceList.map(device => (
                  <div key={device.id} className="device-item">
                    <div style={{ flexShrink: 0, width: 36, height: 36, borderRadius: 'var(--radius-md)', background: 'var(--obsidian-600)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <DeviceOsIcon type={device.deviceType} />
                    </div>
                    <div className="device-info">
                      <div className="device-name">
                        {device.userAgent || device.deviceType}
                        {device.deviceId === deviceId && (
                          <span className="badge badge-success" style={{ marginInlineStart: 8 }}>{t('sessions.current')}</span>
                        )}
                      </div>
                      <div className="device-meta">
                        {device.ipAddress} · {t('sessions.lastLogin', { date: formatDateTime(device.lastLogin) })}
                      </div>
                    </div>
                    {device.isConnected && (
                      <span className="badge badge-success" style={{ flexShrink: 0 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#81c784', display: 'inline-block' }} />
                        {t('sessions.active')}
                      </span>
                    )}
                    {device.deviceId !== deviceId && (
                      <button
                        className="btn btn-danger"
                        onClick={() => handleRevoke(device.deviceId)}
                        disabled={revoking === device.deviceId}
                        style={{ flexShrink: 0 }}
                      >
                        {revoking === device.deviceId ? <Spinner light /> : t('sessions.revoke')}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>{t('sessions.noDevices')}</p>
            )}
          </div>
        )}

        {tab === 'history' && (
          <div className="card animate-fade-up">
            <div className="card-title"><div className="gold-dot" />{t('sessions.loginHistory')}</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
              {t('sessions.loginEvents', { count: data?.totalItems || 0 })}
            </div>
            <div className="history-list">
              {data?.loginHistoryList?.map(entry => (
                <div key={entry.id} className="history-item">
                  <div className={`history-status-dot ${entry.status === 'SUCCESS' ? 'success' : 'fail'}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      {entry.deviceInfo?.browser?.name || t('sessions.unknownBrowser')}
                      {' '}{t('sessions.on')} {entry.deviceInfo?.os?.name || t('sessions.unknownOs')}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 1 }}>
                      {entry.ipAddress} · {formatDateTime(entry.createAt)}
                    </div>
                  </div>
                  <span className={`badge ${entry.status === 'SUCCESS' ? 'badge-success' : 'badge-danger'}`}>
                    {entry.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function DeviceOsIcon({ type = '' }) {
  const t = type.toLowerCase()
  const color = 'var(--text-secondary)'
  if (t.includes('windows')) return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={color}><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>
  )
  if (t.includes('mac') || t.includes('ios')) return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill={color}><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 18c-4.418 0-8-3.582-8-8s3.582-8 8-8 8 3.582 8 8-3.582 8-8 8z"/></svg>
  )
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
  )
}
