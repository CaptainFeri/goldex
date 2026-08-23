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
    private readonly userLevelService: UserLevelService,
  ) {}

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
      where: { userId, walletType: WalletTypeEnum.DEPOSIT },
      relations: { symbol: true },
      order: { createAt: "ASC" },
    });
    const filtered = await this.filterWalletsByMarketType(userId, wallets);
    return filtered.map((w) => this.toWalletView(w));
  }

  async getWalletById(userId: string, walletId: string) {
    const wallet = await this.walletRepo.findOne({
      where: { id: walletId, userId },
      relations: { symbol: true },
    });
    if (!wallet) throw new NotFoundException("Wallet not found");
    const filtered = await this.filterWalletsByMarketType(userId, [wallet]);
    if (filtered.length === 0) throw new NotFoundException("Wallet not found");
    return this.toWalletView(filtered[0]);
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

  private toWalletView(w: WalletEntity) {
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
          }
        : null,
      freeBalance: free,
      lockedBalance: locked,
      creditBalance: credit,
      frozenFreeBalance: frozenFree,
      frozenLockedBalance: frozenLocked,
      totalBalance: free + locked + frozenFree + frozenLocked,
      availableBalance: free,
      updatedAt: w.updateAt,
    };
  }
}
