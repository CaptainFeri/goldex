/** How a pair chooses between its direct quote and a bridged one. */
export enum RoutingModeEnum {
  /** Direct when usable; a bridge only as a fallback. The default. */
  AUTO = "AUTO",
  /** Never bridge — the pair is closed when its direct quote is unusable. */
  DIRECT = "DIRECT",
  /** Always bridge, even when a direct quote is available. */
  BRIDGE = "BRIDGE",
  /** Whichever usable route gives the customer the better price, per side. */
  BEST = "BEST",
}
