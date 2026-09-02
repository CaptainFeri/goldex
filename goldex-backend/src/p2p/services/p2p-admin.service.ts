import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { P2pWithdrawRequestEntity } from "../entity/p2p-withdraw-request.entity";
import { P2pWithdrawPartEntity } from "../entity/p2p-withdraw-part.entity";
import { P2pMatchEntity } from "../entity/p2p-match.entity";
import { P2pEscalationEntity } from "../entity/p2p-escalation.entity";
import { P2pMatchStatusEnum, P2pWithdrawStateEnum } from "../enum/p2p.enums";
import { P2pReceiptService } from "./p2p-receipt.service";
import { AdminWithdrawQueryDto } from "../dto/admin-withdraw-query.dto";

/**
 * Read models for the admin console. Everything an operator needs to judge a
 * request should arrive in one call — the parts, who is filling them, the
 * receipts with viewable images, and any escalation already open — so nobody
 * has to reconstruct a case from three separate screens.
 */
@Injectable()
export class P2pAdminService {
  private readonly logger = new Logger(P2pAdminService.name);

  constructor(
    @InjectRepository(P2pWithdrawRequestEntity)
    private readonly requestRepo: Repository<P2pWithdrawRequestEntity>,
    @InjectRepository(P2pWithdrawPartEntity)
    private readonly partRepo: Repository<P2pWithdrawPartEntity>,
    @InjectRepository(P2pMatchEntity)
    private readonly matchRepo: Repository<P2pMatchEntity>,
    @InjectRepository(P2pEscalationEntity)
    private readonly escalationRepo: Repository<P2pEscalationEntity>,
    private readonly receipts: P2pReceiptService,
  ) {}

  async listWithdrawals(query: AdminWithdrawQueryDto) {
    const { state, userId, minAmount, page = 1, limit = 20 } = query;
    const qb = this.requestRepo
      .createQueryBuilder("r")
      .leftJoinAndSelect("r.user", "user")
      .leftJoinAndSelect("r.symbol", "symbol")
      .orderBy("r.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (state) qb.andWhere("r.state = :state", { state });
    if (userId) qb.andWhere("r.user_id = :userId", { userId });
    if (minAmount) qb.andWhere("r.total_amount >= :minAmount", { minAmount });

    const [items, total] = await qb.getManyAndCount();
    if (!items.length) return { items: [], total, page, limit };

    // One extra query for the whole page rather than one per row.
    const counts = await this.partRepo
      .createQueryBuilder("p")
      .select("p.withdraw_request_id", "requestId")
      .addSelect("COUNT(*)", "total")
      .addSelect("COUNT(*) FILTER (WHERE p.status = 'CONFIRMED')", "confirmed")
      .where("p.withdraw_request_id IN (:...ids)", { ids: items.map((r) => r.id) })
      .groupBy("p.withdraw_request_id")
      .getRawMany();

    return {
      items: items.map((r) => {
        const c = counts.find((x) => x.requestId === r.id);
        return {
          ...r,
          partsTotal: Number(c?.total ?? 0),
          partsConfirmed: Number(c?.confirmed ?? 0),
        };
      }),
      total,
      page,
      limit,
    };
  }

  /** The whole case: request, every part, its live match, receipt, escalation. */
  async getWithdrawal(id: string) {
    const request = await this.requestRepo.findOne({
      where: [{ id }, { withdrawId: id }],
      relations: { user: true, symbol: true },
    });
    if (!request) throw new NotFoundException("Withdrawal request not found");

    const parts = await this.partRepo.find({
      where: { withdrawRequestId: request.id },
      order: { sequenceNo: "ASC" },
    });

    const matches = parts.length
      ? await this.matchRepo.find({
          where: { withdrawPartId: In(parts.map((p) => p.id)) },
          relations: { paymentProof: true, depositIntent: { user: true } },
          order: { createAt: "DESC" },
        })
      : [];

    const escalations = matches.length
      ? await this.escalationRepo.find({
          where: { matchId: In(matches.map((m) => m.id)) },
          order: { createAt: "DESC" },
        })
      : [];

    return {
      request,
      parts: await Promise.all(
        parts.map(async (part) => {
          const partMatches = matches.filter((m) => m.withdrawPartId === part.id);
          const live = partMatches.find(
            (m) =>
              ![P2pMatchStatusEnum.RESERVATION_EXPIRED, P2pMatchStatusEnum.CANCELLED].includes(
                m.status,
              ),
          );
          return {
            ...part,
            match: live ? await this.decorate(live, escalations) : null,
            // Kept so an operator can see a part that has already been tried
            // and released rather than assuming it was never touched.
            history: partMatches
              .filter((m) => m.id !== live?.id)
              .map((m) => ({ id: m.id, status: m.status, amount: m.amount, createAt: m.createAt })),
          };
        }),
      ),
    };
  }

  async getMatch(id: string) {
    const match = await this.matchRepo.findOne({
      where: { id },
      relations: { paymentProof: true, depositIntent: { user: true }, withdrawPart: true },
    });
    if (!match) throw new NotFoundException("Match not found");

    const escalations = await this.escalationRepo.find({
      where: { matchId: match.id },
      order: { createAt: "DESC" },
    });
    return this.decorate(match, escalations);
  }

  private async decorate(match: P2pMatchEntity, escalations: P2pEscalationEntity[]) {
    return {
      ...match,
      paymentProof: await this.receipts.attachUrl(match.paymentProof),
      depositor: (match.depositIntent as any)?.user ?? null,
      escalation: escalations.find((e) => e.matchId === match.id) ?? null,
    };
  }

  /** States an operator normally filters on. */
  static readonly OPEN_STATES = [
    P2pWithdrawStateEnum.PENDING_MATCHING,
    P2pWithdrawStateEnum.PARTIALLY_MATCHED,
    P2pWithdrawStateEnum.ADMIN_SETTLEMENT,
  ];
}
