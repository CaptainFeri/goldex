import { fmtNum } from "../labels";

/**
 * Mark-to-market risk/valuation snapshot from the settlement engine
 * (GET /admin/credits/:id/risk) — net equity, margin ratio, per-symbol
 * positions and the raw CREDIT wallet balances behind them.
 */
export function RiskPanel({ riskData }: { riskData: any }) {
  if (!riskData) return null;

  return (
    <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
      <h4 style={{ margin: "0 0 4px 0", fontSize: 14 }}>ارزیابی ریسک زنده</h4>
      <p style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.7, margin: "0 0 12px 0" }}>
        وضعیت این تسهیلات در همین لحظه، با قیمت روز بازار — نه اعداد ذخیره‌شده در پایگاه‌داده.
      </p>

      {riskData.eligible === false && (
        <div style={{ background: "var(--red-bg, #3a1414)", color: "var(--red)", padding: "8px 10px", borderRadius: 6, fontSize: 12.5, marginBottom: 10, fontWeight: 600 }}>
          تسویه داوطلبانه مسدود است: کسری {fmtNum(riskData.valuation?.shortfall)} ریال پس از وثیقه باقی می‌ماند.
          کاربر باید موقعیت منفی را بازخرید کند یا کیف‌پول واریز را شارژ کند (یا از گزینه «تسویه اجباری» استفاده کنید).
        </div>
      )}

      {riskData.stateError ? (
        <div style={{ color: "var(--red)", fontSize: 13 }}>قیمت مارک در دسترس نیست ({riskData.stateError})</div>
      ) : riskData.valuation ? (
        <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
          <span className="k" title="حاصل جمع سرمایه (وثیقه) و سود/زیان معاملات اعتباری — منفی یعنی کاربر مجموعاً بدهکار است">ارزش خالص</span>
          <span className="v mono" style={{ color: riskData.valuation.netEquity >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
            {fmtNum(riskData.valuation.netEquity)} ریال
          </span>
          <span className="k" title="ارزش فعلی وثیقه به‌علاوه سود/زیان تحقق‌نیافته معاملات اعتباری">سرمایه</span>
          <span className="v mono">{fmtNum(riskData.valuation.equity)} ریال</span>
          <span className="k" title="نسبت سرمایه به بدهی؛ هرچه کمتر باشد ریسک نکول بیشتر است (زیر ۷.۵٪ فراخوان سرمایه فعال می‌شود)">نسبت مارجین</span>
          <span className="v mono">{riskData.valuation.marginRatio != null ? (riskData.valuation.marginRatio * 100).toFixed(2) + "%" : "—"}</span>
          <span className="k" title="جمع مبلغ ریالی وام‌گرفته‌شده از طریق معاملات خرید اعتباری">قرض گرفته (ریال)</span>
          <span className="v mono">{fmtNum(riskData.valuation.borrowedIr)} ریال</span>
          <span className="k" title="ارزش فعلی دارایی مسدودشده به‌عنوان وثیقه، به قیمت روز">ارزش وثیقه</span>
          <span className="v mono">{fmtNum(riskData.valuation.collateralValue)} ریال</span>
          <span className="k" title="کل بدهی این تسهیلات که در برابر وثیقه سنجیده می‌شود">در معرض (بدهی)</span>
          <span className="v mono">{fmtNum(riskData.valuation.exposure)} ریال</span>
          <span className="k" title="مبلغ اعتباری که تا الان با معاملات تکمیل‌شده مصرف شده">استفاده‌شده</span>
          <span className="v mono">{fmtNum(riskData.usedCredit)} ریال</span>
          <span className="k" title="باقیمانده حد اعتبار که هنوز مصرف نشده">موجود</span>
          <span className="v mono">{fmtNum(riskData.availableCredit)} ریال</span>
        </div>
      ) : null}

      {(riskData.valuation?.positions || []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 2 }}>موقعیت باز به تفکیک دارایی</div>
          <div style={{ fontSize: 11, color: "var(--text-faint)", marginBottom: 6 }}>
            عدد منفی (قرمز) یعنی کاربر آن مقدار از این دارایی را با اعتبار فروخته و بدهکار آن است.
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>نماد</th><th title="مقدار خالص (مثبت = دارایی نزد کاربر، منفی = بدهکار)">موقعیت خالص (گرم)</th><th>قیمت مارک</th></tr></thead>
              <tbody>
                {riskData.valuation.positions.map((p: any, i: number) => (
                  <tr key={i}>
                    <td className="mono">{p.baseSymbolSlug}</td>
                    <td className="mono" style={Number(p.netXau) < 0 ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                      {fmtNum(p.netXau)}
                    </td>
                    <td className="mono">{fmtNum(p.markPrice)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {riskData.balances?.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }} title="کیف‌پول‌های نوع CREDIT — ظرفیت اعتباری صادرشده برای هر دارایی، نه موجودی واقعی کاربر">موجودی کیف‌پول‌های اعتباری</div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>نماد</th><th>آزاد</th><th>مسدود</th><th>اعتبار</th></tr></thead>
              <tbody>
                {riskData.balances.map((b: any, i: number) => (
                  <tr key={i}>
                    <td className="mono">{b.symbolSlug}</td>
                    <td className="mono">{fmtNum(b.freeBalance)}</td>
                    <td className="mono">{fmtNum(b.lockedBalance)}</td>
                    <td className="mono">{fmtNum(b.creditBalance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
