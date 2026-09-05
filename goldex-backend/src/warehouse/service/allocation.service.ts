import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import Decimal from "decimal.js";
import { PacketEntity } from "../entity/packet.entity";
import { WarehouseRequestEntity } from "../entity/warehouse-request.entity";
import { PacketStatusEnum } from "../enum/packet-status.enum";
import { RequestStatusEnum } from "../enum/request-status.enum";
import { RequestTypeEnum } from "../enum/request-type.enum";
import { TOLERANCE_GRAMS } from "../constants/warehouse.constants";

export type AllocationKind = "own-exact" | "own-fit" | "orphan-exact" | "orphan-fit" | "combination";

export interface AllocationOption {
  kind: AllocationKind;
  optionKey: string;
  title: string;
  packetIds: string[];
  /** Net weight (750) that will be physically delivered. */
  deliveredWeight: number;
  /** Digital refund that will be returned to the user wallet at delivery. */
  refundWeight: number;
  /** Whether a split of a user packet is needed (delivers exactly requested). */
  splitsUserPacket: boolean;
  /** Labels describing the packet weights used. */
  description: string;
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
   * Outbound smart allocation algorithm (warehouse-roadmap.html §3).
   * Priority order:
   *   1. Previous Deposit Check — the user's own packets held IN_WAREHOUSE.
   *   2. Exact Match — a packet whose net weight equals the target (within tolerance).
   *   3. Best Fit (Lower Bound) — largest packet whose net weight is under the target.
   *   4. Minimum-count combination of orphan packets totaling the target (within tolerance).
   *
   * Every option carries the refund weight: (requested − delivered) grams returned
   * digitally to the wallet at delivery. Tolerance applied: |diff| < TOLERANCE → 0.
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

    const userPackets = await this.packetRepository.find({
      where: {
        userId: request.userId,
        status: PacketStatusEnum.IN_WAREHOUSE,
        isOrphan: false,
        ...(request.warehouseId ? { warehouseId: request.warehouseId } : {}),
      } as any,
      relations: { warehouse: true },
      order: { pureWeight: "ASC" },
    });

    const orphans = await this.packetRepository.find({
      where: {
        isOrphan: true,
        status: PacketStatusEnum.ORPHAN,
        ...(request.warehouseId ? { warehouseId: request.warehouseId } : {}),
      } as any,
      relations: { warehouse: true },
      order: { pureWeight: "ASC" },
    });

    const options: AllocationOption[] = [];
    const isUnderTolerance = (a: Decimal, b: Decimal) => a.minus(b).absoluteValue().lessThanOrEqualTo(TOLERANCE_GRAMS);

    // ---- 1. Previous Deposit Check: the user's own packet (exact or split) ----
    const ownExact = userPackets.find((p) => isUnderTolerance(new Decimal(p.pureWeight), target));
    if (ownExact) {
      options.push({
        kind: "own-exact",
        optionKey: `own-exact:${ownExact.id}`,
        title: "Previous deposit — exact match",
        packetIds: [ownExact.id],
        deliveredWeight: ownExact.pureWeight,
        refundWeight: 0,
        splitsUserPacket: false,
        description: `Your packet ${ownExact.idSecure} (${ownExact.pureWeight}g) matches the requested weight exactly.`,
      });
    } else {
      const ownFit = userPackets.find((p) => new Decimal(p.pureWeight).greaterThan(target));
      if (ownFit) {
        options.push({
          kind: "own-fit",
          optionKey: `own-fit:${ownFit.id}`,
          title: "Previous deposit — split bigger packet",
          packetIds: [ownFit.id],
          deliveredWeight: target.toNumber(),
          refundWeight: 0,
          splitsUserPacket: true,
          description: `Your packet ${ownFit.idSecure} (${ownFit.pureWeight}g) will be split to deliver exactly ${target.toString()}g.`,
        });
      }
    }

    // ---- 2. Exact match among orphans ----
    const orphanExact = orphans.find((p) => isUnderTolerance(new Decimal(p.pureWeight), target));
    if (orphanExact) {
      options.push({
        kind: "orphan-exact",
        optionKey: `orphan-exact:${orphanExact.id}`,
        title: "Exact match (orphan package)",
        packetIds: [orphanExact.id],
        deliveredWeight: orphanExact.pureWeight,
        refundWeight: 0,
        splitsUserPacket: false,
        description: `Orphan package ${orphanExact.idSecure} (${orphanExact.pureWeight}g) exactly matches the request.`,
      });
    }

    // ---- 3. Best fit below target (lowest negative variance / best-of-fit lower bound) ----
    let bestFit: PacketEntity | null = null;
    let bestFitDiff = new Decimal(Infinity);
    for (const p of orphans) {
      const w = new Decimal(p.pureWeight);
      if (w.greaterThanOrEqualTo(target)) continue;
      const diff = target.minus(w);
      if (diff.lessThan(bestFitDiff)) {
        bestFitDiff = diff;
        bestFit = p;
      }
    }
    if (bestFit) {
      const refund = Math.max(0, target.minus(new Decimal(bestFit.pureWeight)).toNumber());
      options.push({
        kind: "orphan-fit",
        optionKey: `orphan-fit:${bestFit.id}`,
        title: "Best fit (closest from below)",
        packetIds: [bestFit.id],
        deliveredWeight: bestFit.pureWeight,
        refundWeight: refund,
        splitsUserPacket: false,
        description: `Orphan ${bestFit.idSecure} (${bestFit.pureWeight}g) is delivered; the ${refund}g difference returns to the digital wallet.`,
      });
    }

    // ---- 4. Combination of orphans summing closest to (and not over) the target with min count ----
    const combo = this.findMinCountCombination(orphans, target);
    if (combo && combo.length >= 2 && options.length <= 4) {
      const total = combo.reduce((acc, p) => acc.plus(new Decimal(p.pureWeight)), new Decimal(0));
      options.push({
        kind: "combination",
        optionKey: `combination:${combo.map((p) => p.id).join("_")}`,
        title: `Combination (${combo.length} orphan packages)`,
        packetIds: combo.map((p) => p.id),
        deliveredWeight: total.toNumber(),
        refundWeight: target.minus(total).toNumber(),
        splitsUserPacket: false,
        description: combo.map((p) => `${p.idSecure}(${p.pureWeight}g)`).join(" + "),
      });
    }

    return options;
  }

  /**
   * Simple bounded combination search: find the fewest orphan packages whose total
   * is closest to (and not over) the target, favoring higher sums before fewer count.
   */
  private findMinCountCombination(packets: PacketEntity[], target: Decimal): PacketEntity[] | null {
    const usable = packets.filter((p) => new Decimal(p.pureWeight).lessThanOrEqualTo(target));
    if (usable.length < 2) return null;

    let best: PacketEntity[] | null = null;
    let bestSum = new Decimal(0);

    const search = (start: number, path: PacketEntity[], sum: Decimal) => {
      if (path.length > 0 && path.length <= 6) {
        const isBetter =
          sum.greaterThan(bestSum) ||
          (sum.equals(bestSum) && (best === null || path.length < best.length));
        if (isBetter) {
          bestSum = sum;
          best = [...path];
        }
      }
      for (let i = start; i < usable.length; i++) {
        const w = new Decimal(usable[i].pureWeight);
        if (sum.plus(w).lessThanOrEqualTo(target)) {
          search(i + 1, [...path, usable[i]], sum.plus(w));
        }
      }
    };
    search(0, [], new Decimal(0));

    // Only meaningful if it beats a plain single-packet fit (i.e., total >= the best single below).
    if (!best || best.length < 2) return null;
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