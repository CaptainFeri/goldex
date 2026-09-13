export enum PacketStatusEnum {
  /** A placeholder for a delivery that has been approved but has not arrived. */
  PENDING = "PENDING",
  /** Legacy: a package held under a named owner, before the vault became a pool. */
  IN_WAREHOUSE = "IN_WAREHOUSE",
  /**
   * On the shelf and free to allocate. Every package the vault holds is here:
   * it belongs to the system, not to whoever handed it in.
   */
  ORPHAN = "ORPHAN",
  /**
   * Held for one withdrawal request while it is being processed.
   *
   * Without this, an assigned package looked exactly like a free one and two
   * withdrawals could be approved against the same metal.
   */
  RESERVED = "RESERVED",
  RELEASED = "RELEASED",
  WITHDRAWN = "WITHDRAWN",
}
