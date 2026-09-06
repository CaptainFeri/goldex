import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Brackets, In, Repository } from "typeorm";
import { P2pWithdrawRequestEntity } from "../p2p/entity/p2p-withdraw-request.entity";
import { P2pDepositIntentEntity } from "../p2p/entity/p2p-deposit-intent.entity";
import { P2pMatchEntity } from "../p2p/entity/p2p-match.entity";
import { P2pPaymentProofEntity } from "../p2p/entity/p2p-payment-proof.entity";
import { P2pEscalationEntity } from "../p2p/entity/p2p-escalation.entity";
import { P2pEscalationStatusEnum, P2pMatchSourceEnum, P2pResolutionTypeEnum } from "../p2p/enum/p2p.enums";
import { SignedFileUrlService } from "../shared/files";
import { EmRequestType, EmSearchBy, EmStatus } from "./em.enums";
import { depositStatus, withdrawStatus } from "./em-status";
import { EmProofDto, EmQueryDto, EmRequestRowDto, EmStatsDto } from "./dto/admin-em.dto";

/**
 * The EM desk as a view over `src/p2p`.
 *
 * Read-only by design. Every action the screen offers goes through the P2P
 * services, which is what keeps the escalation audit log, the two-person
 * control on large amounts and the settlement invariants intact — writing
 * `p2p_*` from here would route around all three.
 */
@Injectable()
export class P2pEmViewService {
  constructor(
    @InjectRepository(P2pWithdrawRequestEntity)
    private readonly withdrawRequests: Repository<P2pWithdrawRequestEntity>,
    @InjectRepository(P2pDepositIntentEntity)
    private readonly intents: Repository<P2pDepositIntentEntity>,
    @InjectRepository(P2pMatchEntity) private readonly matches: Repository<P2pMatchEntity>,
    @InjectRepository(P2pPaymentProofEntity) private readonly proofs: Repository<P2pPaymentProofEntity>,
    @InjectRepository(P2pEscalationEntity) private readonly escalations: Repository<P2pEscalationEntity>,
    private readonly signedUrls: SignedFileUrlService
  ) {}

  /**
   * The union the screen lists.
   *
   * Withdraw requests and deposit intents are separate tables with separate
   * lifecycles, so they are read separately and merged here rather than
   * through a SQL UNION — the two rows do not have the same columns, and a
   * union would have to invent them.
   */
  async list(query: EmQueryDto): Promise<{ items: EmRequestRowDto[]; total: number }> {
    const rows = await this.projectAll();
    const filtered = this.applyFilters(rows, query);

    // Sorted after projection because the status a row is filtered on does not
    // exist in either table.
    filtered.sort((a, b) => b.createAt.getTime() - a.createAt.getTime());

    const start = (query.currentPage - 1) * query.take;
    return { items: filtered.slice(start, start + query.take), total: filtered.length };
  }

  async stats(): Promise<EmStatsDto> {
    const rows = await this.projectAll();
    const count = (s: EmStatus) => rows.filter((r) => r.status === s).length;
    return {
      total: rows.length,
      awaitingAccount: count(EmStatus.AWAITING_ACCOUNT),
      awaitingReceipt: count(EmStatus.AWAITING_RECEIPT),
      receiptPaid: count(EmStatus.RECEIPT_PAID),
      rejected: count(EmStatus.REJECTED),
    };
  }

  async findOne(id: string): Promise<{
    row: EmRequestRowDto;
    proofs: EmProofDto[];
    parts: unknown[];
    escalationId: string | null;
  } | null> {
    const rows = await this.projectAll();
    const row = rows.find((r) => r.id === id);
    if (!row) return null;

    const request = await this.withdrawRequests.findOne({
      where: { id },
      relations: { parts: true },
    });

    const matches = await this.matchesFor(row);
    const proofRows = matches.length
      ? await this.proofs.find({ where: { matchId: In(matches.map((m) => m.id)) } })
      : [];
    const escalation = matches.length
      ? await this.escalations.findOne({
          where: {
            matchId: In(matches.map((m) => m.id)),
            status: In([P2pEscalationStatusEnum.OPEN, P2pEscalationStatusEnum.ASSIGNED]),
          },
        })
      : null;

    return {
      row,
      proofs: proofRows.map((p) => this.toProof(p)),
      parts: request?.parts ?? [],
      escalationId: escalation?.id ?? null,
    };
  }

  /** The open escalation for a request, which is what approve/reject resolve. */
  async openEscalationFor(id: string): Promise<P2pEscalationEntity | null> {
    const rows = await this.projectAll();
    const row = rows.find((r) => r.id === id);
    if (!row) return null;
    const matches = await this.matchesFor(row);
    if (matches.length === 0) return null;
    return this.escalations.findOne({
      where: {
        matchId: In(matches.map((m) => m.id)),
        status: In([P2pEscalationStatusEnum.OPEN, P2pEscalationStatusEnum.ASSIGNED]),
      },
      order: { createAt: "ASC" },
    });
  }

  // ── Projection ──────────────────────────────────────────────────────────

  private async projectAll(): Promise<EmRequestRowDto[]> {
    const [requests, intents] = await Promise.all([
      this.withdrawRequests.find({ relations: { parts: true, user: true, symbol: true } }),
      this.intents.find({ relations: { user: true, symbol: true, deposit: true } }),
    ]);

    const partIds = requests.flatMap((r) => (r.parts ?? []).map((p) => p.id));
    const matches = partIds.length
      ? await this.matches.find({
          where: { withdrawPartId: In(partIds) },
          relations: { depositIntent: { user: true } },
        })
      : [];

    const rejectedMatchIds = await this.rejectedByEscalation(matches.map((m) => m.id));
    const proofCounts = await this.proofCounts(matches.map((m) => m.id));

    const withdrawRows = requests.map((r) => {
      const parts = r.parts ?? [];
      const mine = matches.filter((m) => parts.some((p) => p.id === m.withdrawPartId));
      const adminSourced = mine.some((m) => m.source === P2pMatchSourceEnum.ADMIN);
      const snapshot = (r.destinationSnapshotJson ?? {}) as Record<string, any>;

      const status = withdrawStatus({
        state: r.state,
        hasAssignedAccount: !!r.destinationBankAccountId,
        partStatuses: parts.map((p) => p.status),
        matchStatuses: mine.map((m) => m.status),
        rejectedByEscalation: mine.some((m) => rejectedMatchIds.has(m.id)),
      });

      // The depositor on the match; on a company settlement there is none, and
      // the acting admin is recorded on the escalation instead.
      const performerMatch = mine.find((m) => m.depositIntent?.user);
      return {
        id: r.id,
        type: adminSourced ? EmRequestType.SETTLEMENT : EmRequestType.WITHDRAW,
        status,
        amount: String(r.totalAmount),
        symbolSlug: r.symbol?.slug ?? null,
        requester: {
          userId: r.userId,
          name: personName(r.user),
          phone: (r.user as any)?.phone ?? null,
        },
        performer: performerMatch
          ? {
              userId: performerMatch.depositIntent!.userId,
              name: personName(performerMatch.depositIntent!.user),
              phone: (performerMatch.depositIntent!.user as any)?.phone ?? null,
            }
          : null,
        destinationAccount: snapshot.iban ?? snapshot.accountNumber ?? null,
        assignedAccount: r.destinationBankAccountId ?? null,
        expiresAt: earliestExpiry(
          r.expiresAt,
          parts.map((p) => p.reservedUntil)
        ),
        hasEnclosure: (r as any).hasEnclosure ?? false,
        proofCount: mine.reduce((n, m) => n + (proofCounts.get(m.id) ?? 0), 0),
        createAt: r.createAt as Date,
      };
    });

    const depositRows = intents.map((i) => ({
      id: i.id,
      type: EmRequestType.DEPOSIT,
      status: depositStatus(i.state),
      amount: String(i.requestedAmount),
      symbolSlug: i.symbol?.slug ?? null,
      requester: { userId: i.userId, name: personName(i.user), phone: (i.user as any)?.phone ?? null },
      performer: null,
      // need to edit
      // destinationAccount: i.sourceIban ?? null,
      // assignedAccount: i.sourceBankAccountId ?? null,
      destinationAccount: null,
      assignedAccount: null,
      expiresAt: (i as any).expiresAt ?? null,
      hasEnclosure: (i as any).hasEnclosure ?? false,
      proofCount: 0,
      createAt: i.createAt as Date,
    }));

    return [...withdrawRows, ...depositRows];
  }

  private applyFilters(rows: EmRequestRowDto[], query: EmQueryDto): EmRequestRowDto[] {
    let out = rows;
    if (query.status) out = out.filter((r) => r.status === query.status);
    if (query.type) out = out.filter((r) => r.type === query.type);

    const q = query.q?.trim().toLowerCase();
    if (q) {
      const by = query.searchBy ?? EmSearchBy.REQUESTER;
      out = out.filter((r) => {
        if (by === EmSearchBy.REQUESTER) return matchesParty(r.requester, q);
        if (by === EmSearchBy.PERFORMER) return matchesParty(r.performer, q);
        return (
          (r.destinationAccount ?? "").toLowerCase().includes(q) || (r.assignedAccount ?? "").toLowerCase().includes(q)
        );
      });
    }
    return out;
  }

  private async matchesFor(row: EmRequestRowDto): Promise<P2pMatchEntity[]> {
    if (row.type === EmRequestType.DEPOSIT) {
      return this.matches.find({ where: { depositIntentId: row.id } });
    }
    const request = await this.withdrawRequests.findOne({ where: { id: row.id }, relations: { parts: true } });
    const partIds = (request?.parts ?? []).map((p) => p.id);
    if (partIds.length === 0) return [];
    return this.matches.find({ where: { withdrawPartId: In(partIds) } });
  }

  private async rejectedByEscalation(matchIds: string[]): Promise<Set<string>> {
    if (matchIds.length === 0) return new Set();
    const rows = await this.escalations.find({
      where: {
        matchId: In(matchIds),
        status: P2pEscalationStatusEnum.RESOLVED,
        resolutionType: In([P2pResolutionTypeEnum.REJECT_PAYMENT, P2pResolutionTypeEnum.CANCEL_REQUEST]),
      },
    });
    return new Set(rows.map((e) => e.matchId));
  }

  private async proofCounts(matchIds: string[]): Promise<Map<string, number>> {
    if (matchIds.length === 0) return new Map();
    const rows = await this.proofs
      .createQueryBuilder("p")
      .select("p.match_id", "matchId")
      .addSelect("COUNT(*)", "count")
      .where("p.match_id IN (:...matchIds)", { matchIds })
      .groupBy("p.match_id")
      .getRawMany<{ matchId: string; count: string }>();
    return new Map(rows.map((r) => [r.matchId, Number(r.count)]));
  }

  toProof(p: P2pPaymentProofEntity): EmProofDto {
    return {
      id: p.id,
      matchId: p.matchId,
      amount: String(p.amount),
      sourceAccount: p.sourceAccount ?? null,
      destinationAccount: p.destinationAccount ?? null,
      trackingCode: p.trackingCode ?? null,
      paidAt: p.paidAt ?? null,
      // Signed and short-lived: receipts sit in the same bucket as KYC
      // documents, so they are never handed out as a bare object name.
      receiptUrl: p.receiptObjectName ? this.signedUrls.sign(p.receiptObjectName) : null,
      ocrMismatch: p.ocrMismatch,
      createAt: p.createAt as Date,
    };
  }

  async proof(id: string): Promise<P2pPaymentProofEntity | null> {
    return this.proofs.findOne({ where: { id }, relations: { match: true } });
  }
}

function personName(user: unknown): string | null {
  const u = user as any;
  if (!u) return null;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
  return name || u.fullName || u.phone || null;
}

function matchesParty(party: { name: string | null; phone: string | null } | null, q: string): boolean {
  if (!party) return false;
  return (party.name ?? "").toLowerCase().includes(q) || (party.phone ?? "").includes(q);
}

/** The soonest deadline that actually applies, so the client counts down to the right one. */
export function earliestExpiry(requestExpiry: Date | undefined, partExpiries: (Date | undefined)[]): Date | null {
  const candidates = [requestExpiry, ...partExpiries].filter((d): d is Date => !!d);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (a.getTime() <= b.getTime() ? a : b));
}
