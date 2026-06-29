import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { UserEntity } from "../user/entity/user.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { Repository } from "typeorm";

@Injectable()
export class UserWalletService {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>
  ) {}

  async registerGenerateWallets(user: UserEntity) {
    const availableSymbols = await this.symbolRepo.find({ where: { isActive: true } });
    const wallets: WalletEntity[] = [];
    for (let i = 0; i < availableSymbols.length; i++) {
      const newWallet = new WalletEntity();
      newWallet.symbol = availableSymbols[i];
      newWallet.user = user;
      newWallet.freeBalance = 0;
      newWallet.lockedBalance = 0;
      wallets.push(newWallet);
      await this.walletRepo.save(newWallet);
    }
    return wallets;
  }

  // All wallets for a user, each with its symbol and derived balances.
  async getUserWallets(userId: string) {
    const wallets = await this.walletRepo.find({
      where: { userId },
      relations: { symbol: true },
      order: { createAt: "ASC" },
    });
    return wallets.map((w) => this.toWalletView(w));
  }

  async getWalletById(userId: string, walletId: string) {
    const wallet = await this.walletRepo.findOne({
      where: { id: walletId, userId },
      relations: { symbol: true },
    });
    if (!wallet) throw new NotFoundException("Wallet not found");
    return this.toWalletView(wallet);
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

  private toWalletView(w: WalletEntity) {
    const free = Number(w.freeBalance);
    const locked = Number(w.lockedBalance);
    const frozenFree = Number(w.frozenFreeBalance);
    return {
      id: w.id,
      status: w.status,
      symbol: w.symbol
        ? { id: w.symbol.id, name: w.symbol.name, slug: w.symbol.slug, picPath: w.symbol.picPath }
        : null,
      freeBalance: free,
      lockedBalance: locked,
      totalBalance: free + locked,
      availableBalance: free - frozenFree,
      updatedAt: w.updateAt,
    };
  }
}
