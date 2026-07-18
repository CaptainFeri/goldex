import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../context/AuthContext'
import { useNavigate, useLocation } from 'react-router-dom'
import { ThemeToggle, LangToggle } from './UI'

const PRIMARY_NAV_KEYS = [
  { key: 'trade', path: '/trade', icon: TradeIcon },
  { key: 'eliteTrade', path: '/elite-trade', icon: EliteTradeIcon },
  { key: 'wallet', path: '/wallet', icon: WalletIcon },
  { key: 'profile', path: '/profile', icon: UserIcon },
]

function CreditIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bn-icon">
      <rect x="1" y="4" width="22" height="16" rx="2" />
      <line x1="1" y1="10" x2="23" y2="10" />
      <circle cx="12" cy="15" r="2" />
    </svg>
  )
}

const SECONDARY_NAV_KEYS = [
  { key: 'credit', path: '/credit', icon: CreditIcon },
  { key: 'verification', path: '/kyc', icon: ShieldIcon },
  { key: 'sessions', path: '/sessions', icon: DeviceIcon },
  { key: 'settings', path: '/settings', icon: SettingsIcon },
]

function TradeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bn-icon">
      <path d="M3 17l5-5 4 4 7-8" /><path d="M16 8h4v4" />
    </svg>
  )
}

function EliteTradeIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bn-icon">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function WalletIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bn-icon">
      <rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><circle cx="17" cy="14" r="1" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bn-icon">
      <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bn-icon">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  )
}

function DeviceIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bn-icon">
      <rect x="3" y="3" width="18" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
    </svg>
  )
}

function SettingsIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bn-icon">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

function MoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bn-icon">
      <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
    </svg>
  )
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="bn-icon">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  )
}

export default function BottomNav({ user }) {
  const { t } = useTranslation()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    await logout()
    navigate('/login')
  }

  return (
    <>
      <nav className="bottom-nav">
        {PRIMARY_NAV_KEYS.map(({ key, path, icon: Icon }) => (
          <button
            key={path}
            className={`bn-item ${location.pathname === path ? 'active' : ''}`}
            onClick={() => navigate(path)}
          >
            <Icon />
            <span className="bn-label">{t(`sidebar.${key}`)}</span>
          </button>
        ))}
        <button className="bn-item" onClick={() => setMenuOpen((o) => !o)}>
          <MoreIcon />
          <span className="bn-label">{t('common.more')}</span>
        </button>
      </nav>

      {menuOpen && <div className="bn-overlay" onClick={() => setMenuOpen(false)} />}

      <div className={`bn-menu ${menuOpen ? 'open' : ''}`}>
        <div className="bn-menu-header">
          <span style={{ fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
            {user?.firstName} {user?.lastName}
          </span>
          <button className="bn-menu-close" onClick={() => setMenuOpen(false)}>✕</button>
        </div>

        <div className="bn-menu-items">
          {SECONDARY_NAV_KEYS.map(({ key, path, icon: Icon }) => (
            <button
              key={path}
              className={`bn-menu-item ${location.pathname === path ? 'active' : ''}`}
              onClick={() => { navigate(path); setMenuOpen(false) }}
            >
              <Icon />
              <span>{t(`sidebar.${key}`)}</span>
            </button>
          ))}
        </div>

        <div className="bn-menu-footer">
          <div className="bn-menu-row">
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{t('sidebar.theme')}</span>
            <ThemeToggle />
          </div>
          <div className="bn-menu-row">
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{t('lang.fa')} / {t('lang.en')}</span>
            <LangToggle />
          </div>
          <button className="bn-menu-logout" onClick={handleLogout} disabled={loggingOut}>
            <LogoutIcon />
            {loggingOut ? t('sidebar.signingOut') : t('sidebar.signOut')}
          </button>
        </div>
      </div>
    </>
  )
}