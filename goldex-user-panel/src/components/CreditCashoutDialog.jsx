import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { creditApi } from '../services/api'
import { Spinner, Alert, Button } from './UI'
import { useToast } from '../context/ToastContext'

const fmt = (n, digits = 0) =>
  Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: digits })

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'

/**
 * Cash out a credit purchase: pay off what the purchase drew from the credit
 * line — from the deposit wallet or the frozen collateral — and take the asset
 * into the deposit wallet. The credit facility itself stays open.
 */
export default function CreditCashoutDialog({ creditId, onClose, onDone }) {
  const { t } = useTranslation()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [history, setHistory] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null) // { trade, source }
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setError('')
    try {
      const [options, past] = await Promise.all([
        creditApi.getCashoutOptions(creditId),
        creditApi.getCashouts(creditId).catch(() => null),
      ])
      setData(options)
      setHistory(past)
    } catch (err) {
      setError(err?.response?.data?.message || err.message || t('credit.cashoutLoadFailed'))
      setData({ supported: false, trades: [] })
    }
  }, [creditId, t])

  useEffect(() => { load() }, [load])

  const submit = async () => {
    if (!selected) return
    setSubmitting(true)
    try {
      await creditApi.cashout(creditId, {
        creditOrderId: selected.trade.creditOrderId,
        source: selected.source,
      })
      toast.success(t('credit.cashoutSucceeded'))
      setSelected(null)
      await load()
      if (onDone) onDone()
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || t('credit.cashoutFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const trades = data?.trades || []
  const unsupportedReason = data && data.supported === false ? data.reason : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 620, width: '100%', maxHeight: '85vh', overflowY: 'auto' }}>
        <div className="card-title">{t('credit.cashoutTitle')}</div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0.5rem 0 1rem' }}>
          {t('credit.cashoutIntro')}
        </p>

        {error && <Alert type="error">{error}</Alert>}
        {unsupportedReason && <Alert type="warning">{t(`credit.cashoutReason.${unsupportedReason}`, t('credit.cashoutUnavailable'))}</Alert>}

        {!data ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem 0' }}><Spinner /></div>
        ) : (
          <>
            {data.supported && (
              <div className="field-row" style={{ marginBottom: '0.75rem' }}>
                <span className="field-label">{t('credit.cashoutBalances')}</span>
                <span className="field-value">
                  {t('credit.cashoutDepositAvailable')}: {fmt(data.depositBalance)} · {t('credit.cashoutCollateralAvailable')}: {fmt(data.collateralAvailable, 4)}
                  {Number(data.feePercent) > 0 && ` · ${t('credit.cashoutFee')}: ${data.feePercent}%`}
                </span>
              </div>
            )}

            {data.supported && trades.length === 0 && (
              <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {t('credit.cashoutNoTrades')}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {trades.map((tr) => {
                const depositDisabled = !tr.eligible || !tr.deposit.sufficient
                const collateralDisabled = !tr.eligible || !tr.collateral.sufficient
                return (
                  <div key={tr.creditOrderId} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '0.85rem 1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{tr.pairKey}</span>
                      <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{tr.orderCode}</code>
                    </div>
                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.8 }}>
                      <div>{t('credit.cashoutPurchase')}: {fmt(tr.executedQuantity, 4)} {tr.assetSymbolSlug} @ {fmt(tr.price)}</div>
                      <div>{t('credit.cashoutAmountDue')}: <span style={{ color: 'var(--gold)', fontWeight: 600 }}>{fmt(tr.totalDue)}</span>
                        {Number(tr.feeAmount) > 0 && ` (${t('credit.cashoutFee')} ${fmt(tr.feeAmount)})`}</div>
                      <div>{t('credit.cashoutRelease')}: {fmt(tr.assetAmount, 4)} {tr.assetSymbolSlug}</div>
                      {tr.executedAt && <div>{t('credit.cashoutTradedAt')}: {fmtDate(tr.executedAt)}</div>}
                    </div>

                    {!tr.eligible && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--red, #e5484d)', marginTop: 6 }}>
                        {t(`credit.cashoutReason.${tr.reason}`, t('credit.cashoutNotEligible'))}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                      <button
                        className="btn sm"
                        disabled={depositDisabled}
                        title={depositDisabled ? t('credit.cashoutDepositShort', { amount: fmt(tr.deposit.required) }) : undefined}
                        style={{ opacity: depositDisabled ? 0.5 : 1 }}
                        onClick={() => setSelected({ trade: tr, source: 'DEPOSIT' })}>
                        {t('credit.cashoutFromDeposit')}
                      </button>
                      <button
                        className="btn sm"
                        disabled={collateralDisabled}
                        title={
                          tr.collateral.blockedReason
                            ? t(`credit.cashoutReason.${tr.collateral.blockedReason}`, t('credit.cashoutCollateralUnavailable'))
                            : collateralDisabled
                              ? t('credit.cashoutCollateralShort', { amount: fmt(tr.collateral.requiredUnits, 4) })
                              : undefined
                        }
                        style={{ opacity: collateralDisabled ? 0.5 : 1 }}
                        onClick={() => setSelected({ trade: tr, source: 'COLLATERAL' })}>
                        {t('credit.cashoutFromCollateral', { amount: fmt(tr.collateral.requiredUnits, 4) })}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {history?.items?.length > 0 && (
              <div style={{ marginTop: '1.25rem', borderTop: '1px solid var(--border)', paddingTop: '0.85rem' }}>
                <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 6 }}>{t('credit.cashoutHistory')}</div>
                {history.items.map((h) => (
                  <div key={h.id} style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.9 }}>
                    {fmtDate(h.createAt)} · {fmt(h.amount)} · {t(`credit.cashoutSource.${h.source}`)} · {fmt(h.assetAmount, 4)} {t('credit.cashoutReleased')}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', marginTop: '1.25rem' }}>
          <Button type="button" variant="ghost" onClick={onClose}>{t('common.close')}</Button>
        </div>

        {selected && (
          <div className="modal-overlay" onClick={() => !submitting && setSelected(null)}>
            <div className="card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
              <div className="card-title">{t('credit.cashoutConfirmTitle')}</div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.7, margin: '0.5rem 0 1rem' }}>
                {selected.source === 'DEPOSIT'
                  ? t('credit.cashoutConfirmDeposit', {
                      amount: fmt(selected.trade.totalDue),
                      asset: `${fmt(selected.trade.assetAmount, 4)} ${selected.trade.assetSymbolSlug}`,
                    })
                  : t('credit.cashoutConfirmCollateral', {
                      units: fmt(selected.trade.collateral.requiredUnits, 4),
                      asset: `${fmt(selected.trade.assetAmount, 4)} ${selected.trade.assetSymbolSlug}`,
                      limit: fmt(selected.trade.collateral.creditLimitReduction),
                    })}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
                <Button type="button" variant="ghost" disabled={submitting} onClick={() => setSelected(null)}>{t('common.cancel')}</Button>
                <Button type="button" loading={submitting} onClick={submit}>{t('credit.cashoutConfirm')}</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
