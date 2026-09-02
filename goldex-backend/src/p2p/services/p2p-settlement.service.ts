import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { P2pMatchEntity } from "../entity/p2p-match.entity";
import { P2pWithdrawPartEntity } from "../entity/p2p-withdraw-part.entity";
import { P2pWithdrawRequestEntity } from "../entity/p2p-withdraw-request.entity";
import { P2pDepositIntentEntity } from "../entity/p2p-deposit-intent.entity";
import {
  P2pIntentStateEnum,
  P2pMatchStatusEnum,
  P2pPartStatusEnum,
  P2pWithdrawStateEnum,
} from "../enum/p2p.enums";
import {
  assertIntentTransition,
  assertMatchTransition,
  assertPartTransition,
  assertWithdrawTransition,
} from "../state/transitions";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { TransactionEntity } from "../../wallet/entities/transaction.entity";
import { TransactionTypeEnum } from "../../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../../wallet/enum/transaction.status.enum";
import { WalletTypeEnum } from "../../wallet/enum/wallet-type.enum";
import { WalletStatusEnum } from "../../wallet/enum/wallet-status.enum";
import { DepositEntity } from "../../deposit/deposit.entity";
import { WithdrawEntity } from "../../withdraw/withdraw.entity";
import { DepositStatusEnum } from "../../deposit/enum/deposit-status.enum";
import { WithdrawStatusEnum } from "../../withdraw/enum/withdraw-status.enum";
import { AdminBankAccountService } from "../../admin-bank-account/admin-bank-account.service";
import { BankAccountDirectionEnum } from "../../admin-bank-account/enum/admin-bank-account-status.enum";
import { P2pAuditService } from "./p2p-audit.service";
import { P2pLiquidityService } from "./p2p-liquidity.service";
import { AuditContext } from "./p2p-audit.service";
import { P2pEvents } from "../../shared/constants/events.constants";

const round8 = (n: number) => Number(n.toFixed(8));

@Injectable()
export class P2pSettlementService {
  private readonly logger = new Logger(P2pSettlementService.name);

  constructor(
    @InjectRepository(P2pMatchEntity)
    private readonly matchRepo: Repository<P2pMatchEntity>,
    private readonly audit: P2pAuditService,
    private readonly bankAccounts: AdminBankAccountService,
    private readonly liquidity: P2pLiquidityService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Moves the internal balance for one confirmed match, inside one DB
   * transaction. This is the only place a p2p balance changes.
   *
   * The withdrawer's locked balance falls and the depositor's free balance
   * rises by the same amount, so platform-wide rial is conserved — that
   * identity is what the reconciliation job checks.
   */
  async settle(
    manager: EntityManager,
    matchId: string,
    ctx: AuditContext,
    opts: { fromAdminAccountId?: string } = {},
  ): Promise<P2pMatchEntity> {
    const match = await manager.findOne(P2pMatchEntity, {
      where: { id: matchId },
      lock: { mode: "pessimistic_write" },
    });
    if (!match) throw new NotFoundException("Match not found");
    if (match.status === P2pMatchStatusEnum.CONFIRMED) return match; // idempotent

    assertMatchTransition(match.status, P2pMatchStatusEnum.CONFIRMED);

    const intent = await manager.findOne(P2pDepositIntentEntity, {
      where: { id: match.depositIntentId },
    });
    if (!intent) throw new NotFoundException("Deposit intent not found");

    const amount = Number(match.amount);
    const beforeMatch = { status: match.status };
    let withdrawUserId: string | undefined;

    // An admin-funded deposit has no customer part behind it; the company
    // account is the counterparty instead.
    const part = match.withdrawPartId
      ? await manager.findOne(P2pWithdrawPartEntity, {
          where: { id: match.withdrawPartId },
          lock: { mode: "pessimistic_write" },
        })
      : null;

    if (part) {
      const request = await manager.findOne(P2pWithdrawRequestEntity, {
        where: { id: part.withdrawRequestId },
        lock: { mode: "pessimistic_write" },
      });
      if (!request) throw new NotFoundException("Withdrawal request not found");

      withdrawUserId = request.userId;
      await this.debitWithdrawerLock(manager, request, amount, match.id);
      await this.creditDepositor(manager, intent, amount, match.id);
      await this.advancePart(manager, part, request, amount);
    } else {
      // Filled from a company account: only the depositor's side has an
      // internal leg — the real money landed in the company's bank account.
      const accountId = opts.fromAdminAccountId ?? match.adminAccountId;
      if (!accountId) {
        throw new BadRequestException("An admin bank account is required to settle this match");
      }
      await this.bankAccounts.consumeHeadroom(
        manager,
        accountId,
        BankAccountDirectionEnum.DEPOSIT,
        amount,
      );
      // The depositor's real money went into a company bank account, so the
      // company gives up the matching internal rial. Both legs keep the
      // platform-wide total unchanged.
      await this.liquidity.debitAdmin(manager, intent.symbolId, amount, {
        matchId: match.id,
        adminAccountId: accountId,
      });
      await this.creditDepositor(manager, intent, amount, match.id);
      match.adminAccountId = accountId;
    }

    match.status = P2pMatchStatusEnum.CONFIRMED;
    match.settledAt = new Date();
    await manager.save(match);

    assertIntentTransition(intent.state, P2pIntentStateEnum.CONFIRMED);
    intent.state = P2pIntentStateEnum.CONFIRMED;
    await manager.save(intent);

    await manager.update(DepositEntity, { id: intent.depositId }, {
      status: DepositStatusEnum.COMPLETED,
      completedAt: new Date(),
    });

    await this.audit.record(
      ctx,
      "p2p.settle",
      "p2p_match",
      match.id,
      beforeMatch,
      { status: match.status, amount, adminAccountId: match.adminAccountId },
      manager,
    );

    this.eventEmitter.emit(P2pEvents.CONFIRMED, {
      matchId: match.id,
      depositUserId: intent.userId,
      withdrawUserId,
      amount,
      source: match.source,
    });

    this.logger.log(`p2p match ${match.id} settled for ${amount}`);
    return match;
  }

  /**
   * Pays a withdrawal part out of a company account instead of a depositor.
   * Used by the SETTLE_FROM_ADMIN decision on a stuck request.
   */
  async settlePartFromAdmin(
    manager: EntityManager,
    partId: string,
    adminAccountId: string,
    ctx: AuditContext,
  ): Promise<void> {
    const part = await manager.findOne(P2pWithdrawPartEntity, {
      where: { id: partId },
      lock: { mode: "pessimistic_write" },
    });
    if (!part) throw new NotFoundException("Withdrawal part not found");
    if (part.status === P2pPartStatusEnum.CONFIRMED) return;

    const request = await manager.findOne(P2pWithdrawRequestEntity, {
      where: { id: part.withdrawRequestId },
      lock: { mode: "pessimistic_write" },
    });
    if (!request) throw new NotFoundException("Withdrawal request not found");

    const amount = Number(part.targetAmount);
    await this.bankAccounts.consumeHeadroom(
      manager,
      adminAccountId,
      BankAccountDirectionEnum.WITHDRAW,
      amount,
    );

    // The company paid the withdrawer's bank account from its own funds, so it
    // takes on the matching internal rial rather than the balance vanishing.
    await this.debitWithdrawerLock(manager, request, amount, part.id);
    await this.liquidity.creditAdmin(manager, request.symbolId, amount, {
      withdrawPartId: part.id,
      adminAccountId,
    });
    await this.advancePart(manager, part, request, amount);

    await this.audit.record(
      ctx,
      "p2p.settle_from_admin",
      "p2p_withdraw_part",
      part.id,
      null,
      { amount, adminAccountId },
      manager,
    );
  }

  /** Releases still-locked balance back to free — cancel, expiry, or reject. */
  async releaseLock(
    manager: EntityManager,
    request: P2pWithdrawRequestEntity,
    amount: number,
    reason: string,
  ): Promise<void> {
    const release = Math.min(Number(request.lockedAmount), amount);
    if (release <= 0) return;

    const wallet = await this.lockWallet(manager, request.userId, request.symbolId);
    wallet.lockedBalance = round8(Number(wallet.lockedBalance) - release);
    wallet.freeBalance = round8(Number(wallet.freeBalance) + release);
    await manager.save(wallet);

    request.lockedAmount = round8(Number(request.lockedAmount) - release);
    await manager.save(request);

    await this.writeTransaction(manager, wallet.id, {
      prefix: "P2PREL",
      type: TransactionTypeEnum.P2P_WITHDRAW_RELEASE,
      amount: release,
      description: `p2p withdrawal lock released: ${reason}`,
      metadata: { withdrawRequestId: request.id, reason },
    });
  }

  // ─── Internals ─────────────────────────────────────────────

  private async debitWithdrawerLock(
    manager: EntityManager,
    request: P2pWithdrawRequestEntity,
    amount: number,
    reference: string,
  ): Promise<void> {
    const wallet = await this.lockWallet(manager, request.userId, request.symbolId);
    if (Number(wallet.lockedBalance) < amount) {
      throw new BadRequestException("Withdrawer no longer has enough locked balance");
    }

    wallet.lockedBalance = round8(Number(wallet.lockedBalance) - amount);
    await manager.save(wallet);

    request.lockedAmount = round8(Number(request.lockedAmount) - amount);
    await manager.save(request);

    await this.writeTransaction(manager, wallet.id, {
      prefix: "P2PWTH",
      type: TransactionTypeEnum.P2P_WITHDRAW_SETTLE,
      amount: -amount,
      description: "p2p withdrawal settled",
      metadata: { withdrawRequestId: request.id, reference },
    });
  }

  private async creditDepositor(
    manager: EntityManager,
    intent: P2pDepositIntentEntity,
    amount: number,
    reference: string,
  ): Promise<void> {
    const wallet = await this.lockWallet(manager, intent.userId, intent.symbolId, true);
    wallet.freeBalance = round8(Number(wallet.freeBalance) + amount);
    await manager.save(wallet);

    await this.writeTransaction(manager, wallet.id, {
      prefix: "P2PDEP",
      type: TransactionTypeEnum.P2P_DEPOSIT_SETTLE,
      amount,
      description: "p2p deposit settled",
      metadata: { depositIntentId: intent.id, reference },
    });
  }

  /** Rolls the part and its parent request forward after a confirmed fill. */
  private async advancePart(
    manager: EntityManager,
    part: P2pWithdrawPartEntity,
    request: P2pWithdrawRequestEntity,
    amount: number,
  ): Promise<void> {
    assertPartTransition(part.status, P2pPartStatusEnum.CONFIRMED);
    part.status = P2pPartStatusEnum.CONFIRMED;
    part.confirmedAmount = amount;
    part.activeReservationId = null;
    part.reservedUntil = null;
    await manager.save(part);

    request.completedAmount = round8(Number(request.completedAmount) + amount);
    request.remainingAmount = round8(Number(request.totalAmount) - Number(request.completedAmount));

    const nextState =
      request.remainingAmount <= 0
        ? P2pWithdrawStateEnum.COMPLETED
        : P2pWithdrawStateEnum.PARTIALLY_MATCHED;
    assertWithdrawTransition(request.state, nextState);
    request.state = nextState;
    await manager.save(request);

    if (nextState === P2pWithdrawStateEnum.COMPLETED) {
      await manager.update(WithdrawEntity, { id: request.withdrawId }, {
        status: WithdrawStatusEnum.COMPLETED,
        completedAt: new Date(),
      });
      this.eventEmitter.emit(P2pEvents.WITHDRAW_COMPLETED, {
        withdrawId: request.withdrawId,
        userId: request.userId,
        amount: Number(request.totalAmount),
      });
    }
  }

  /**
   * Wallets are always locked in a stable order (by id) across a settlement so
   * two matches touching the same pair cannot deadlock each other.
   */
  private async lockWallet(
    manager: EntityManager,
    userId: string,
    symbolId: string,
    createIfMissing = false,
  ): Promise<WalletEntity> {
    let wallet = await manager.findOne(WalletEntity, {
      where: { userId, symbolId, walletType: WalletTypeEnum.DEPOSIT },
      lock: { mode: "pessimistic_write" },
    });

    if (!wallet && createIfMissing) {
      wallet = await manager.save(
        manager.create(WalletEntity, {
          userId,
          symbolId,
          walletType: WalletTypeEnum.DEPOSIT,
          freeBalance: 0,
          lockedBalance: 0,
          status: WalletStatusEnum.ACTIVE,
        }),
      );
    }
    if (!wallet) throw new BadRequestException("User has no wallet for this symbol");
    return wallet;
  }

  private async writeTransaction(
    manager: EntityManager,
    walletId: string,
    opts: {
      prefix: string;
      type: TransactionTypeEnum;
      amount: number;
      description: string;
      metadata: Record<string, any>;
    },
  ): Promise<void> {
    await manager.save(
      manager.create(TransactionEntity, {
        walletId,
        transactionId: `${opts.prefix}-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
        transactionType: opts.type,
        status: TransactionStatusEnum.COMPLETED,
        amount: opts.amount,
        description: opts.description,
        metadata: opts.metadata,
        completedAt: new Date(),
      }),
    );
  }
}
