import {
  P2pIntentStateEnum,
  P2pMatchStatusEnum,
  P2pPartStatusEnum,
  P2pWithdrawStateEnum,
} from "../p2p/enum/p2p.enums";
import { EmStatus } from "./em.enums";
import { depositStatus, withdrawStatus } from "./em-status";

/**
 * The plan's mapping table, asserted.
 *
 * These four statuses are what the EM desk triages on, and they are derived
 * from state machines that were designed for something else — so the edges
 * (a request that is partly paid, one rejected while parts are still open)
 * are where a projection quietly says the wrong thing.
 */
const w = (over: Partial<Parameters<typeof withdrawStatus>[0]> = {}) =>
  withdrawStatus({
    state: P2pWithdrawStateEnum.PENDING_MATCHING,
    hasAssignedAccount: false,
    partStatuses: [],
    matchStatuses: [],
    ...over,
  });

describe("withdrawStatus", () => {
  it("is awaiting an account while it is still looking for one", () => {
    expect(w({ state: P2pWithdrawStateEnum.PENDING_MATCHING })).toBe(EmStatus.AWAITING_ACCOUNT);
  });

  it("distinguishes admin settlement before and after an account is assigned", () => {
    // The plan's one genuinely conditional row.
    expect(w({ state: P2pWithdrawStateEnum.ADMIN_SETTLEMENT, hasAssignedAccount: false }))
      .toBe(EmStatus.AWAITING_ACCOUNT);
    expect(w({ state: P2pWithdrawStateEnum.ADMIN_SETTLEMENT, hasAssignedAccount: true }))
      .toBe(EmStatus.AWAITING_RECEIPT);
  });

  it("is awaiting a receipt once a part is reserved or a match awaits payment", () => {
    expect(w({ partStatuses: [P2pPartStatusEnum.RESERVED] })).toBe(EmStatus.AWAITING_RECEIPT);
    expect(w({ matchStatuses: [P2pMatchStatusEnum.AWAITING_PAYMENT] })).toBe(EmStatus.AWAITING_RECEIPT);
  });

  it("counts a submitted or confirmed proof as paid", () => {
    for (const s of [
      P2pMatchStatusEnum.PROOF_SUBMITTED,
      P2pMatchStatusEnum.WAITING_CONFIRMATION,
      P2pMatchStatusEnum.CONFIRMED,
    ]) {
      expect(w({ matchStatuses: [s] })).toBe(EmStatus.RECEIPT_PAID);
    }
  });

  it("reports a partly paid request as paid, not as still waiting", () => {
    // One part reserved, another already confirmed: the desk needs to see that
    // a receipt has arrived, or it chases a payment that was made.
    expect(
      w({
        state: P2pWithdrawStateEnum.PARTIALLY_MATCHED,
        partStatuses: [P2pPartStatusEnum.RESERVED, P2pPartStatusEnum.CONFIRMED],
        matchStatuses: [P2pMatchStatusEnum.AWAITING_PAYMENT, P2pMatchStatusEnum.CONFIRMED],
      }),
    ).toBe(EmStatus.RECEIPT_PAID);
  });

  it("lets a rejection outrank everything else", () => {
    expect(w({ matchStatuses: [P2pMatchStatusEnum.REJECTED_BY_WITHDRAWER, P2pMatchStatusEnum.CONFIRMED] }))
      .toBe(EmStatus.REJECTED);
    expect(w({ rejectedByEscalation: true, matchStatuses: [P2pMatchStatusEnum.CONFIRMED] }))
      .toBe(EmStatus.REJECTED);
  });

  it("closes finished requests instead of leaving them in a queue", () => {
    for (const s of [
      P2pWithdrawStateEnum.COMPLETED,
      P2pWithdrawStateEnum.EXPIRED,
      P2pWithdrawStateEnum.CANCELLED,
      P2pWithdrawStateEnum.DRAFT,
    ]) {
      expect(w({ state: s })).toBe(EmStatus.CLOSED);
    }
  });

  it("still reports a completed request that was rejected as rejected", () => {
    expect(w({ state: P2pWithdrawStateEnum.COMPLETED, rejectedByEscalation: true }))
      .toBe(EmStatus.REJECTED);
  });
});

describe("depositStatus", () => {
  it.each([
    [P2pIntentStateEnum.CREATED, EmStatus.AWAITING_ACCOUNT],
    [P2pIntentStateEnum.MATCHING, EmStatus.AWAITING_ACCOUNT],
    [P2pIntentStateEnum.NO_MATCH, EmStatus.AWAITING_ACCOUNT],
    [P2pIntentStateEnum.RESERVED, EmStatus.AWAITING_RECEIPT],
    [P2pIntentStateEnum.AWAITING_PAYMENT, EmStatus.AWAITING_RECEIPT],
    [P2pIntentStateEnum.ESCALATED_TO_ADMIN, EmStatus.AWAITING_RECEIPT],
    [P2pIntentStateEnum.PAYMENT_PROOF_SUBMITTED, EmStatus.RECEIPT_PAID],
    [P2pIntentStateEnum.CONFIRMED, EmStatus.RECEIPT_PAID],
    [P2pIntentStateEnum.REJECTED_BY_WITHDRAWER, EmStatus.REJECTED],
    [P2pIntentStateEnum.REJECTED, EmStatus.REJECTED],
    [P2pIntentStateEnum.EXPIRED, EmStatus.CLOSED],
    [P2pIntentStateEnum.CANCELLED, EmStatus.CLOSED],
    [P2pIntentStateEnum.REFUNDED, EmStatus.CLOSED],
  ])("maps %s to %s", (state, expected) => {
    expect(depositStatus(state)).toBe(expected);
  });

  it("has an answer for every intent state the enum defines", () => {
    // The switch is exhaustive by design; this fails loudly if a state is added
    // to the enum without a decision being made here.
    for (const state of Object.values(P2pIntentStateEnum)) {
      expect(Object.values(EmStatus)).toContain(depositStatus(state));
    }
  });
});
