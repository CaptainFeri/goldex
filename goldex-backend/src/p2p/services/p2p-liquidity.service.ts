import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { TransactionEntity } from "../../wallet/entities/transaction.entity";
import { TransactionTypeEnum } from "../../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../../wallet/enum/transaction.status.enum";
import { WalletTypeEnum } from "../../wallet/enum/wallet-type.enum";
import { WalletStatusEnum } from "../../wallet/enum/wallet-status.enum";
import { SymbolEntity } from "../../admin-symbol/entity/symbol.entity";
import { SymbolTypeEnum } from "../../admin-symbol/enum/symbol.type.enum";

const round8 = (n: number) => Number(n.toFixed(8));

/**
 * The company's own side of the ledger.
 *
 * A designated system user (GOLDEX_P2P_ADMIN_USER_ID) owns ordinary wallets,
 * so an admin settlement is a normal `transaction` pair rather than a special
 * balance edit — which is what keeps platform-wide rial conserved when the
 * company stands in for a customer:
 *
 *   company pays a withdrawer  → withdrawer.locked falls, company.free rises
 *   depositor pays the company → depositor.free rises, company.free falls
 *
 * Both legs are internal; the real money moved through the bank account named
 * on `admin_bank_account`.
 */
@Injectable()
export class P2pLiquidityService {
  private readonly logger = new Logger(P2pLiquidityService.name);

  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
    private readonly config: ConfigService,
  ) {}

  get adminUserId(): string | undefined {
    return this.config.get<string>("p2p.adminUserId");
  }

  private requireAdminUserId(): string {
    const id = this.adminUserId;
    if (!id) {
      throw new BadRequestException(
        "GOLDEX_P2P_ADMIN_USER_ID is not configured, so the company wallet cannot be used",
      );
    }
    return id;
  }

  /** Company wallet for a symbol, locked for update and created on first use. */
  async lockAdminWallet(manager: EntityManager, symbolId: string): Promise<WalletEntity> {
    const userId = this.requireAdminUserId();

    let wallet = await manager.findOne(WalletEntity, {
      where: { userId, symbolId, walletType: WalletTypeEnum.DEPOSIT },
      lock: { mode: "pessimistic_write" },
    });
    if (!wallet) {
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
      this.logger.log(`Created company p2p wallet ${wallet.id} for symbol ${symbolId}`);
    }
    return wallet;
  }

  /**
   * The company takes on internal rial after paying a withdrawer's bank
   * account from a company account.
   */
  async creditAdmin(
    manager: EntityManager,
    symbolId: string,
    amount: number,
    reference: Record<string, any>,
  ): Promise<void> {
    const wallet = await this.lockAdminWallet(manager, symbolId);
    wallet.freeBalance = round8(Number(wallet.freeBalance) + amount);
    await manager.save(wallet);
    await this.writeTransaction(manager, wallet.id, {
      type: TransactionTypeEnum.P2P_ADMIN_SETTLE,
      amount,
      description: "p2p company account paid a withdrawer",
      metadata: reference,
    });
  }

  /**
   * The company gives up internal rial because a depositor paid real money
   * into a company account instead of to a peer.
   */
  async debitAdmin(
    manager: EntityManager,
    symbolId: string,
    amount: number,
    reference: Record<string, any>,
  ): Promise<void> {
    const wallet = await this.lockAdminWallet(manager, symbolId);
    if (Number(wallet.freeBalance) < amount) {
      throw new BadRequestException(
        "نقدینگی کیف پول مدیر برای این تسویه کافی نیست",
      );
    }
    wallet.freeBalance = round8(Number(wallet.freeBalance) - amount);
    await manager.save(wallet);
    await this.writeTransaction(manager, wallet.id, {
      type: TransactionTypeEnum.P2P_ADMIN_SETTLE,
      amount: -amount,
      description: "p2p company account funded a depositor",
      metadata: reference,
    });
  }

  /**
   * Spendable company balance across rial symbols — the "admin liquidity"
   * figure on the operations dashboard.
   */
  async getLiquidity(): Promise<{ total: number; bySymbol: { symbolId: string; slug?: string; balance: number }[] }> {
    const userId = this.adminUserId;
    if (!userId) return { total: 0, bySymbol: [] };

    const symbols = await this.symbolRepo.find({ where: { symbolType: SymbolTypeEnum.RIAL } });
    if (!symbols.length) return { total: 0, bySymbol: [] };

    const wallets = await this.walletRepo.find({
      where: symbols.map((s) => ({
        userId,
        symbolId: s.id,
        walletType: WalletTypeEnum.DEPOSIT,
      })),
    });

    const bySymbol = symbols.map((s) => ({
      symbolId: s.id,
      slug: s.slug ?? s.name,
      balance: Number(wallets.find((w) => w.symbolId === s.id)?.freeBalance ?? 0),
    }));

    return {
      total: round8(bySymbol.reduce((sum, row) => sum + row.balance, 0)),
      bySymbol,
    };
  }

  private async writeTransaction(
    manager: EntityManager,
    walletId: string,
    opts: {
      type: TransactionTypeEnum;
      amount: number;
      description: string;
      metadata: Record<string, any>;
    },
  ): Promise<void> {
    await manager.save(
      manager.create(TransactionEntity, {
        walletId,
        transactionId: `P2PADM-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
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
