import { BadRequestException } from "@nestjs/common";
import {
  P2pEscalationStatusEnum,
  P2pIntentStateEnum as I,
  P2pMatchStatusEnum as M,
  P2pPartStatusEnum as P,
  P2pWithdrawStateEnum as W,
} from "../enum/p2p.enums";

/**
 * The financial state machines are declared here, once, so a transition is
 * never a loose flag flip somewhere in a service (spec §17).
 */

const WITHDRAW: Record<W, W[]> = {
  [W.DRAFT]: [W.PENDING_MATCHING, W.CANCELLED],
  [W.PENDING_MATCHING]: [W.PARTIALLY_MATCHED, W.COMPLETED, W.ADMIN_SETTLEMENT, W.EXPIRED, W.CANCELLED],
  [W.PARTIALLY_MATCHED]: [W.PARTIALLY_MATCHED, W.COMPLETED, W.ADMIN_SETTLEMENT, W.EXPIRED],
  [W.ADMIN_SETTLEMENT]: [W.COMPLETED, W.CANCELLED, W.EXPIRED],
  [W.COMPLETED]: [],
  [W.EXPIRED]: [W.PENDING_MATCHING], // admin reopen, where policy allows
  [W.CANCELLED]: [],
};

const INTENT: Record<I, I[]> = {
  [I.CREATED]: [I.MATCHING, I.CANCELLED, I.EXPIRED],
  [I.MATCHING]: [I.RESERVED, I.NO_MATCH, I.CANCELLED, I.EXPIRED],
  [I.NO_MATCH]: [I.MATCHING, I.CANCELLED, I.EXPIRED],
  [I.RESERVED]: [I.AWAITING_PAYMENT, I.PAYMENT_PROOF_SUBMITTED, I.MATCHING, I.CANCELLED, I.EXPIRED],
  [I.AWAITING_PAYMENT]: [I.PAYMENT_PROOF_SUBMITTED, I.MATCHING, I.CANCELLED, I.EXPIRED],
  [I.PAYMENT_PROOF_SUBMITTED]: [I.WAITING_WITHDRAWER_CONFIRMATION, I.ESCALATED_TO_ADMIN],
  [I.WAITING_WITHDRAWER_CONFIRMATION]: [
    I.CONFIRMED,
    I.REJECTED_BY_WITHDRAWER,
    I.WITHDRAWER_RESPONSE_TIMEOUT,
    I.ESCALATED_TO_ADMIN,
  ],
  [I.REJECTED_BY_WITHDRAWER]: [I.ESCALATED_TO_ADMIN],
  [I.WITHDRAWER_RESPONSE_TIMEOUT]: [I.ESCALATED_TO_ADMIN],
  [I.ESCALATED_TO_ADMIN]: [
    I.CONFIRMED,
    I.REJECTED,
    I.REFUNDED,
    I.MORE_INFO_REQUESTED,
    I.MATCHING,
    I.CANCELLED,
  ],
  [I.MORE_INFO_REQUESTED]: [I.ESCALATED_TO_ADMIN, I.CONFIRMED, I.REJECTED, I.REFUNDED],
  [I.CONFIRMED]: [],
  [I.REJECTED]: [],
  [I.REFUNDED]: [],
  [I.EXPIRED]: [],
  [I.CANCELLED]: [],
};

const PART: Record<P, P[]> = {
  [P.OPEN]: [P.RESERVED, P.CANCELLED, P.EXPIRED],
  [P.RESERVED]: [P.PAID_PENDING, P.OPEN, P.CANCELLED, P.EXPIRED],
  [P.PAID_PENDING]: [P.CONFIRMED, P.OPEN, P.CANCELLED],
  [P.CONFIRMED]: [],
  [P.CANCELLED]: [],
  [P.EXPIRED]: [P.OPEN],
};

const MATCH: Record<M, M[]> = {
  [M.RESERVED]: [M.AWAITING_PAYMENT, M.PROOF_SUBMITTED, M.CANCELLED, M.RESERVATION_EXPIRED],
  [M.AWAITING_PAYMENT]: [M.PROOF_SUBMITTED, M.CANCELLED, M.RESERVATION_EXPIRED],
  [M.PROOF_SUBMITTED]: [M.WAITING_CONFIRMATION, M.ESCALATED],
  [M.WAITING_CONFIRMATION]: [
    M.CONFIRMED,
    M.REJECTED_BY_WITHDRAWER,
    M.RESPONSE_TIMEOUT,
    M.ESCALATED,
  ],
  [M.REJECTED_BY_WITHDRAWER]: [M.ESCALATED],
  [M.RESPONSE_TIMEOUT]: [M.ESCALATED],
  [M.ESCALATED]: [M.CONFIRMED, M.CANCELLED],
  [M.CONFIRMED]: [],
  [M.RESERVATION_EXPIRED]: [],
  [M.CANCELLED]: [],
};

const ESCALATION: Record<P2pEscalationStatusEnum, P2pEscalationStatusEnum[]> = {
  [P2pEscalationStatusEnum.OPEN]: [
    P2pEscalationStatusEnum.ASSIGNED,
    P2pEscalationStatusEnum.RESOLVED,
    P2pEscalationStatusEnum.VOID,
  ],
  [P2pEscalationStatusEnum.ASSIGNED]: [
    P2pEscalationStatusEnum.RESOLVED,
    P2pEscalationStatusEnum.VOID,
  ],
  [P2pEscalationStatusEnum.RESOLVED]: [],
  [P2pEscalationStatusEnum.VOID]: [],
};

function assert<T extends string>(table: Record<T, T[]>, kind: string, from: T, to: T): void {
  if (from === to) return;
  if (!table[from]?.includes(to)) {
    throw new BadRequestException(`Illegal ${kind} transition: ${from} → ${to}`);
  }
}

export const assertWithdrawTransition = (from: W, to: W) => assert(WITHDRAW, "withdrawal", from, to);
export const assertIntentTransition = (from: I, to: I) => assert(INTENT, "deposit intent", from, to);
export const assertPartTransition = (from: P, to: P) => assert(PART, "withdrawal part", from, to);
export const assertMatchTransition = (from: M, to: M) => assert(MATCH, "match", from, to);
export const assertEscalationTransition = (
  from: P2pEscalationStatusEnum,
  to: P2pEscalationStatusEnum,
) => assert(ESCALATION, "escalation", from, to);
