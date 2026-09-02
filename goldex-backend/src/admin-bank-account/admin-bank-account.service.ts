import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { AdminBankAccountEntity } from "./entity/admin-bank-account.entity";
import {
  AdminBankAccountStatusEnum,
  BankAccountDirectionEnum,
} from "./enum/admin-bank-account-status.enum";
import { CreateAdminBankAccountDto } from "./dto/create-admin-bank-account.dto";
import { UpdateAdminBankAccountDto } from "./dto/update-admin-bank-account.dto";
import { BankAccountQueryDto } from "./dto/bank-account-query.dto";
import { SetDirectionsDto } from "./dto/set-directions.dto";
import { KycService } from "../kyc/services/kyc.service";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { SymbolTypeEnum } from "../admin-symbol/enum/symbol.type.enum";

/** Normalises a Persian/Arabic name for comparison against an inquiry result. */
function normaliseName(name: string): string {
  return String(name ?? "")
    .replace(/[ي]/g, "ی") // Arabic yeh → Persian yeh
    .replace(/[ك]/g, "ک") // Arabic kaf → Persian kaf
    .replace(/[‌\s]+/g, " ") // ZWNJ and runs of whitespace → single space
    .trim()
    .toLowerCase();
}

@Injectable()
export class AdminBankAccountService {
  private readonly logger = new Logger(AdminBankAccountService.name);

  constructor(
    @InjectRepository(AdminBankAccountEntity)
    private readonly repo: Repository<AdminBankAccountEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
    private readonly kycService: KycService,
  ) {}

  // ─── Reads ─────────────────────────────────────────────────

  async findAll(query: BankAccountQueryDto) {
    const { direction, symbolId, status, page = 1, limit = 20 } = query;
    const qb = this.repo
      .createQueryBuilder("a")
      .leftJoinAndSelect("a.symbol", "symbol")
      .orderBy("a.priority", "ASC")
      .addOrderBy("a.created_at", "DESC")
      .skip((page - 1) * limit)
      .take(limit);

    if (direction === BankAccountDirectionEnum.DEPOSIT) {
      qb.andWhere("a.use_for_deposit = true");
    }
    if (direction === BankAccountDirectionEnum.WITHDRAW) {
      qb.andWhere("a.use_for_withdraw = true");
    }
    if (symbolId) qb.andWhere("a.symbol_id = :symbolId", { symbolId });
    if (status) qb.andWhere("a.status = :status", { status });

    const [items, total] = await qb.getManyAndCount();
    return { items: items.map((a) => this.withTodayUsage(a)), total, page, limit };
  }

  async findById(id: string): Promise<AdminBankAccountEntity> {
    const account = await this.repo.findOne({ where: { id }, relations: { symbol: true } });
    if (!account) throw new NotFoundException("Bank account not found");
    return this.withTodayUsage(account);
  }

  // ─── Writes ────────────────────────────────────────────────

  async create(dto: CreateAdminBankAccountDto): Promise<AdminBankAccountEntity> {
    this.assertIdentifier(dto);
    await this.assertSymbolUsable(dto.symbolId);

    if (dto.useForDeposit || dto.useForWithdraw) {
      throw new BadRequestException(
        "Verify the account owner before enabling it for deposit or withdraw",
      );
    }

    const account = this.repo.create({
      ...dto,
      useForDeposit: false,
      useForWithdraw: false,
      priority: dto.priority ?? 0,
      status: AdminBankAccountStatusEnum.ACTIVE,
    });
    const saved = await this.repo.save(account);
    this.logger.log(`Company bank account ${saved.id} created (${saved.bankName})`);
    return saved;
  }

  async update(id: string, dto: UpdateAdminBankAccountDto): Promise<AdminBankAccountEntity> {
    const account = await this.findById(id);
    if (dto.symbolId && dto.symbolId !== account.symbolId) {
      await this.assertSymbolUsable(dto.symbolId);
    }

    // Changing the identifiers invalidates the previous inquiry — the flags
    // must go off until it is re-run against the new numbers.
    const identityChanged =
      (dto.iban !== undefined && dto.iban !== account.iban) ||
      (dto.cardNumber !== undefined && dto.cardNumber !== account.cardNumber) ||
      (dto.ownerName !== undefined && dto.ownerName !== account.ownerName);

    Object.assign(account, dto);
    this.assertIdentifier(account);

    if (identityChanged) {
      account.verifiedAt = null;
      account.verificationJson = null;
      account.useForDeposit = false;
      account.useForWithdraw = false;
    }

    return this.repo.save(account);
  }

  async setDirections(id: string, dto: SetDirectionsDto): Promise<AdminBankAccountEntity> {
    const account = await this.findById(id);
    if ((dto.useForDeposit || dto.useForWithdraw) && !account.verifiedAt) {
      throw new BadRequestException(
        "Verify the account owner before enabling it for deposit or withdraw",
      );
    }
    account.useForDeposit = dto.useForDeposit;
    account.useForWithdraw = dto.useForWithdraw;
    return this.repo.save(account);
  }

  /** Accounts are never deleted — settled matches reference them. */
  async setStatus(id: string, status: AdminBankAccountStatusEnum) {
    const account = await this.findById(id);
    account.status = status;
    return this.repo.save(account);
  }

  /**
   * Runs the owner-name inquiry through the KYC provider already used to verify
   * customer bank accounts, and refuses the account when the returned name does
   * not match what the admin typed.
   */
  async verify(id: string): Promise<AdminBankAccountEntity> {
    const account = await this.findById(id);
    if (!account.iban && !account.cardNumber) {
      throw new BadRequestException("An IBAN or card number is required to verify ownership");
    }

    const result = account.iban
      ? await this.kycService.getIbanInfo(account.iban)
      : await this.kycService.getCardInfo(account.cardNumber);

    const owners = this.extractOwnerNames(result);
    if (!owners.length) {
      throw new BadRequestException("The inquiry returned no owner name for this account");
    }

    const expected = normaliseName(account.ownerName);
    const matched = owners.some((o) => normaliseName(o) === expected);
    if (!matched) {
      throw new BadRequestException(
        `Owner name does not match the inquiry result (${owners.join(", ")})`,
      );
    }

    account.verifiedAt = new Date();
    account.verificationJson = result;
    return this.repo.save(account);
  }

  // ─── Selection and limits (used by p2p settlement) ─────────

  /**
   * Highest-priority account able to take `amount` in `direction` right now.
   * Returns null when none is eligible — the caller raises
   * ADMIN_ACCOUNT_UNAVAILABLE rather than silently falling back.
   */
  async pickAccount(
    direction: BankAccountDirectionEnum,
    symbolId: string,
    amount: number,
    manager?: EntityManager,
  ): Promise<AdminBankAccountEntity | null> {
    const repo = manager ? manager.getRepository(AdminBankAccountEntity) : this.repo;
    const flag = direction === BankAccountDirectionEnum.DEPOSIT
      ? "use_for_deposit"
      : "use_for_withdraw";

    const candidates = await repo
      .createQueryBuilder("a")
      .where(`a.${flag} = true`)
      .andWhere("a.status = :status", { status: AdminBankAccountStatusEnum.ACTIVE })
      .andWhere("a.symbol_id = :symbolId", { symbolId })
      .orderBy("a.priority", "ASC")
      .addOrderBy("a.created_at", "ASC")
      .getMany();

    for (const raw of candidates) {
      const account = this.withTodayUsage(raw);
      if (!this.isWithinActiveHours(account)) continue;
      if (this.hasHeadroom(account, direction, amount)) return account;
    }
    return null;
  }

  /**
   * Books `amount` against the account's daily counter for that direction.
   * Called inside the settlement transaction so a rolled-back settlement
   * cannot leak limit budget.
   */
  async consumeHeadroom(
    manager: EntityManager,
    accountId: string,
    direction: BankAccountDirectionEnum,
    amount: number,
  ): Promise<void> {
    const repo = manager.getRepository(AdminBankAccountEntity);
    const locked = await repo.findOne({
      where: { id: accountId },
      lock: { mode: "pessimistic_write" },
    });
    if (!locked) throw new NotFoundException("Bank account not found");

    const account = this.withTodayUsage(locked);
    if (!this.hasHeadroom(account, direction, amount)) {
      throw new BadRequestException("Bank account has no remaining limit for this amount");
    }

    const today = this.todayKey();
    if (direction === BankAccountDirectionEnum.DEPOSIT) {
      account.depositUsedToday = Number(account.depositUsedToday) + amount;
    } else {
      account.withdrawUsedToday = Number(account.withdrawUsedToday) + amount;
    }
    account.usedTodayDate = today;
    await repo.save(account);
  }

  /** Zeroes the per-direction counters whose date marker has rolled over. */
  async resetDailyCounters(): Promise<number> {
    const result = await this.repo
      .createQueryBuilder()
      .update(AdminBankAccountEntity)
      .set({ depositUsedToday: 0, withdrawUsedToday: 0, usedTodayDate: this.todayKey() })
      .where("used_today_date IS DISTINCT FROM :today", { today: this.todayKey() })
      .execute();
    return result.affected ?? 0;
  }

  // ─── Helpers ───────────────────────────────────────────────

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  /**
   * A counter stamped with an earlier date is spent budget from a previous day.
   * Treating it as zero on read means selection is correct even if the daily
   * reset job has not run yet.
   */
  private withTodayUsage(account: AdminBankAccountEntity): AdminBankAccountEntity {
    if (account.usedTodayDate !== this.todayKey()) {
      account.depositUsedToday = 0;
      account.withdrawUsedToday = 0;
    }
    return account;
  }

  private isWithinActiveHours(account: AdminBankAccountEntity): boolean {
    const { activeFromHour: from, activeToHour: to } = account;
    if (from === null || from === undefined || to === null || to === undefined) return true;
    const hour = new Date().getHours();
    // A window like 22→6 wraps past midnight.
    return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
  }

  private hasHeadroom(
    account: AdminBankAccountEntity,
    direction: BankAccountDirectionEnum,
    amount: number,
  ): boolean {
    const isDeposit = direction === BankAccountDirectionEnum.DEPOSIT;
    const perTx = Number(isDeposit ? account.depositPerTxLimit : account.withdrawPerTxLimit) || 0;
    const daily = Number(isDeposit ? account.depositDailyLimit : account.withdrawDailyLimit) || 0;
    const used = Number(isDeposit ? account.depositUsedToday : account.withdrawUsedToday) || 0;

    if (perTx > 0 && amount > perTx) return false;
    if (daily > 0 && used + amount > daily) return false;
    return true;
  }

  private assertIdentifier(dto: {
    iban?: string;
    accountNumber?: string;
    cardNumber?: string;
  }): void {
    if (!dto.iban && !dto.accountNumber && !dto.cardNumber) {
      throw new BadRequestException(
        "At least one of iban, accountNumber or cardNumber is required",
      );
    }
  }

  private async assertSymbolUsable(symbolId: string): Promise<void> {
    const symbol = await this.symbolRepo.findOne({ where: { id: symbolId } });
    if (!symbol) throw new NotFoundException("Symbol not found");
    if (symbol.symbolType !== SymbolTypeEnum.RIAL) {
      throw new BadRequestException("Company bank accounts are only supported for rial symbols");
    }
  }

  /** The inquiry payload shape differs per provider and endpoint. */
  private extractOwnerNames(result: any): string[] {
    const names: string[] = [];
    const push = (v: any) => {
      if (typeof v === "string" && v.trim()) names.push(v.trim());
    };

    const info = result?.ibanInfo ?? result?.cardInfo ?? result;
    push(info?.ownerName);
    push(info?.name);
    push(info?.fullName);

    const owners = info?.owners ?? info?.owner;
    for (const owner of Array.isArray(owners) ? owners : [owners]) {
      if (!owner) continue;
      push(owner.fullName);
      push(owner.ownerName);
      if (owner.firstName || owner.lastName) {
        push(`${owner.firstName ?? ""} ${owner.lastName ?? ""}`);
      }
    }
    return names;
  }
}
