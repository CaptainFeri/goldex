const MILESTONES = [
  { label: "درخواست", hint: "درخواست تسویه ثبت شد؛ در صورت فعال بودن «تأیید ادمین»، منتظر بررسی است." },
  { label: "تأیید و ارزش‌گذاری", hint: "درخواست تأیید شد و بدهی در برابر ارزش وثیقه ارزش‌گذاری شد." },
  { label: "روش و تأمین", hint: "روش تسویه انتخاب شد؛ در صورت وجود کسری، باید نقداً تأمین شود." },
  { label: "تحویل دارایی", hint: "دارایی موردنیاز از کاربر دریافت و مقدار آن تأیید شد." },
  { label: "تسویه نهایی", hint: "بدهی تسویه، دارایی منتقل و وثیقه آزاد شد." },
  { label: "بسته‌شده", hint: "فرایند تسویه با موفقیت به پایان رسید." },
] as const;

const STATUS_TO_MILESTONE: Record<string, number> = {
  SETTLEMENT_REQUESTED: 0,
  PENDING_ADMIN_REVIEW: 0,
  APPROVED: 1,
  VALUATED: 1,
  METHOD_SELECTED: 2,
  FUNDING_REQUIRED: 2,
  READY: 2,
  ASSET_RECEIVED: 3,
  ASSET_VERIFIED: 3,
  LIABILITY_CLEARED: 4,
  ASSET_SETTLED: 4,
  COLLATERAL_RELEASED: 4,
  CLOSED: 5,
};

/**
 * A compact visual pipeline for one settlement's status — six plain-language
 * milestones instead of a raw enum string like "ASSET_VERIFIED", so it's
 * clear at a glance where the process actually stands and what happens next.
 * REJECTED/FAILED are dead ends, not a step on the happy path, so they're
 * shown as a standalone red notice instead of a stepper position.
 */
export function SettlementStageStepper({
  status,
  settlementMethod,
}: {
  status: string;
  settlementMethod?: string | null;
}) {
  if (status === "REJECTED" || status === "FAILED") {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "var(--red)", fontWeight: 600 }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--red)", display: "inline-block" }} />
        {status === "REJECTED" ? "رد شده توسط ادمین" : "ناموفق — نیاز به بررسی مجدد"}
      </div>
    );
  }

  const current = STATUS_TO_MILESTONE[status] ?? 0;
  const skipsDelivery = settlementMethod === "TOPUP";

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
      {MILESTONES.map((m, i) => {
        const isDeliveryStep = i === 3;
        const skipped = isDeliveryStep && skipsDelivery;
        const done = i < current;
        const isCurrent = i === current && !skipped;
        return (
          <div key={m.label} style={{ display: "flex", alignItems: "center", flex: i < MILESTONES.length - 1 ? 1 : undefined }}>
            <div
              title={skipped ? "این روش (تأمین نقدی کسری) نیازی به تحویل دارایی ندارد" : m.hint}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 3,
                opacity: skipped ? 0.4 : 1,
                minWidth: 58,
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  background: skipped ? "var(--text-faint)" : done || isCurrent ? "var(--gold)" : "var(--border)",
                  border: isCurrent ? "2px solid var(--gold)" : undefined,
                  boxShadow: isCurrent ? "0 0 0 3px rgba(212,175,55,0.2)" : undefined,
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: 10, textAlign: "center", color: isCurrent ? "var(--gold)" : "var(--text-muted)", fontWeight: isCurrent ? 700 : 400, lineHeight: 1.3 }}>
                {skipped ? "بدون تحویل" : m.label}
              </span>
            </div>
            {i < MILESTONES.length - 1 && (
              <div style={{ flex: 1, height: 2, background: i < current ? "var(--gold)" : "var(--border)", margin: "0 2px", marginBottom: 14 }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
