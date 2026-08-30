/**
 * Collateral Lock lifecycle (handoff §13).
 *
 * A lock is reserved per credit trade: when a credit order is opened, the
 * required collateral (exposure / leverage) is locked (ACTIVE). The lock stays
 * ACTIVE while the position is open and is only released after the liability is
 * cleared, or consumed (written off) to cover a settlement deficit.
 */
export enum CollateralLockStatusEnum {
  CREATED = "CREATED",
  ACTIVE = "ACTIVE",
  RELEASE_PENDING = "RELEASE_PENDING",
  RELEASED = "RELEASED",
  CONSUMED = "CONSUMED",
}