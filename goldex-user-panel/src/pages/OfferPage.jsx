import { useAuth } from '../context/AuthContext'
import { Spinner } from '../components/UI'

export default function OfferPage() {
  const { marketAccess } = useAuth()

  if (!marketAccess) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Spinner light />
      </div>
    )
  }

  // Access control: OFFER trading must be enabled for this user.
  if (!(marketAccess.marketKinds || []).includes('OFFER')) {
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
        <p className="main-header-sub">Trade via Telegram offers</p>
      </div>
      <div className="main-body">
        <div className="card">
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            The offer market is not available yet. Offers posted by partners will
            appear here once the feature launches.
          </p>
        </div>
      </div>
    </div>
  )
}