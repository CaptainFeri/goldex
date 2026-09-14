/** Which way the metal crossed the warehouse door. */
export enum MovementDirectionEnum {
  IN = "IN",
  OUT = "OUT",
}

/**
 * Who the warehouse dealt with.
 *
 * SYSTEM covers movements with no outside counterparty — the wastage consumed
 * when a package is cut, say, which leaves the shelf without going to anyone.
 */
export enum MovementPartyEnum {
  USER = "USER",
  PROVIDER = "PROVIDER",
  SYSTEM = "SYSTEM",
}

/**
 * What caused the movement.
 *
 * A movement is the physical fact; this says which process produced it. The
 * request-driven ones carry a `requestId`, so a movement can always be traced
 * back to the paperwork that authorised it — and a MANUAL one is exactly the
 * movement that has none, which is why it is worth being able to list them.
 */
export enum MovementSourceEnum {
  DEPOSIT_REQUEST = "DEPOSIT_REQUEST",
  WITHDRAW_REQUEST = "WITHDRAW_REQUEST",
  SETTLEMENT = "SETTLEMENT",
  MANUAL = "MANUAL",
  WASTAGE = "WASTAGE",
}
