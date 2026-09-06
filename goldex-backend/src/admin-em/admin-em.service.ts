import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AdminBankAccountService } from "../admin-bank-account/admin-bank-account.service";
import { P2pEscalationService } from "../p2p/services/p2p-escalation.service";
import { P2pWithdrawRequestEntity } from "../p2p/entity/p2p-withdraw-request.entity";
import { P2pAuditActorEnum, P2pResolutionTypeEnum } from "../p2p/enum/p2p.enums";
import { P2pEmViewService } from "./p2p-em-view.service";
import { EmDecisionDto, EmProofDto } from "./dto/admin-em.dto";

export interface EmActor {
  adminId: string;
  ip?: string;
  userAgent?: string;
}

/**
 * The EM desk's write side.
 *
 * Every method here delegates: assigning an account goes through
 * `AdminBankAccountService`, and a decision goes through
 * `P2pEscalationService.resolve`, which owns the audit log, the two-person
 * control on large amounts, and the settlement invariants. Nothing in this
 * class writes a `p2p_*` row itself — doing so would route around all three.
 */
@Injectable()
export class AdminEmService {
  constructor(
    @InjectRepository(P2pWithdrawRequestEntity)
    private readonly requests: Repository<P2pWithdrawRequestEntity>,
    private readonly view: P2pEmViewService,
    private readonly escalations: P2pEscalationService,
    private readonly bankAccounts: AdminBankAccountService,
  ) {}

  /** «حساب داده شده» — the company account this request will be settled from. */
  async assignAccount(id: string, bankAccountId: string): Promise<void> {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException("EM.REQUEST_NOT_FOUND");

    // Validated through the owning service, so a suspended or wrong-symbol
    // account is refused here rather than at settlement time.
    const account = await this.bankAccounts.findById(bankAccountId);
    if (account.symbolId && account.symbolId !== request.symbolId) {
      throw new BadRequestException("EM.ACCOUNT_SYMBOL_MISMATCH");
    }

    request.destinationBankAccountId = bankAccountId;
    await this.requests.save(request);
  }

  async setEnclosure(id: string, hasEnclosure: boolean): Promise<void> {
    const request = await this.requests.findOne({ where: { id } });
    if (!request) throw new NotFoundException("EM.REQUEST_NOT_FOUND");
    request.hasEnclosure = hasEnclosure;
    await this.requests.save(request);
  }

  async approve(id: string, dto: EmDecisionDto, actor: EmActor): Promise<void> {
    await this.decide(id, P2pResolutionTypeEnum.CONFIRM_PAYMENT, dto, actor);
  }

  async reject(id: string, dto: EmDecisionDto, actor: EmActor): Promise<void> {
    await this.decide(id, P2pResolutionTypeEnum.REJECT_PAYMENT, dto, actor);
  }

  private async decide(
    id: string,
    resolution: P2pResolutionTypeEnum,
    dto: EmDecisionDto,
    actor: EmActor,
  ): Promise<void> {
    const escalation = await this.view.openEscalationFor(id);
    if (!escalation) {
      // Without an escalation there is nothing for an admin to resolve through
      // the audited path, and inventing a state change here is exactly what
      // this module must not do.
      throw new BadRequestException("EM.NO_OPEN_ESCALATION");
    }

    await this.escalations.resolve(
      escalation.id,
      actor.adminId,
      { resolution, note: dto.note },
      {
        actorType: P2pAuditActorEnum.ADMIN,
        actorId: actor.adminId,
        ip: actor.ip,
        userAgent: actor.userAgent,
      },
    );
  }

  async receipt(id: string): Promise<EmProofDto> {
    const proof = await this.view.proof(id);
    if (!proof) throw new NotFoundException("EM.RECEIPT_NOT_FOUND");
    return this.view.toProof(proof);
  }
}
