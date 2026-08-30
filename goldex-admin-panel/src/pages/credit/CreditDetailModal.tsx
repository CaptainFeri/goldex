import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";
import { Modal, Loading } from "../../components/ui";
import type { Credit } from "../../api/types";
import { RiskPanel } from "./detail/RiskPanel";
import { CreditSummary } from "./detail/CreditSummary";
import { PnlSection, type CreditPnl } from "./detail/PnlSection";
import { CollateralLocksPanel } from "./detail/CollateralLocksPanel";
import { SettlementWorkflowPanel } from "./detail/SettlementWorkflowPanel";
import { SettlementPolicyPanel } from "./detail/SettlementPolicyPanel";
import { CreditMetadata } from "./detail/CreditMetadata";
import { Tabs } from "./detail/Tabs";

/**
 * Full detail view of one credit facility: live risk/valuation, the core
 * summary, P&L + order history, collateral locks, the delivery-based
 * settlement workflow, settlement policy toggles and raw metadata. Laid out
 * as tabs — one section visible at a time — instead of one long scroll of
 * everything at once, which is what made this view hard to follow.
 */
export function CreditDetailModal({ credit, onClose }: { credit: Credit; onClose: () => void }) {
  const creditDetail = useQuery({
    queryKey: ["credit-detail", credit.id],
    queryFn: async () => unwrap<Credit>((await api.get(`/admin/credits/${credit.id}`)).data),
  });

  const pnl = useQuery({
    queryKey: ["credit-pnl", credit.id],
    queryFn: async () => unwrap<CreditPnl>((await api.get(`/admin/credits/${credit.id}/pnl`)).data),
  });

  const risk = useQuery({
    queryKey: ["credit-risk", credit.id],
    queryFn: async () => unwrap<any>((await api.get(`/admin/credits/${credit.id}/risk`)).data),
  });

  // Per-trade collateral locks (handoff §13).
  const locks = useQuery({
    queryKey: ["credit-locks", credit.id],
    queryFn: async () => unwrap<{ summary: any; locks: any[] }>((await api.get(`/admin/credits/${credit.id}/locks`)).data),
  });

  const c = creditDetail.data || credit;

  return (
    <Modal title={`جزئیات اعتبار ${c.creditCode}`} onClose={onClose} wide>
      {creditDetail.isLoading ? (
        <Loading />
      ) : (
        <>
          <Tabs
            tabs={[
              {
                key: "summary",
                label: "خلاصه و ریسک",
                content: (
                  <>
                    <CreditSummary c={c} />
                    <RiskPanel riskData={risk.data} />
                  </>
                ),
              },
              {
                key: "pnl",
                label: "سود و زیان",
                content: <PnlSection isLoading={pnl.isLoading} pnlData={pnl.data} creditOrders={c.creditOrders} />,
              },
              {
                key: "settlement",
                label: "تسویه",
                content: <SettlementWorkflowPanel credit={c} />,
              },
              {
                key: "collateral",
                label: "وثیقه و سیاست‌ها",
                content: (
                  <>
                    <CollateralLocksPanel isLoading={locks.isLoading} data={locks.data} collateralAmount={c.collateralAmount} />
                    <SettlementPolicyPanel c={c} onToggled={() => creditDetail.refetch()} />
                    <CreditMetadata metadata={c.metadata} />
                  </>
                ),
              },
            ]}
          />

          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>بستن</button>
          </div>
        </>
      )}
    </Modal>
  );
}
