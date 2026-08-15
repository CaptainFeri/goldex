import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { BrandHeader, ThemeToggle, LangToggle } from './UI'
import { levelApi, notificationApi } from '../services/api'
import { getNotificationSocket } from '../services/socket'

function WarehouseIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function EliteTradeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <rect x="2" y="3" width="20" height="14" rx="2" /><line x1="8" y1="21" x2="16" y2="21" /><line x1="12" y1="17" x2="12" y2="21" />
      <polyline points="7 10 10 13 17 6" />
    </svg>
  )
}

function CreditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
      <circle cx="12" cy="15" r="2" />
    </svg>
  )
}

const navItems = [
  { label: 'Trade', path: '/trade', icon: TradeIcon },
  { label: 'Elite Trade', path: '/elite-trade', icon: EliteTradeIcon },
  { label: 'Offer', path: '/offer', icon: OfferIcon },
  { label: 'Wallet', path: '/wallet', icon: WalletIcon },
  { label: 'Credit', path: '/credit', icon: CreditIcon },
  { label: 'Notifications', path: '/notifications', icon: BellIcon },
  { label: 'Support', path: '/support', icon: SupportIcon },
  { label: 'Profile', path: '/profile', icon: UserIcon },
  { label: 'Level', path: '/level', icon: StarIcon },
  { label: 'Verification', path: '/kyc', icon: ShieldIcon },
  { label: 'Sessions', path: '/sessions', icon: DeviceIcon },
  { label: 'Settings', path: '/settings', icon: SettingsIcon },
]

function OfferIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}

function TradeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <path d="M3 17l5-5 4 4 7-8" /><path d="M16 8h4v4" />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="17" cy="14" r="1" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

function StarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function DeviceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <rect x="3" y="3" width="18" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
    </svg>
  )
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function SupportIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      <line x1="12" y1="9" x2="16" y2="9" /><line x1="12" y1="13" x2="14" y2="13" /><line x1="8" y1="9" x2="8.01" y2="9" /><line x1="8" y1="13" x2="8.01" y2="13" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="nav-icon">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export default function Sidebar({ user }) {
  const { logout, marketAccess } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [loggingOut, setLoggingOut] = useState(false)
  const [level, setLevel] = useState(null)
  const [unreadNotifs, setUnreadNotifs] = useState(0)

  // Hide navigation entries the user has no market access to.
  const canTradeKind = (kind) =>
    !marketAccess || (marketAccess.marketKinds || []).includes(kind)
  const visibleNav = navItems.filter((item) => {
    if (item.path === '/elite-trade') return canTradeKind('LIMIT')
    if (item.path === '/trade') return canTradeKind('MARKET')
    if (item.path === '/offer') return canTradeKind('OFFER')
    return true
  })

  useEffect(() => {
    levelApi.getMyLevel().then(setLevel).catch(() => {})
  }, [])

  useEffect(() => {
    notificationApi.getUnreadCount().then((d) => setUnreadNotifs(d.count || 0)).catch(() => {})
    const interval = setInterval(() => {
      notificationApi.getUnreadCount().then((d) => setUnreadNotifs(d.count || 0)).catch(() => {})
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // Realtime unread-count updates over the notifications socket.
  useEffect(() => {
    let ns = null
    try {
      ns = getNotificationSocket()
      ns.on('unread-count', (payload) => setUnreadNotifs(payload?.count || 0))
    } catch {
      ns = null
    }
    return () => {
      if (ns) ns.off('unread-count')
    }
  }, [])

  const initials = user
    ? `${(user.firstName || '?')[0]}${(user.lastName || '?')[0]}`.toUpperCase()
    : '?'

  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
    navigate('/login')
  }

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <BrandHeader />
      </div>

      <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div className="avatar" style={{ width: 40, height: 40, fontSize: '1rem' }}>{initials}</div>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
            {user?.firstName} {user?.lastName}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
            {user?.phone || user?.phoneNumber}
            {level && (
              <span className="level-sidebar-badge">
                {level.name}
              </span>
            )}
          </div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {visibleNav.map(({ label, path, icon: Icon }) => (
          <button
            key={path}
            className={`nav-item ${location.pathname === path ? 'active' : ''}`}
            onClick={() => navigate(path)}
            style={{ position: 'relative' }}
          >
            <Icon />
            {label}
            {path === '/notifications' && unreadNotifs > 0 && (
              <span style={{
                position: 'absolute', left: '1.75rem', top: '0.4rem',
                background: 'var(--danger, #ef4444)', color: '#fff',
                fontSize: '0.6rem', fontWeight: 700,
                minWidth: 16, height: 16, borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px',
              }}>{unreadNotifs > 99 ? '99+' : unreadNotifs}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-theme-row">
          <span>Language</span>
          <LangToggle />
        </div>
        <div className="sidebar-theme-row">
          <span>Theme</span>
          <ThemeToggle />
        </div>
        <button className="nav-item" onClick={handleLogout} disabled={loggingOut}>
          <LogoutIcon />
          {loggingOut ? 'Signing out…' : 'Sign out'}
        </button>
      </div>
    </aside>
  )
}
