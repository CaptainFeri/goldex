import { BrandHeader } from './UI'

export default function AuthBrand() {
  return (
    <div className="auth-brand">
      {/* Decorative rings */}
      <div className="gold-ring" style={{ width: 400, height: 400, bottom: -100, right: -150 }} />
      <div className="gold-ring" style={{ width: 250, height: 250, bottom: 80, right: -60 }} />

      <BrandHeader />

      <div className="brand-hero">
        <h1 className="brand-tagline">
          Trade gold with<br />
          <em>precision</em> and<br />
          confidence.
        </h1>
        <p className="brand-sub">
          A secure, modern platform for gold exchange — built for traders who demand transparency and speed.
        </p>
      </div>

      <div className="brand-stats">
        <div>
          <div className="brand-stat-value">24K</div>
          <div className="brand-stat-label">Purity tracked</div>
        </div>
        <div>
          <div className="brand-stat-value">99.9%</div>
          <div className="brand-stat-label">Uptime</div>
        </div>
        <div>
          <div className="brand-stat-value">ISO</div>
          <div className="brand-stat-label">Certified</div>
        </div>
      </div>
    </div>
  )
}
