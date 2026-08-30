import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserEntity } from "../../user/entity/user.entity";
import { UserKycEntity } from "../../user/entity/user.kyc.entity";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { CustomerNoteService } from "./customer-note.service";
import { CustomerTagService } from "./customer-tag.service";
import { SupportTicketService } from "./support-ticket.service";
import { CommunicationLogService } from "./communication-log.service";
import { CustomerSegmentService } from "./customer-segment.service";
import { CreditService } from "../../credit/credit.service";

@Injectable()
export class Customer360Service {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserKycEntity)
    private readonly kycRepository: Repository<UserKycEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>,
    private readonly noteService: CustomerNoteService,
    private readonly tagService: CustomerTagService,
    private readonly ticketService: SupportTicketService,
    private readonly communicationLogService: CommunicationLogService,
    private readonly segmentService: CustomerSegmentService,
    private readonly creditService: CreditService,
  ) {}

  async getCustomer360(userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: { profile: true, level: true },
    });
    if (!user) throw new NotFoundException("User not found");

    const kyc = await this.kycRepository.findOne({ where: { userId } });
    const wallets = await this.walletRepository.find({ where: { userId }, relations: { symbol: true } });
    const notes = await this.noteService.findByUser(userId);
    const tags = await this.tagService.getUserTags(userId);
    const segments = await this.segmentService.getUserSegments(userId);
    const tickets = await this.ticketService.findUserTickets(userId, 1, 10);
    const communications = await this.communicationLogService.findByUser(userId, 1, 20);

    const walletSummary = wallets.map((w) => ({
      symbol: w.symbol?.slug || w.symbolId,
      walletType: w.walletType,
      free: Number(w.freeBalance),
      locked: Number(w.lockedBalance),
      total: Number(w.freeBalance) + Number(w.lockedBalance),
    }));

    // Live, signed credit exposure ("negative used balance") for the user's
    // active credit facility, if any — same computation the credit panels use
    // to gate settlement, so a CRM agent can see at a glance whether this user
    // owes anything and whether they could settle right now.
    const creditOverview = await this.creditService.getCreditOverview(userId).catch(() => null);
    const creditExposure = creditOverview
      ? {
          creditId: creditOverview.id,
          positions: creditOverview.positions,
          settlementEligible: creditOverview.settlementEligible,
          settlementShortfall: creditOverview.settlementShortfall,
        }
      : null;

    return {
      user: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        role: user.role,
        registeredAt: user.registeredAt,
        blockedAt: user.blockedAt,
        activeUntil: user.activeUntil,
        createdAt: user.createAt,
      },
      kyc: kyc ? {
        level: kyc.level,
        status: kyc.status,
        nationalId: kyc.nationalId,
        verifiedAt: kyc.verifiedAt,
      } : null,
      level: user.level ? {
        id: user.level.id,
        name: (user.level as any).name,
        slug: (user.level as any).slug,
      } : null,
      wallets: walletSummary,
      creditExposure,
      tags,
      segments,
      notes,
      tickets: tickets.data,
      communications: communications.data,
      statistics: {
        totalTickets: tickets.total,
        totalCommunications: communications.total,
      },
    };
  }
}
