import { useTranslation } from 'react-i18next'
import { BrandHeader } from './UI'

export default function AuthBrand() {
  const { t } = useTranslation()
  return (
    <div className="auth-brand">
      {/* Decorative rings */}
      <div className="gold-ring" style={{ width: 400, height: 400, bottom: -100, right: -150 }} />
      <div className="gold-ring" style={{ width: 250, height: 250, bottom: 80, right: -60 }} />

      <BrandHeader />

      <div className="brand-hero">
        <h1 className="brand-tagline">
          {t('authBrand.tagline1')}<br />
          <em>{t('authBrand.precision')}</em> {t('authBrand.tagline2')}<br />
          {t('authBrand.confidence')}
        </h1>
        <p className="brand-sub">
          {t('authBrand.sub')}
        </p>
      </div>

      <div className="brand-stats">
        <div>
          <div className="brand-stat-value">24K</div>
          <div className="brand-stat-label">{t('authBrand.purityTracked')}</div>
        </div>
        <div>
          <div className="brand-stat-value">99.9%</div>
          <div className="brand-stat-label">{t('authBrand.uptime')}</div>
        </div>
        <div>
          <div className="brand-stat-value">ISO</div>
          <div className="brand-stat-label">{t('authBrand.certified')}</div>
        </div>
      </div>
    </div>
  )
}
