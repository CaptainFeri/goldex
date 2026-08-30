import { api } from "../../../api/client";
import { Badge } from "../../../components/ui";
import type { Credit } from "../../../api/types";
import { SETTLEMENT_METHOD_LABELS } from "../labels";

/** Per-facility settlement policy toggles (handoff §6.3, §6.5): admin approval, enabled methods, netting. */
export function SettlementPolicyPanel({ c, onToggled }: { c: Credit; onToggled: () => void }) {
  if (c.status !== "ACTIVE") return null;

  const methods = (c.settlementMethods && c.settlementMethods.length > 0 ? c.settlementMethods : ["FULL", "NET", "TOPUP"]) as string[];

  return (
    <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
      <h4 style={{ margin: "0 0 4px 0", fontSize: 14 }}>سیاست تسویه</h4>
      <p style={{ fontSize: 12, color: "var(--text-faint)", lineHeight: 1.7, margin: "0 0 12px 0" }}>
        این تنظیمات فقط روی گردش‌کار تسویه تحویلی این اعتبار اثر می‌گذارد، نه روی تسویه سریع (دکمه «تسویه» در لیست اصلی).
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>تأیید ادمین</div>
            <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
              وقتی روشن باشد، هر درخواست تسویه تحویلی ابتدا در وضعیت «در انتظار تأیید ادمین» می‌ماند و بدون تأیید شما جلو نمی‌رود.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <Badge kind={c.requireAdminApprovalForSettlement ? "gold" : "green"}>{c.requireAdminApprovalForSettlement ? "روشن" : "خاموش"}</Badge>
            <button className="btn sm" onClick={async () => {
              await api.post(`/admin/credits/${c.id}/settlement-policy`, { requireAdminApprovalForSettlement: !c.requireAdminApprovalForSettlement });
              onToggled();
            }}>
              {c.requireAdminApprovalForSettlement ? "خاموش کن" : "روشن کن"}
            </button>
          </div>
        </div>

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>روش‌های تسویه مجاز</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {methods.map((m) => (
              <Badge key={m} kind="gray">{SETTLEMENT_METHOD_LABELS[m] ?? m}</Badge>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>خالص‌سازی (Netting)</div>
            <div style={{ fontSize: 11.5, color: "var(--text-faint)" }}>
              اجازه می‌دهد کاربر روش «خالص‌سازی» را انتخاب کند — معاملات خرید و فروش مخالف روی یک دارایی با هم همپوشانی می‌شوند.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            <Badge kind={c.nettingEnabled ? "green" : "gray"}>{c.nettingEnabled ? "فعال" : "غیرفعال"}</Badge>
            <button className="btn sm" onClick={async () => {
              await api.post(`/admin/credits/${c.id}/settlement-policy`, { nettingEnabled: !c.nettingEnabled });
              onToggled();
            }}>
              {c.nettingEnabled ? "غیرفعال کن" : "فعال کن"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
