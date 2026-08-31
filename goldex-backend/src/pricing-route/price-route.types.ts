import { OrderSideEnum } from "../order/enum/order.side.enum";
import { RoutingModeEnum } from "./enum/routing-mode.enum";

export type RouteSide = OrderSideEnum.BUY | OrderSideEnum.SELL;

export enum RouteKind {
  DIRECT = "DIRECT",
  BRIDGE = "BRIDGE",
}

/** Why a candidate route cannot be used right now. */
export enum RouteRejection {
  NO_DIRECT_PAIR = "no-direct-pair",
  PAIR_INVALID = "pair-invalid",
  NO_PRICE = "no-price",
  STALE_PRICE = "stale-price",
  /** The bridge symbol is not a pure scalar, so the legs' units do not cancel. */
  BRIDGE_UNIT_UNSAFE = "bridge-unit-unsafe",
  NO_BRIDGE_FOUND = "no-bridge-found",
  /** The bridged price differs from the direct one by more than the pair allows. */
  DEVIATION_EXCEEDED = "deviation-exceeded",
  /** Excluded by the pair's routing mode, not by its prices. */
  MODE_EXCLUDED = "mode-excluded",
}

/** One hop of a route, always expressed in the direction base -> quote. */
export interface RouteLeg {
  pairId: string;
  baseSlug: string;
  quoteSlug: string;
  /** True when the stored pair is quote/base and its price was inverted. */
  inverted: boolean;
  /** Price used for this side, after inversion. */
  price: number;
  provider: string | null;
  lastUpdated: string | null;
  stale: boolean;
}

export interface RouteCandidate {
  kind: RouteKind;
  side: RouteSide;
  /** Bridge symbol slug, for a bridged route. */
  bridgeSlug: string | null;
  bridgeSymbolId: string | null;
  legs: RouteLeg[];
  /**
   * Composed price in the pair's native units — the same units as
   * `bestBuyPrice` / `bestSellPrice`, so callers can substitute it directly.
   * Null when the route is unusable.
   */
  price: number | null;
  usable: boolean;
  rejection: RouteRejection | null;
  /** Human-readable explanation, always set when `usable` is false. */
  note: string | null;
  /** Signed difference from the direct price, in percent, when both exist. */
  deviationPercent: number | null;
}

export interface PriceRoute {
  pairId: string;
  pairLabel: string;
  side: RouteSide;
  routingMode: RoutingModeEnum;
  /** The route actually chosen, or null when nothing is usable. */
  selected: RouteCandidate | null;
  direct: RouteCandidate | null;
  bridges: RouteCandidate[];
  /** Set when a usable bridge was rejected for exceeding the deviation limit. */
  deviationBlocked: boolean;
}

/** Both sides of one pair, which is what pricing callers need. */
export interface PairRoutes {
  pairId: string;
  pairLabel: string;
  routingMode: RoutingModeEnum;
  configuredBridgeSlug: string | null;
  bridgeMaxDeviationPercent: number | null;
  buy: PriceRoute;
  sell: PriceRoute;
  /** True when either side is priced through a bridge. */
  usesBridge: boolean;
  /** True when neither side has a usable route — the pair cannot be quoted. */
  unpriceable: boolean;
}
