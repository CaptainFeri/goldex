import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { LessThanOrEqual, Repository } from "typeorm";
import Decimal from "decimal.js";
import { PacketEntity } from "../entity/packet.entity";
import { WarehouseRequestEntity } from "../entity/warehouse-request.entity";
import { PacketStatusEnum } from "../enum/packet-status.enum";
import { RequestStatusEnum } from "../enum/request-status.enum";
import { RequestTypeEnum } from "../enum/request-type.enum";
import { TOLERANCE_GRAMS } from "../constants/warehouse.constants";

export type AllocationKind = "exact" | "fit" | "combination";

export interface AllocationOption {
  kind: AllocationKind;
  optionKey: string;
  title: string;
  packetIds: string[];
  /** Net weight (750) that will be physically delivered. */
  deliveredWeight: number;
  /** Digital refund that will be returned to the user wallet at delivery. */
  refundWeight: number;
  /** Labels describing the packet weights used. */
  description: string;
}

/** One package the request could be served from. */
export interface AllocationCandidate {
  packetId: string;
  idSecure: string;
  warehouseId: string;
  /** Net weight (750) of the package. */
  pureWeight: number;
  /** What comes back to the wallet if this one is delivered. */
  refundWeight: number;
  /** Whether it matches the request within the tolerance threshold. */
  isExactMatch: boolean;
  ang: number | null;
  ayar: number | null;
  warehouseIndexPosition: string | null;
}

@Injectable()
export class AllocationService {
  private readonly logger = new Logger(AllocationService.name);

  constructor(
    @InjectRepository(PacketEntity)
    private readonly packetRepository: Repository<PacketEntity>,
    @InjectRepository(WarehouseRequestEntity)
    private readonly requestRepository: Repository<WarehouseRequestEntity>
  ) {}

  /**
   * Every package in a warehouse that could serve a request of this size.
   *
   * The vault is one pool of fungible packages, so there is no "the user's own
   * gold" to look at first: what a user holds lives in their wallet, and any
   * package on the shelf can be handed to them. The list is therefore just
   * what the warehouse has at or under the requested weight, best fit first,
   * with the refund each choice implies.
   *
   * Weights at or under the target only. Handing over more metal than was
   * asked for would take gold the user has not paid for, and there is nothing
   * to charge the difference against.
   *
   * Filtered by symbol as well as weight: matching on weight alone let a
   * request for gold be served a package of silver.
   */
  async listCandidates(params: {
    warehouseId: string;
    symbolId?: string;
    weight: number | string;
  }): Promise<AllocationCandidate[]> {
    const target = new Decimal(params.weight);

    if (target.lessThanOrEqualTo(0)) {
      throw new BadRequestException("Requested weight must be greater than zero");
    }
    if (!params.warehouseId) {
      throw new BadRequestException("SELECT_WAREHOUSE");
    }

    const packets = await this.packetRepository.find({
      where: {
        warehouseId: params.warehouseId,
        // ORPHAN is the whole free shelf; RESERVED packages are spoken for.
        status: PacketStatusEnum.ORPHAN,
        pureWeight: LessThanOrEqual(target.toNumber()),
        ...(params.symbolId ? { symbolId: params.symbolId } : {}),
      } as any,
      // Heaviest first: the closest fit from below is the smallest refund, and
      // the roadmap's priority is the lowest negative variance.
      order: { pureWeight: "DESC" },
    });

    return packets.map((packet) => {
      const weight = new Decimal(packet.pureWeight);
      return {
        packetId: packet.id,
        idSecure: packet.idSecure,
        warehouseId: packet.warehouseId,
        pureWeight: weight.toNumber(),
        refundWeight: target.minus(weight).toNumber(),
        isExactMatch: this.withinTolerance(weight, target),
        ang: packet.ang ?? null,
        ayar: packet.ayar ?? null,
        warehouseIndexPosition: packet.warehouseIndexPosition ?? null,
      };
    });
  }

  /**
   * Outbound allocation for one request (roadmap §3), in priority order:
   *
   *   1. Exact match — a package whose net weight equals the target within the
   *      tolerance threshold.
   *   2. Best fit from below — the heaviest package under the target, i.e. the
   *      lowest negative variance.
   *   3. Fewest-package combination summing as close to the target as possible.
   *
   * Each option carries the refund: `requested − delivered` grams returned to
   * the wallet at delivery. The roadmap's first priority, "previous deposit
   * check", is deliberately gone — a deposited package joins the pool, so
   * there is no longer such a thing as the user's own package to prefer.
   */
  async suggestForRequest(requestId: string): Promise<AllocationOption[]> {
    const request = await this.requestRepository.findOne({
      where: { id: requestId },
      relations: { user: true, warehouse: true },
    });

    if (!request) throw new NotFoundException("Request not found");
    if (request.type !== RequestTypeEnum.OUTPUT) {
      throw new BadRequestException("Allocation only applies to OUTPUT (withdraw) requests");
    }
    if (request.status !== RequestStatusEnum.PENDING && request.status !== RequestStatusEnum.APPROVED) {
      throw new BadRequestException(
        `Allocation only applies to PENDING/APPROVED requests (current: ${request.status})`
      );
    }

    const target = new Decimal(request.weight);
    const candidates = await this.listCandidates({
      warehouseId: request.warehouseId,
      symbolId: request.symbolId,
      weight: target.toNumber(),
    });

    const options: AllocationOption[] = [];

    const exact = candidates.find((candidate) => candidate.isExactMatch);
    if (exact) {
      options.push({
        kind: "exact",
        optionKey: `exact:${exact.packetId}`,
        title: "تطابق دقیق",
        packetIds: [exact.packetId],
        deliveredWeight: exact.pureWeight,
        refundWeight: 0,
        description: `بسته ${exact.idSecure} (${exact.pureWeight} گرم) دقیقاً با درخواست می‌خواند.`,
      });
    }

    // Already sorted heaviest-first, so the first non-exact candidate is the
    // closest fit from below.
    const bestFit = candidates.find((candidate) => !candidate.isExactMatch);
    if (bestFit) {
      options.push({
        kind: "fit",
        optionKey: `fit:${bestFit.packetId}`,
        title: "نزدیک‌ترین بسته کمتر از درخواست",
        packetIds: [bestFit.packetId],
        deliveredWeight: bestFit.pureWeight,
        refundWeight: bestFit.refundWeight,
        description:
          `بسته ${bestFit.idSecure} (${bestFit.pureWeight} گرم) تحویل می‌شود و ` +
          `${bestFit.refundWeight} گرم اختلاف به کیف پول دیجیتال بازمی‌گردد.`,
      });
    }

    const combination = this.findMinCountCombination(candidates, target);
    if (combination) {
      const total = combination.reduce((sum, item) => sum.plus(new Decimal(item.pureWeight)), new Decimal(0));
      options.push({
        kind: "combination",
        optionKey: `combination:${combination.map((item) => item.packetId).join("_")}`,
        title: `ترکیب ${combination.length} بسته`,
        packetIds: combination.map((item) => item.packetId),
        deliveredWeight: total.toNumber(),
        refundWeight: target.minus(total).toNumber(),
        description: combination.map((item) => `${item.idSecure}(${item.pureWeight} گرم)`).join(" + "),
      });
    }

    return options;
  }

  /** Differences below the threshold are zero (roadmap §4). */
  private withinTolerance(a: Decimal, b: Decimal): boolean {
    return a.minus(b).absoluteValue().lessThanOrEqualTo(TOLERANCE_GRAMS);
  }

  /**
   * Fewest packages whose total comes closest to the target without going over.
   *
   * Bounded rather than exhaustive: the search stops at six packages and only
   * looks at the heaviest candidates, because a handover of more pieces than
   * that is not one an operator would make and the subset search grows
   * exponentially. Returned only when it beats the best single package —
   * otherwise it is strictly worse for the same refund.
   */
  private findMinCountCombination(
    candidates: AllocationCandidate[],
    target: Decimal
  ): AllocationCandidate[] | null {
    const MAX_PACKETS = 6;
    const SEARCH_WIDTH = 16;

    const usable = candidates.slice(0, SEARCH_WIDTH);
    if (usable.length < 2) return null;

    const bestSingle = new Decimal(usable[0].pureWeight);

    let best: AllocationCandidate[] | null = null;
    let bestSum = new Decimal(0);

    const search = (start: number, path: AllocationCandidate[], sum: Decimal) => {
      if (path.length >= 2) {
        const better =
          sum.greaterThan(bestSum) || (sum.equals(bestSum) && best !== null && path.length < best.length);
        if (better) {
          bestSum = sum;
          best = [...path];
        }
      }
      if (path.length >= MAX_PACKETS) return;

      for (let i = start; i < usable.length; i++) {
        const next = sum.plus(new Decimal(usable[i].pureWeight));
        if (next.lessThanOrEqualTo(target)) {
          search(i + 1, [...path, usable[i]], next);
        }
      }
    };
    search(0, [], new Decimal(0));

    if (!best || !bestSum.greaterThan(bestSingle)) return null;
    return best;
  }

  parseOptionKey(optionKey: string): { kind: string; packetIds: string[] } {
    const idx = optionKey.indexOf(":");
    if (idx === -1) throw new BadRequestException("Invalid allocation option key");
    const kind = optionKey.slice(0, idx);
    const raw = optionKey.slice(idx + 1);
    return { kind, packetIds: raw ? raw.split("_") : [] };
  }
}
