import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, EntityManager, Repository } from "typeorm";
import Decimal from "decimal.js";
import { ManagerAccountEntity } from "./entity/manager-account.entity";
import { ManagerAccountFundingEntity } from "./entity/manager-account-funding.entity";
import { ManagerAccountLedgerEntity } from "./entity/manager-account-ledger.entity";
import {
  ManagerAccountStatusEnum,
  ManagerFundingDirectionEnum,
  ManagerFundingStatusEnum,
  ManagerLedgerTypeEnum,
} from "./enum/manager-account.enums";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { AdminEntity } from "../admin/entity/admin.entity";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { CreateFundingRequestDto } from "./dto/create-funding-request.dto";
import { ReviewFundingRequestDto } from "./dto/review-funding-request.dto";

Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

/**
 * Manager trading accounts: the capital an admin may put behind their
 * arbitrage bots.
 *
 * Two rules hold everywhere in here. Capital only enters or leaves an account
 * through a funding request a *senior* admin approved — a manager cannot charge
 * their own account. And an allocation to a bot freezes value rather than
 * spending it: it moves from available to allocated, and only a realized loss
 * actually consumes it.
 */
@Injectable()
export class ManagerAccountService {
  private readonly logger = new Logger(ManagerAccountService.name);

  constructor(
    @InjectRepository(ManagerAccountEntity)
    private readonly accountRepo: Repository<ManagerAccountEntity>,
    @InjectRepository(ManagerAccountFundingEntity)
    private readonly fundingRepo: Repository<ManagerAccountFundingEntity>,
    @InjectRepository(ManagerAccountLedgerEntity)
    private readonly ledgerRepo: Repository<ManagerAccountLedgerEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
    @InjectRepository(AdminEntity)
    private readonly adminRepo: Repository<AdminEntity>,
    private readonly dataSource: DataSource
  ) {}

  // ── Accounts ─────────────────────────────────────────────────────────────

  async listAccounts(filters: { adminId?: string; symbolId?: string } = {}) {
    const accounts = await this.accountRepo.find({
      where: {
        ...(filters.adminId ? { adminId: filters.adminId } : {}),
        ...(filters.symbolId ? { symbolId: filters.symbolId } : {}),
      },
      relations: { symbol: true, admin: true },
      order: { createAt: "DESC" },
    });
    return accounts.map((a) => this.present(a));
  }

  async getAccount(id: string) {
    const account = await this.accountRepo.findOne({
      where: { id },
      relations: { symbol: true, admin: true },
    });
    if (!account) throw new NotFoundException("MANAGER_ACCOUNT.NOT_FOUND");
    return this.present(account);
  }

  /**
   * The account for one admin and asset, created empty on first use. An empty
   * account is harmless — nothing can be allocated from it until a senior
   * admin approves a charge.
   */
  async getOrCreateAccount(
    adminId: string,
    symbolId: string,
    manager?: EntityManager
  ): Promise<ManagerAccountEntity> {
    const repo = manager ? manager.getRepository(ManagerAccountEntity) : this.accountRepo;
    const existing = await repo.findOne({ where: { adminId, symbolId } });
    if (existing) return existing;

    const [admin, symbol] = await Promise.all([
      this.adminRepo.findOne({ where: { id: adminId } }),
      this.symbolRepo.findOne({ where: { id: symbolId } }),
    ]);
    if (!admin) throw new NotFoundException("ADMIN.NOT_FOUND");
    if (!symbol) throw new NotFoundException("SYMBOL.NOT_FOUND");

    return repo.save(
      repo.create({
        adminId,
        symbolId,
        availableBalance: 0,
        allocatedBalance: 0,
        status: ManagerAccountStatusEnum.ACTIVE,
      })
    );
  }

  async setAccountStatus(id: string, status: ManagerAccountStatusEnum, note?: string) {
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account) throw new NotFoundException("MANAGER_ACCOUNT.NOT_FOUND");
    account.status = status;
    if (note !== undefined) account.note = note;
    await this.accountRepo.save(account);
    return this.getAccount(id);
  }

  // ── Funding ──────────────────────────────────────────────────────────────

  async requestFunding(dto: CreateFundingRequestDto, requestedByAdminId: string) {
    if (!(Number(dto.amount) > 0)) throw new BadRequestException("MANAGER_ACCOUNT.INVALID_AMOUNT");

    const account = await this.getOrCreateAccount(dto.adminId, dto.symbolId);

    // A debit is checked again at approval time, but refusing an impossible
    // request up front saves a senior admin from reviewing one that cannot work.
    if (dto.direction === ManagerFundingDirectionEnum.DEBIT) {
      if (new Decimal(dto.amount).greaterThan(account.availableBalance)) {
        throw new BadRequestException("MANAGER_ACCOUNT.INSUFFICIENT_AVAILABLE");
      }
    }

    const saved = await this.fundingRepo.save(
      this.fundingRepo.create({
        accountId: account.id,
        adminId: dto.adminId,
        symbolId: dto.symbolId,
        amount: dto.amount,
        direction: dto.direction,
        status: ManagerFundingStatusEnum.PENDING,
        requestedByAdminId,
        reason: dto.reason ?? null,
      })
    );
    return saved;
  }

  async listFundingRequests(filters: { status?: ManagerFundingStatusEnum; adminId?: string } = {}) {
    return this.fundingRepo.find({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.adminId ? { adminId: filters.adminId } : {}),
      },
      relations: { account: { symbol: true, admin: true } },
      order: { createAt: "DESC" },
    });
  }

  /**
   * Senior-admin approval. The reviewer must be a different person from the
   * requester: an admin approving their own charge would make the approval
   * step meaningless.
   */
  async reviewFunding(
    fundingId: string,
    dto: ReviewFundingRequestDto,
    reviewer: { id: string; role: AdminRole }
  ) {
    if (reviewer.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException("MANAGER_ACCOUNT.SENIOR_APPROVAL_REQUIRED");
    }

    return this.dataSource.transaction(async (manager) => {
      const funding = await manager.findOne(ManagerAccountFundingEntity, {
        where: { id: fundingId },
        lock: { mode: "pessimistic_write" },
      });
      if (!funding) throw new NotFoundException("MANAGER_FUNDING.NOT_FOUND");
      if (funding.status !== ManagerFundingStatusEnum.PENDING) {
        throw new BadRequestException("MANAGER_FUNDING.ALREADY_REVIEWED");
      }
      if (funding.requestedByAdminId === reviewer.id) {
        throw new ForbiddenException("MANAGER_FUNDING.SELF_APPROVAL_FORBIDDEN");
      }

      funding.reviewedByAdminId = reviewer.id;
      funding.reviewedAt = new Date();
      funding.reviewNote = dto.note ?? null;

      if (!dto.approve) {
        funding.status = ManagerFundingStatusEnum.REJECTED;
        return manager.save(funding);
      }

      const account = await this.lockAccount(manager, funding.accountId);
      const amount = new Decimal(funding.amount);

      if (funding.direction === ManagerFundingDirectionEnum.CREDIT) {
        await this.applyMovement(manager, account, {
          type: ManagerLedgerTypeEnum.FUNDING_CREDIT,
          availableDelta: amount,
          allocatedDelta: new Decimal(0),
          fundingId: funding.id,
          actorAdminId: reviewer.id,
          description: funding.reason ?? "funding approved",
        });
      } else {
        if (amount.greaterThan(account.availableBalance)) {
          throw new BadRequestException("MANAGER_ACCOUNT.INSUFFICIENT_AVAILABLE");
        }
        await this.applyMovement(manager, account, {
          type: ManagerLedgerTypeEnum.FUNDING_DEBIT,
          availableDelta: amount.negated(),
          allocatedDelta: new Decimal(0),
          fundingId: funding.id,
          actorAdminId: reviewer.id,
          description: funding.reason ?? "funding withdrawal approved",
        });
      }

      funding.status = ManagerFundingStatusEnum.APPROVED;
      return manager.save(funding);
    });
  }

  async cancelFunding(fundingId: string, adminId: string) {
    const funding = await this.fundingRepo.findOne({ where: { id: fundingId } });
    if (!funding) throw new NotFoundException("MANAGER_FUNDING.NOT_FOUND");
    if (funding.status !== ManagerFundingStatusEnum.PENDING) {
      throw new BadRequestException("MANAGER_FUNDING.ALREADY_REVIEWED");
    }
    if (funding.requestedByAdminId !== adminId) {
      throw new ForbiddenException("MANAGER_FUNDING.NOT_REQUESTER");
    }
    funding.status = ManagerFundingStatusEnum.CANCELLED;
    return this.fundingRepo.save(funding);
  }

  // ── Allocation (used by the arbitrage bots) ──────────────────────────────

  /**
   * Freezes capital into a bot. The value stays the manager's — it moves from
   * available to allocated — but it is now the bot's risk budget and cannot be
   * allocated elsewhere or withdrawn until the bot releases it.
   */
  async allocateToBot(
    accountId: string,
    botId: string,
    amount: number | string,
    actorAdminId?: string,
    manager?: EntityManager
  ): Promise<ManagerAccountEntity> {
    const run = async (em: EntityManager) => {
      const account = await this.lockAccount(em, accountId);
      if (account.status !== ManagerAccountStatusEnum.ACTIVE) {
        throw new BadRequestException("MANAGER_ACCOUNT.SUSPENDED");
      }

      const value = new Decimal(amount);
      if (!value.greaterThan(0)) throw new BadRequestException("MANAGER_ACCOUNT.INVALID_AMOUNT");
      if (value.greaterThan(account.availableBalance)) {
        throw new BadRequestException("MANAGER_ACCOUNT.INSUFFICIENT_AVAILABLE");
      }

      return this.applyMovement(em, account, {
        type: ManagerLedgerTypeEnum.ALLOCATION,
        availableDelta: value.negated(),
        allocatedDelta: value,
        botId,
        actorAdminId,
        description: "allocated to arbitrage bot",
      });
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /** Returns a bot's remaining frozen capital to the available balance. */
  async releaseFromBot(
    accountId: string,
    botId: string,
    amount: number | string,
    actorAdminId?: string,
    manager?: EntityManager
  ): Promise<ManagerAccountEntity> {
    const run = async (em: EntityManager) => {
      const account = await this.lockAccount(em, accountId);
      const value = new Decimal(amount);
      if (!value.greaterThan(0)) return account;

      // Never release more than is actually frozen; a rounding drift must not
      // be able to mint capital.
      const releasable = Decimal.min(value, new Decimal(account.allocatedBalance));
      if (!releasable.greaterThan(0)) return account;

      return this.applyMovement(em, account, {
        type: ManagerLedgerTypeEnum.RELEASE,
        availableDelta: releasable,
        allocatedDelta: releasable.negated(),
        botId,
        actorAdminId,
        description: "released from arbitrage bot",
      });
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /**
   * Books a bot's realized result. A profit lands in the available balance; a
   * loss consumes the frozen allocation, which is exactly the capital the
   * manager put at risk when they created the bot.
   */
  async bookBotResult(
    accountId: string,
    botId: string,
    pnl: number | string,
    description: string,
    manager?: EntityManager
  ): Promise<ManagerAccountEntity> {
    const run = async (em: EntityManager) => {
      const account = await this.lockAccount(em, accountId);
      const value = new Decimal(pnl);
      if (value.isZero()) return account;

      if (value.greaterThan(0)) {
        return this.applyMovement(em, account, {
          type: ManagerLedgerTypeEnum.PROFIT,
          availableDelta: value,
          allocatedDelta: new Decimal(0),
          botId,
          description,
        });
      }

      const loss = value.negated();
      const absorbed = Decimal.min(loss, new Decimal(account.allocatedBalance));
      // A loss beyond the frozen allocation should be impossible — the bot
      // halts at its stop-loss — but if it happens the remainder comes out of
      // the available balance rather than silently vanishing.
      const overflow = loss.minus(absorbed);

      return this.applyMovement(em, account, {
        type: ManagerLedgerTypeEnum.LOSS,
        availableDelta: overflow.greaterThan(0) ? overflow.negated() : new Decimal(0),
        allocatedDelta: absorbed.negated(),
        botId,
        description,
      });
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  async getLedger(accountId: string, limit = 100, offset = 0) {
    const [items, total] = await this.ledgerRepo.findAndCount({
      where: { accountId },
      order: { createAt: "DESC" },
      take: Math.min(limit, 500),
      skip: offset,
    });
    return { items, total };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  /**
   * Reads the account under a row lock. Allocation and settlement both read
   * then write the same balances, so without the lock two concurrent bots
   * could each see the same capital as free.
   */
  private async lockAccount(
    manager: EntityManager,
    accountId: string
  ): Promise<ManagerAccountEntity> {
    const account = await manager.findOne(ManagerAccountEntity, {
      where: { id: accountId },
      lock: { mode: "pessimistic_write" },
    });
    if (!account) throw new NotFoundException("MANAGER_ACCOUNT.NOT_FOUND");
    return account;
  }

  /** Applies a balance change and writes the ledger row that explains it. */
  private async applyMovement(
    manager: EntityManager,
    account: ManagerAccountEntity,
    movement: {
      type: ManagerLedgerTypeEnum;
      availableDelta: Decimal;
      allocatedDelta: Decimal;
      botId?: string | null;
      fundingId?: string | null;
      actorAdminId?: string | null;
      description?: string | null;
    }
  ): Promise<ManagerAccountEntity> {
    const available = new Decimal(account.availableBalance).plus(movement.availableDelta);
    const allocated = new Decimal(account.allocatedBalance).plus(movement.allocatedDelta);

    if (available.isNegative() || allocated.isNegative()) {
      throw new BadRequestException("MANAGER_ACCOUNT.NEGATIVE_BALANCE");
    }

    account.availableBalance = available.toNumber();
    account.allocatedBalance = allocated.toNumber();
    const saved = await manager.save(ManagerAccountEntity, account);

    await manager.save(ManagerAccountLedgerEntity, {
      accountId: account.id,
      type: movement.type,
      availableDelta: movement.availableDelta.toNumber(),
      allocatedDelta: movement.allocatedDelta.toNumber(),
      availableAfter: available.toNumber(),
      allocatedAfter: allocated.toNumber(),
      botId: movement.botId ?? null,
      fundingId: movement.fundingId ?? null,
      actorAdminId: movement.actorAdminId ?? null,
      description: movement.description ?? null,
    });

    return saved;
  }

  private present(account: ManagerAccountEntity) {
    const available = Number(account.availableBalance) || 0;
    const allocated = Number(account.allocatedBalance) || 0;
    return {
      id: account.id,
      adminId: account.adminId,
      admin: account.admin
        ? { id: account.admin.id, phone: account.admin.phone, email: account.admin.email, role: account.admin.role }
        : null,
      symbolId: account.symbolId,
      symbol: account.symbol
        ? { id: account.symbol.id, name: account.symbol.name, slug: account.symbol.slug }
        : null,
      availableBalance: available,
      allocatedBalance: allocated,
      totalBalance: available + allocated,
      status: account.status,
      note: account.note,
      createdAt: account.createAt,
      updatedAt: account.updateAt,
    };
  }
}
