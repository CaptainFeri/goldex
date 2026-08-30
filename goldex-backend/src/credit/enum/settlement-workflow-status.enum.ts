/**
 * Delivery-based settlement workflow states (handoff §6.6, §7, §13).
 *
 * The revised handoff adds an optional admin-approval stage, a valuation stage
 * (three states: exposure < / = / > collateral), a user-selected settlement
 * method and a funding stage for shortfalls:
 *
 *   SETTLEMENT_REQUESTED → PENDING_ADMIN_REVIEW (if approval policy ON)
 *   → APPROVED → VALUATED → METHOD_SELECTED → FUNDING_REQUIRED/READY
 *   → ASSET_RECEIVED → ASSET_VERIFIED → LIABILITY_CLEARED → ASSET_SETTLED
 *   → COLLATERAL_RELEASED → CLOSED
 *   with REJECTED (admin decline) and FAILED (retryable) terminal states.
 */
export enum SettlementWorkflowStatusEnum {
  SETTLEMENT_REQUESTED = "SETTLEMENT_REQUESTED",
  PENDING_ADMIN_REVIEW = "PENDING_ADMIN_REVIEW",
  APPROVED = "APPROVED",
  VALUATED = "VALUATED",
  METHOD_SELECTED = "METHOD_SELECTED",
  FUNDING_REQUIRED = "FUNDING_REQUIRED",
  READY = "READY",
  ASSET_RECEIVED = "ASSET_RECEIVED",
  ASSET_VERIFIED = "ASSET_VERIFIED",
  LIABILITY_CLEARED = "LIABILITY_CLEARED",
  ASSET_SETTLED = "ASSET_SETTLED",
  COLLATERAL_RELEASED = "COLLATERAL_RELEASED",
  CLOSED = "CLOSED",
  REJECTED = "REJECTED",
  FAILED = "FAILED",
}

/** Settlement method selected by the user (handoff §6.5). */
export enum SettlementMethodEnum {
  FULL = "FULL",
  NET = "NET",
  TOPUP = "TOPUP",
}

/** Valuation comparison between credit exposure and current collateral value (handoff §6.4). */
export enum SettlementValuationStateEnum {
  EXPOSURE_LT_COLLATERAL = "EXPOSURE_LT_COLLATERAL",
  EXPOSURE_GT_COLLATERAL = "EXPOSURE_GT_COLLATERAL",
  EXPOSURE_EQ_COLLATERAL = "EXPOSURE_EQ_COLLATERAL",
}