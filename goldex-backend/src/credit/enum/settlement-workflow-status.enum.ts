/**
 * Delivery-based settlement workflow states (handoff §7).
 *
 * A credit trade is settled by delivering the required asset, verifying it,
 * clearing the negative credit liability from the cash wallet, transferring the
 * credit asset to cash, releasing the per-trade collateral lock and finally
 * closing the trade.
 */
export enum SettlementWorkflowStatusEnum {
  REQUESTED = "SETTLEMENT_REQUESTED",
  ASSET_RECEIVED = "ASSET_RECEIVED",
  ASSET_VERIFIED = "ASSET_VERIFIED",
  LIABILITY_CLEARED = "LIABILITY_CLEARED",
  ASSET_SETTLED = "ASSET_SETTLED",
  COLLATERAL_RELEASED = "COLLATERAL_RELEASED",
  CLOSED = "CLOSED",
  FAILED = "FAILED",
}