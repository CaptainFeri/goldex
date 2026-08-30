import { api } from "../../../api/client";
import { Badge } from "../../../components/ui";
import type { Credit } from "../../../api/types";

/** Per-facility settlement policy toggles (handoff §6.3, §6.5): admin approval, enabled methods, netting. */
export function SettlementPolicyPanel({ c, onToggled }: { c: Credit; onToggled: () => void }) {
  if (c.status !== "ACTIVE") return null;

  return (
    <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
      <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>سیاست تسویه (Settlement Policy)</h4>
      <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
        <span className="k">تأیید ادمین (approval)</span>
        <span className="v"><Badge kind={c.requireAdminApprovalForSettlement ? "gold" : "green"}>{c.requireAdminApprovalForSettlement ? "ON" : "OFF"}</Badge></span>
        <span className="k">روش‌های مجاز</span>
        <span className="v mono" style={{ fontSize: 12 }}>{(c.settlementMethods || []).join(", ") || "FULL, NET, TOPUP"}</span>
        <span className="k">Netting</span>
        <span className="v"><Badge kind={c.nettingEnabled ? "green" : "gray"}>{c.nettingEnabled ? "فعال" : "غیرفعال"}</Badge></span>
      </div>
      <div className="row" style={{ gap: 6, marginTop: 10 }}>
        <button className="btn sm" onClick={async () => {
          await api.post(`/admin/credits/${c.id}/settlement-policy`, { requireAdminApprovalForSettlement: !c.requireAdminApprovalForSettlement });
          onToggled();
        }}>
          {c.requireAdminApprovalForSettlement ? "خاموش‌کردن تأیید ادمین" : "فعال‌کردن تأیید ادمین"}
        </button>
        <button className="btn sm" onClick={async () => {
          await api.post(`/admin/credits/${c.id}/settlement-policy`, { nettingEnabled: !c.nettingEnabled });
          onToggled();
        }}>
          {c.nettingEnabled ? "غیرفعال‌کردن Netting" : "فعال‌کردن Netting"}
        </button>
      </div>
    </div>
  );
}
