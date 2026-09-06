/**
 * Which side of the live quote values an asset the platform holds.
 *
 * BID is what the platform could realize by selling now (the conservative
 * mark), ASK is what replacing the asset would cost, MID splits them. The
 * choice moves reported profit, so it belongs to the admin, not to a constant.
 */
export enum ValuationBasisEnum {
  /** The price customers sell at — the platform's realizable value. */
  BID = "BID",
  /** The price customers buy at — replacement cost. */
  ASK = "ASK",
  /** Midpoint of bid and ask. */
  MID = "MID",
}
