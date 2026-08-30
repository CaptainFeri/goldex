import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";
import { Modal } from "../../components/ui";
import type { SettlementEligibility } from "../../api/types";
import { fmtNum } from "./labels";

export const SETTLEMENT_PROMPT_META: Record<
  "reject" | "method" | "fund" | "receive" | "fail",
  { title: string; submitLabel: string; description: string }
> = {
  reject: { title: "رد درخواست تسویه", submitLabel: "رد کردن", description: "دلیل رد را برای کاربر ثبت کنید." },
  method: { title: "انتخاب روش تسویه", submitLabel: "ثبت روش", description: "یکی از روش‌های تسویه فعال را انتخاب کنید." },
  fund: { title: "تأمین کسری", submitLabel: "ثبت تأمین", description: "مبلغی که برای پوشش کسری تأمین شده را وارد کنید." },
  receive: { title: "ثبت تحویل دارایی", submitLabel: "ثبت تحویل", description: "مقدار دارایی دریافت‌شده از کاربر را وارد کنید." },
  fail: { title: "ثبت شکست تسویه", submitLabel: "ثبت شکست", description: "دلیل شکست را برای پیگیری بعدی ثبت کنید." },
};

export const SETTLEMENT_METHOD_OPTIONS: Array<{ value: "FULL" | "NET" | "TOPUP"; title: string; desc: string }> = [
  { value: "FULL", title: "بازپرداخت کامل", desc: "کاربر همان مقدار دارایی یا وجهی که با اعتبار گرفته را کامل تحویل/بازپرداخت می‌کند." },
  { value: "NET", title: "خالص‌سازی (Net)", desc: "معاملات خرید و فروش مخالف روی یک دارایی با هم همپوشانی می‌شوند و فقط مابه‌التفاوت تسویه می‌شود." },
  { value: "TOPUP", title: "تأمین نقدی کسری", desc: "بدون تحویل دارایی — کاربر فقط کسری بین وثیقه و بدهی را نقداً تأمین می‌کند و مستقیم به مرحله تسویه بدهی می‌رود." },
];

export function SettlementPromptModal({
  kind,
  currentMethod,
  nettingEnabled,
  submitting,
  onClose,
  onSubmit,
}: {
  kind: "reject" | "method" | "fund" | "receive" | "fail";
  currentMethod?: string | null;
  nettingEnabled?: boolean;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (value: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState(currentMethod || "FULL");
  const [amount, setAmount] = useState("");
  const meta = SETTLEMENT_PROMPT_META[kind];
  const isAmount = kind === "fund" || kind === "receive";
  const isReason = kind === "reject" || kind === "fail";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (kind === "method") {
      if (method === "NET" && !nettingEnabled) return;
      onSubmit(method);
      return;
    }
    if (isAmount) {
      const n = Number(amount);
      if (!(n > 0)) return;
      onSubmit(String(n));
      return;
    }
    if (!reason.trim()) return;
    onSubmit(reason.trim());
  }

  return (
    <Modal title={meta.title} onClose={onClose}>
      <form className="modal-form" onSubmit={submit}>
        <div style={{ fontSize: 13, color: "var(--text-faint)", marginBottom: 12, lineHeight: 1.6 }}>{meta.description}</div>

        {kind === "method" && (
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SETTLEMENT_METHOD_OPTIONS.map((o) => {
                const disabled = o.value === "NET" && !nettingEnabled;
                return (
                  <label
                    key={o.value}
                    style={{
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 8,
                      padding: "8px 10px",
                      borderRadius: 6,
                      border: `1px solid ${method === o.value ? "var(--gold)" : "var(--border)"}`,
                      cursor: disabled ? "not-allowed" : "pointer",
                      opacity: disabled ? 0.5 : 1,
                    }}
                  >
                    <input
                      type="radio"
                      name="settlement-method"
                      value={o.value}
                      checked={method === o.value}
                      disabled={disabled}
                      onChange={() => setMethod(o.value)}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <span style={{ display: "block", fontWeight: 600, fontSize: 13 }}>{o.title}</span>
                      <span style={{ display: "block", fontSize: 11.5, color: "var(--text-faint)", marginTop: 2 }}>
                        {disabled ? "غیرفعال — قابلیت خالص‌سازی روی این تسهیلات فعال نشده است." : o.desc}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {isAmount && (
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>{kind === "fund" ? "مبلغ تأمین (ریال)" : "مقدار دارایی"}</label>
            <input
              className="input mono"
              dir="ltr"
              type="number"
              step="0.00000001"
              min="0"
              autoFocus
              placeholder="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
          </div>
        )}

        {isReason && (
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>دلیل</label>
            <textarea
              className="input"
              rows={3}
              autoFocus
              placeholder="دلیل را وارد کنید…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
            />
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button type="submit" className="btn" disabled={submitting || (kind === "method" && method === "NET" && !nettingEnabled)}>
            {submitting ? <><span className="spin" /> در حال ثبت…</> : meta.submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ForceClearLiabilityModal({
  creditId,
  submitting,
  onClose,
  onConfirm,
}: {
  creditId: string;
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [ack, setAck] = useState(false);
  const eligibility = useQuery({
    queryKey: ["credit-settlement-eligibility", creditId],
    queryFn: async () => unwrap<SettlementEligibility>((await api.get(`/admin/credits/${creditId}/settlement-eligibility`)).data),
  });
  const elig = eligibility.data;
  const negativePositions = (elig?.positions || []).filter((p) => Number(p.netXau) < 0);

  return (
    <Modal title="تسویه بدهی با وجود کسری" onClose={onClose}>
      <div style={{ background: "var(--red-bg, #3a1414)", color: "var(--red)", padding: "10px 12px", borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
        <div style={{ fontWeight: 600, marginBottom: 4 }}>
          موجودی کاربر پس از احتساب وثیقه هنوز منفی است{elig?.shortfall ? ` — کسری ${fmtNum(elig.shortfall)} ریال` : ""}.
        </div>
        {negativePositions.length > 0 && (
          <ul style={{ margin: "4px 0 8px", paddingInlineStart: 18 }}>
            {negativePositions.map((p) => (
              <li key={p.symbolId}>بدهکار {fmtNum(Math.abs(Number(p.netXau)))} {p.baseSymbolSlug}</li>
            ))}
          </ul>
        )}
        <div>در صورت ادامه، این کسری به‌عنوان نکول ثبت و برای پیگیری بعدی علامت‌گذاری می‌شود.</div>
      </div>

      <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, cursor: "pointer", marginBottom: 16, fontSize: 13.5 }}>
        <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
        متوجه‌ام و می‌خواهم با وجود کسری، تسویه را نهایی کنم
      </label>

      <div className="modal-actions">
        <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
        <button type="button" className="btn danger" disabled={!ack || submitting} onClick={onConfirm}>
          {submitting ? <><span className="spin" /> در حال تسویه…</> : "تسویه اجباری"}
        </button>
      </div>
    </Modal>
  );
}
