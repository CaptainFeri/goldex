import {
  P2pIntentStateEnum,
  P2pMatchStatusEnum,
  P2pPartStatusEnum,
  P2pWithdrawStateEnum,
} from "../p2p/enum/p2p.enums";
import { EmStatus } from "./em.enums";

/**
 * The mapping table from the plan, as code.
 *
 * It lives in exactly one function on purpose: written as a CASE expression it
 * would be copied into every handler that needs it, and the copies would drift
 * until two screens disagreed about what a request is waiting for.
 *
 * These are *derived*, never stored. The P2P state machines remain the only
 * source of truth; if a status here looks wrong, the fix is in this function,
 * not a column somewhere.
 */

export interface WithdrawProjectionInput {
  state: P2pWithdrawStateEnum;
  /** Whether an admin bank account has been assigned for company settlement. */
  hasAssignedAccount: boolean;
  partStatuses: P2pPartStatusEnum[];
  matchStatuses: P2pMatchStatusEnum[];
  /** An escalation on this request that was resolved as a rejection. */
  rejectedByEscalation?: boolean;
}

export function withdrawStatus(input: WithdrawProjectionInput): EmStatus {
  const { state, hasAssignedAccount, partStatuses, matchStatuses } = input;

  // A recorded rejection outranks everything: the request is finished, whatever
  // its parts still say.
  if (input.rejectedByEscalation) return EmStatus.REJECTED;
  if (matchStatuses.includes(P2pMatchStatusEnum.REJECTED_BY_WITHDRAWER)) return EmStatus.REJECTED;

  if (
    state === P2pWithdrawStateEnum.COMPLETED ||
    state === P2pWithdrawStateEnum.EXPIRED ||
    state === P2pWithdrawStateEnum.CANCELLED ||
    state === P2pWithdrawStateEnum.DRAFT
  ) {
    return EmStatus.CLOSED;
  }

  // Paid before waiting: a request with one confirmed receipt and one part
  // still open has had a receipt, and the screen groups it there.
  if (
    matchStatuses.includes(P2pMatchStatusEnum.PROOF_SUBMITTED) ||
    matchStatuses.includes(P2pMatchStatusEnum.WAITING_CONFIRMATION) ||
    matchStatuses.includes(P2pMatchStatusEnum.CONFIRMED)
  ) {
    return EmStatus.RECEIPT_PAID;
  }

  if (
    partStatuses.includes(P2pPartStatusEnum.RESERVED) ||
    partStatuses.includes(P2pPartStatusEnum.PAID_PENDING) ||
    matchStatuses.includes(P2pMatchStatusEnum.AWAITING_PAYMENT) ||
    matchStatuses.includes(P2pMatchStatusEnum.RESERVED)
  ) {
    return EmStatus.AWAITING_RECEIPT;
  }

  // ADMIN_SETTLEMENT with an account already assigned is waiting for the
  // company to pay, not for an account.
  if (state === P2pWithdrawStateEnum.ADMIN_SETTLEMENT) {
    return hasAssignedAccount ? EmStatus.AWAITING_RECEIPT : EmStatus.AWAITING_ACCOUNT;
  }

  return EmStatus.AWAITING_ACCOUNT;
}

export function depositStatus(state: P2pIntentStateEnum): EmStatus {
  switch (state) {
    case P2pIntentStateEnum.REJECTED_BY_WITHDRAWER:
    case P2pIntentStateEnum.REJECTED:
      return EmStatus.REJECTED;

    case P2pIntentStateEnum.PAYMENT_PROOF_SUBMITTED:
    case P2pIntentStateEnum.WAITING_WITHDRAWER_CONFIRMATION:
    case P2pIntentStateEnum.CONFIRMED:
      return EmStatus.RECEIPT_PAID;

    case P2pIntentStateEnum.RESERVED:
    case P2pIntentStateEnum.AWAITING_PAYMENT:
    case P2pIntentStateEnum.MORE_INFO_REQUESTED:
    case P2pIntentStateEnum.ESCALATED_TO_ADMIN:
      return EmStatus.AWAITING_RECEIPT;

    case P2pIntentStateEnum.CREATED:
    case P2pIntentStateEnum.MATCHING:
    case P2pIntentStateEnum.NO_MATCH:
      return EmStatus.AWAITING_ACCOUNT;

    // COMPLETED-ish and dead ends. Listed rather than defaulted so a new
    // intent state is a compile error here, not a silent "closed".
    case P2pIntentStateEnum.WITHDRAWER_RESPONSE_TIMEOUT:
    case P2pIntentStateEnum.REFUNDED:
    case P2pIntentStateEnum.EXPIRED:
    case P2pIntentStateEnum.CANCELLED:
      return EmStatus.CLOSED;
  }
}
