import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { UserEntity } from "../user/entity/user.entity";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";
import { MarketTypeEnum } from "../admin-pair/enum/market.type.enum";
import { UserRoleEnum } from "../shared/enum/user.role.enum";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { WalletTypeEnum } from "../wallet/enum/wallet-type.enum";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { UserLevelService } from "../user-level/user-level.service";
import { SymbolCapabilitiesService } from "../admin-symbol/symbol-capabilities.service";
import { CreditEntity } from "../credit/entity/credit.entity";
import { CollateralLockEntity } from "../credit/entity/collateral-lock.entity";
import { CreditStatusEnum } from "../credit/enum/credit-status.enum";
import { CollateralLockStatusEnum } from "../credit/enum/collateral-lock-status.enum";

@Injectable()
export class UserWalletService {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
    @InjectRepository(UserMarketTypeEntity)
    private readonly userMarketTypeRepo: Repository<UserMarketTypeEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(CreditEntity)
    private readonly creditRepo: Repository<CreditEntity>,
    @InjectRepository(CollateralLockEntity)
    private readonly collateralLockRepo: Repository<CollateralLockEntity>,
    private readonly userLevelService: UserLevelService,
    private readonly capabilities: SymbolCapabilitiesService,
  ) {}

  /**
   * code -> display name for every registered gateway, so the client can label
   * its picker instead of showing a raw slug like "kaino-informal". Falls back
   * to an empty map when goldex-cbp is unreachable; the client then shows the
   * code, which is still usable.
   */
  private async gatewayLabels(): Promise<Record<string, string>> {
    try {
      const { gateways } = await this.capabilities.getCapabilities();
      return Object.fromEntries(gateways.map((g) => [g.code, g.name]));
    } catch {
      return {};
    }
  }

  async registerGenerateWallets(user: UserEntity, marketTypes?: string[]) {
    const where: any = { isActive: true };
    if (marketTypes && marketTypes.length > 0) {
      where.marketType = In(marketTypes);
    }
    const availableSymbols = await this.symbolRepo.find({ where });
    const wallets: WalletEntity[] = [];
    for (let i = 0; i < availableSymbols.length; i++) {
      const newWallet = new WalletEntity();
      newWallet.symbol = availableSymbols[i];
      newWallet.user = user;
      newWallet.walletType = WalletTypeEnum.DEPOSIT;
      newWallet.freeBalance = 0;
      newWallet.lockedBalance = 0;
      wallets.push(newWallet);
      await this.walletRepo.save(newWallet);
    }
    return wallets;
  }

  // All wallets for a user, each with its symbol and derived balances.
  // Wallets are filtered by the user's assigned market types.
  async getUserWallets(userId: string) {
    const wallets = await this.walletRepo.find({
      where: { userId },
      relations: { symbol: true },
      order: { createAt: "ASC" },
    });
    const filtered = await this.filterWalletsByMarketType(userId, wallets);
    const labels = await this.gatewayLabels();
    const lockedCollateral = filtered.some((w) => w.walletType === WalletTypeEnum.COLLATERAL)
      ? await this.lockedCollateralBySymbol(userId)
      : {};
    return filtered.map((w) => this.toWalletView(w, labels, lockedCollateral));
  }

  async getWalletById(userId: string, walletId: string) {
    const wallet = await this.walletRepo.findOne({
      where: { id: walletId, userId },
      relations: { symbol: true },
    });
    if (!wallet) throw new NotFoundException("Wallet not found");
    const filtered = await this.filterWalletsByMarketType(userId, [wallet]);
    if (filtered.length === 0) throw new NotFoundException("Wallet not found");
    const lockedCollateral =
      filtered[0].walletType === WalletTypeEnum.COLLATERAL
        ? await this.lockedCollateralBySymbol(userId)
        : {};
    return this.toWalletView(filtered[0], await this.gatewayLabels(), lockedCollateral);
  }

  // Paginated transactions across the user's wallets (optionally one wallet).
  async getTransactions(userId: string, opts: { walletId?: string; limit?: number; offset?: number }) {
    const limit = Math.min(opts.limit ?? 20, 100);
    const offset = opts.offset ?? 0;

    const qb = this.transactionRepo
      .createQueryBuilder("transaction")
      .leftJoinAndSelect("transaction.wallet", "wallet")
      .leftJoinAndSelect("wallet.symbol", "symbol")
      .where("wallet.user_id = :userId", { userId });

    if (opts.walletId) {
      qb.andWhere("wallet.id = :walletId", { walletId: opts.walletId });
    }

    qb.orderBy("transaction.created_at", "DESC").skip(offset).take(limit);

    const [items, total] = await qb.getManyAndCount();

    return {
      total,
      transactions: items.map((t) => ({
        id: t.id,
        transactionId: t.transactionId,
        type: t.transactionType,
        status: t.status,
        amount: Number(t.amount),
        fee: Number(t.fee),
        price: t.price != null ? Number(t.price) : null,
        description: t.description,
        symbol: t.wallet?.symbol
          ? { id: t.wallet.symbol.id, name: t.wallet.symbol.name, slug: t.wallet.symbol.slug }
          : null,
        orderId: t.orderId,
        createdAt: t.createAt,
        completedAt: t.completedAt,
      })),
    };
  }

  // Filter wallets to only include those matching the user's assigned market types
  // and the symbols covered by the user's level pairs. Mirrors the logic in
  // MarketController.getPairs.
  private async filterWalletsByMarketType(userId: string, wallets: WalletEntity[]): Promise<WalletEntity[]> {
    const userMts = await this.userMarketTypeRepo.find({ where: { userId } });
    let filtered: WalletEntity[];
    if (userMts.length > 0) {
      const allowed = new Set(userMts.map((r) => r.marketType));
      filtered = wallets.filter((w) => w.symbol && allowed.has(w.symbol.marketType));
    } else {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (user && user.role === UserRoleEnum.PARTNER) {
        filtered = wallets;
      } else {
        filtered = wallets.filter((w) => w.symbol?.marketType === MarketTypeEnum.FORMAL);
      }
    }

    // Level pairs win: if the user's level explicitly grants pairs, restrict
    // wallets to only the symbols covered by those pairs.
    const allowedSymbolIds = await this.userLevelService.getUserAllowedSymbolIds(userId);
    if (allowedSymbolIds.length > 0) {
      const allowed = new Set(allowedSymbolIds);
      filtered = filtered.filter((w) => w.symbol && allowed.has(w.symbol.id));
    }

    return filtered;
  }

  /**
   * Collateral each of the user's open credit trades is holding, per symbol.
   *
   * A COLLATERAL wallet's balance sits entirely in freeBalance while the
   * per-trade `collateral_lock` rows record what is actually committed to open
   * trades, so without this the user sees their whole collateral as available
   * when part of it is backing a position. Derived on read rather than mirrored
   * onto the wallet, so the locks remain the only place the figure is authored.
   */
  private async lockedCollateralBySymbol(userId: string): Promise<Record<string, number>> {
    const credits = await this.creditRepo.find({
      where: { userId, status: In([CreditStatusEnum.ACTIVE, CreditStatusEnum.SUSPENDED]) },
      select: { id: true, collateralSymbolId: true },
    });
    if (!credits.length) return {};

    const locks = await this.collateralLockRepo.find({
      where: {
        creditId: In(credits.map((c) => c.id)),
        status: In([
          CollateralLockStatusEnum.CREATED,
          CollateralLockStatusEnum.ACTIVE,
          CollateralLockStatusEnum.RELEASE_PENDING,
        ]),
      },
    });

    const symbolByCredit = new Map(credits.map((c) => [c.id, c.collateralSymbolId]));
    const bySymbol: Record<string, number> = {};
    for (const lock of locks) {
      const symbolId = symbolByCredit.get(lock.creditId);
      if (!symbolId) continue;
      bySymbol[symbolId] = (bySymbol[symbolId] || 0) + (Number(lock.amount) || 0);
    }
    return bySymbol;
  }

  private toWalletView(
    w: WalletEntity,
    gatewayLabels: Record<string, string> = {},
    lockedCollateral: Record<string, number> = {},
  ) {
    const free = Number(w.freeBalance);
    const locked = Number(w.lockedBalance);
    const frozenFree = Number(w.frozenFreeBalance);
    const frozenLocked = Number(w.frozenLockedBalance);
    const credit = Number(w.creditBalance);
    return {
      id: w.id,
      walletType: w.walletType || WalletTypeEnum.DEPOSIT,
      status: w.status,
      symbol: w.symbol
        ? {
            id: w.symbol.id,
            name: w.symbol.name,
            slug: w.symbol.slug,
            picPath: w.symbol.picPath,
            type: w.symbol.symbolType,
            depositTypes: w.symbol.depositTypes,
            withdrawTypes: w.symbol.withdrawTypes,
            // The client renders a gateway picker from these; without them its
            // select is always empty and the user can never choose between two
            // configured gateways.
            hasPaymentGateway: w.symbol.hasPaymentGateway,
            depositGateways: w.symbol.depositGateways ?? [],
            withdrawGateways: w.symbol.withdrawGateways ?? [],
            defaultDepositGateway: w.symbol.defaultDepositGateway ?? null,
            defaultWithdrawGateway: w.symbol.defaultWithdrawGateway ?? null,
            gatewayLabels,
          }
        : null,
      freeBalance: free,
      lockedBalance: locked,
      creditBalance: credit,
      frozenFreeBalance: frozenFree,
      frozenLockedBalance: frozenLocked,
      totalBalance: free + locked + frozenFree + frozenLocked,
      availableBalance: free,
      // Only a COLLATERAL wallet carries these: how much of the frozen
      // collateral is committed to open credit trades and how much is still
      // free to back a new one.
      ...(w.walletType === WalletTypeEnum.COLLATERAL
        ? (() => {
            const committed = Math.min(free, lockedCollateral[w.symbolId] || 0);
            return {
              collateralLocked: committed,
              collateralAvailable: Math.max(0, free - committed),
            };
          })()
        : {}),
      updatedAt: w.updateAt,
    };
  }
}
