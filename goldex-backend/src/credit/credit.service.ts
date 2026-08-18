import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { Repository, DataSource, LessThan, IsNull } from "typeorm";
import Decimal from "decimal.js";
import { CreditEntity } from "./entity/credit.entity";
import { CreditOrderEntity } from "./entity/credit-order.entity";
import { CreditNotificationEntity } from "./entity/credit-notification.entity";
import { CreditStatusEnum } from "./enum/credit-status.enum";
import { CreditOrderStatusEnum } from "./enum/credit-order-status.enum";
import { CreditNotificationTypeEnum } from "./enum/credit-notification-type.enum";
import { CreateCreditDto } from "./dto/create-credit.dto";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { TransactionTypeEnum } from "../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../wallet/enum/transaction.status.enum";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { SymbolTypeEnum } from "../admin-symbol/enum/symbol.type.enum";
import { MarketTypeEnum } from "../admin-pair/enum/market.type.enum";
import { UnitTypeEnum } from "../admin-symbol/enum/unit.type.enum";
import { GainTypeEnum } from "../admin-symbol/enum/gain.type.enum";
import { UserEntity } from "../user/entity/user.entity";
import { OrderEntity } from "../order/order.entity";
import { FinanceLogEntity } from "../finance-log/entity/finance-log.entity";
import { CreditActionEnum } from "./enum/credit-action.enum";
import { WalletStatusEnum } from "../wallet/enum/wallet-status.enum";
import { CreditEvents } from "../shared/constants/events.constants";
import { UserLevelService } from "../user-level/user-level.service";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -7, toExpPos: 21 });

@Injectable()
export class CreditService {
  private readonly logger = new Logger(CreditService.name);

  constructor(
    @InjectRepository(CreditEntity)
    private creditRepository: Repository<CreditEntity>,
    @InjectRepository(CreditOrderEntity)
    private creditOrderRepository: Repository<CreditOrderEntity>,
    @InjectRepository(CreditNotificationEntity)
    private creditNotificationRepository: Repository<CreditNotificationEntity>,
    @InjectRepository(WalletEntity)
    private walletRepository: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(SymbolEntity)
    private symbolRepository: Repository<SymbolEntity>,
    @InjectRepository(PricePairEntity)
    private readonly pricePairRepository: Repository<PricePairEntity>,
    @InjectRepository(UserEntity)
    private userRepository: Repository<UserEntity>,
    @InjectRepository(FinanceLogEntity)
    private financeLogRepository: Repository<FinanceLogEntity>,
    private dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly userLevelService: UserLevelService,
  ) {}

  async createCredit(adminId: string, dto: CreateCreditDto): Promise<CreditEntity> {
    return await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(UserEntity, { where: { id: dto.userId } });
      if (!user) throw new NotFoundException("User not found");

      const creditTradingEnabled = await this.userLevelService.hasFeature(dto.userId, "CREDIT_TRADING_ENABLED");
      if (!creditTradingEnabled) {
        throw new BadRequestException("Credit trading is not enabled for this user's level");
      }

      await this.enforceCreditLimits(dto.userId, dto.amount, dto.expireAt);

      const existingActive = await manager.findOne(CreditEntity, {
        where: { userId: dto.userId, status: CreditStatusEnum.ACTIVE },
      });
      if (existingActive) {
        throw new BadRequestException("User already has an active credit. Settle it first.");
      }

      const existingPending = await manager.findOne(CreditEntity, {
        where: { userId: dto.userId, status: CreditStatusEnum.PENDING },
      });
      if (existingPending) {
        throw new BadRequestException("User already has a pending credit. Settle or cancel it first.");
      }

      if (dto.hasCallMargin && !dto.callMarginPercent) {
        throw new BadRequestException("Call margin percent is required when hasCallMargin is true");
      }

      if (!dto.hasCallMargin) {
        dto.callMarginPercent = undefined;
      }

      const frozenSymbolIds: string[] = [];
      const frozenSymbolNames: { id: string; name: string }[] = [];

      if (dto.frozenWallets && dto.frozenWallets.length > 0) {
        for (const fw of dto.frozenWallets) {
          const wallet = await manager.findOne(WalletEntity, {
            where: { id: fw.walletId, userId: dto.userId },
            lock: { mode: "pessimistic_write" },
          });
          if (!wallet) throw new NotFoundException(`Wallet ${fw.walletId} not found for user`);
          if (wallet.status !== WalletStatusEnum.ACTIVE) continue;

          const symbol = await manager.findOne(SymbolEntity, { where: { id: wallet.symbolId } });
          const available = new Decimal(wallet.freeBalance).minus(wallet.frozenFreeBalance);
          const freezeAmount = new Decimal(Math.min(fw.amount, available.toNumber()));
          if (freezeAmount.greaterThan(0)) {
            wallet.frozenFreeBalance = new Decimal(wallet.frozenFreeBalance).plus(freezeAmount).toNumber();
            wallet.freeBalance = new Decimal(wallet.freeBalance).minus(freezeAmount).toNumber();
            wallet.adminNote = `Frozen for credit creation`;
            await manager.save(wallet);

            if (symbol) {
              frozenSymbolIds.push(symbol.id);
              frozenSymbolNames.push({ id: symbol.id, name: symbol.name });
            }

            await this.logFinanceAction(manager, {
              adminId,
              userId: dto.userId,
              actionType: CreditActionEnum.MATERIAL_FREEZE,
              description: `Frozen ${freezeAmount.toString()} of ${symbol?.name || wallet.symbolId} (Material) for credit`,
              metadata: { symbolId: wallet.symbolId, amount: freezeAmount.toString(), walletId: wallet.id },
            });

            const freezeTxn = manager.create(TransactionEntity, {
              walletId: wallet.id,
              transactionId: crypto.randomUUID(),
              transactionType: TransactionTypeEnum.MATERIAL_FREEZE,
              status: TransactionStatusEnum.COMPLETED,
              amount: freezeAmount.toNumber(),
              fee: 0,
              description: `Frozen ${freezeAmount.toString()}g ${symbol?.name || ''} for credit collateral`,
              metadata: { adminId, symbolId: wallet.symbolId, walletId: wallet.id, amount: freezeAmount.toString() },
              completedAt: new Date(),
            });
            await manager.save(freezeTxn);
          }
        }
      } else {
        const materialSymbols = await manager.find(SymbolEntity, {
          where: { symbolType: SymbolTypeEnum.MATERIAL, isActive: true },
        });

        for (const symbol of materialSymbols) {
          const wallet = await manager.findOne(WalletEntity, {
            where: { userId: dto.userId, symbolId: symbol.id },
            lock: { mode: "pessimistic_write" },
          });
          if (!wallet) continue;
          if (wallet.status !== WalletStatusEnum.ACTIVE) continue;

          const available = new Decimal(wallet.freeBalance).minus(wallet.frozenFreeBalance);
          if (available.greaterThan(0)) {
            wallet.frozenFreeBalance = new Decimal(wallet.frozenFreeBalance).plus(available).toNumber();
            wallet.freeBalance = new Decimal(wallet.freeBalance).minus(available).toNumber();
            wallet.adminNote = `Frozen for credit creation`;
            await manager.save(wallet);

            frozenSymbolIds.push(symbol.id);
            frozenSymbolNames.push({ id: symbol.id, name: symbol.name });

            await this.logFinanceAction(manager, {
              adminId,
              userId: dto.userId,
              actionType: CreditActionEnum.MATERIAL_FREEZE,
              description: `Frozen ${available.toString()} of ${symbol.name} (Material) for credit`,
              metadata: { symbolId: symbol.id, symbolName: symbol.name, amount: available.toString(), walletId: wallet.id },
            });

            const freezeTxn = manager.create(TransactionEntity, {
              walletId: wallet.id,
              transactionId: crypto.randomUUID(),
              transactionType: TransactionTypeEnum.MATERIAL_FREEZE,
              status: TransactionStatusEnum.COMPLETED,
              amount: available.toNumber(),
              fee: 0,
              description: `Frozen ${available.toString()}g ${symbol.name} for credit collateral`,
              metadata: { adminId, symbolId: symbol.id, walletId: wallet.id, amount: available.toString() },
              completedAt: new Date(),
            });
            await manager.save(freezeTxn);
          }
        }
      }

      // Resolve the wallet that receives the credit amount. Defaults to the
      // user's RIAL wallet; admin may point to another wallet via creditWalletId.
      let creditWallet: WalletEntity;
      let creditSymbolName = "RIAL";

      if (dto.creditWalletId) {
        creditWallet = await manager.findOne(WalletEntity, {
          where: { id: dto.creditWalletId, userId: dto.userId },
          lock: { mode: "pessimistic_write" },
        });
        if (!creditWallet) {
          throw new NotFoundException(`Credit wallet ${dto.creditWalletId} not found for user`);
        }
        if (creditWallet.status !== WalletStatusEnum.ACTIVE) {
          throw new BadRequestException("Credit wallet is not active");
        }
        const sym = await manager.findOne(SymbolEntity, { where: { id: creditWallet.symbolId } });
        creditSymbolName = sym?.name || sym?.slug || creditWallet.symbolId;
      } else {
        let rialSymbol = await manager.findOne(SymbolEntity, {
          where: { symbolType: SymbolTypeEnum.RIAL, isActive: true },
        });
        if (!rialSymbol) {
          rialSymbol = manager.create(SymbolEntity, {
            name: "RIAL",
            slug: "IRR",
            symbolType: SymbolTypeEnum.RIAL,
            marketType: MarketTypeEnum.FORMAL,
            isActive: true,
            unitType: UnitTypeEnum.NUMBER,
            gainType: GainTypeEnum.NUMBER,
            gain: 0,
            picPath: "/uploads/symbols/rial.png",
            hasPaymentGateway: false,
          });
          rialSymbol = await manager.save(rialSymbol);
        }

        creditWallet = await manager.findOne(WalletEntity, {
          where: { userId: dto.userId, symbolId: rialSymbol.id },
          lock: { mode: "pessimistic_write" },
        });
        if (!creditWallet) {
          creditWallet = manager.create(WalletEntity, {
            userId: dto.userId,
            symbolId: rialSymbol.id,
            freeBalance: 0,
            lockedBalance: 0,
            status: WalletStatusEnum.ACTIVE,
          });
        }
        creditSymbolName = rialSymbol.name || "RIAL";
      }

      creditWallet.freeBalance = new Decimal(creditWallet.freeBalance).plus(dto.amount).toNumber();
      creditWallet.adminNote = `Credit deposit of ${dto.amount} ${creditSymbolName}`;
      await manager.save(creditWallet);

      const transaction = manager.create(TransactionEntity, {
        walletId: creditWallet.id,
        transactionId: crypto.randomUUID(),
        transactionType: TransactionTypeEnum.CREDIT_DEPOSIT,
        status: TransactionStatusEnum.COMPLETED,
        amount: dto.amount,
        fee: 0,
        description: `Credit balance increase of ${dto.amount} ${creditSymbolName}`,
        metadata: { adminId, creditCode: `CR-${Date.now().toString(36).toUpperCase()}` },
        completedAt: new Date(),
      });
      await manager.save(transaction);

      const creditCode = `CR-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      const credit = manager.create(CreditEntity, {
        userId: dto.userId,
        adminId,
        creditCode,
        amount: dto.amount,
        status: CreditStatusEnum.ACTIVE,
        hasCallMargin: dto.hasCallMargin || false,
        callMarginPercent: dto.callMarginPercent,
        reminderTimerHours: dto.reminderTimerHours || 24,
        maxExecutionTradeLevel: dto.maxExecutionTradeLevel,
        executedTradeLevel: 0,
        expireAt: new Date(dto.expireAt),
        activatedAt: new Date(),
        notes: dto.notes,
        metadata: { frozenMaterialSymbols: frozenSymbolNames, creditWalletId: creditWallet.id, creditSymbol: creditSymbolName },
      });
      const savedCredit = await manager.save(credit);

      await this.logFinanceAction(manager, {
        adminId,
        userId: dto.userId,
        creditId: savedCredit.id,
        walletId: creditWallet.id,
        actionType: CreditActionEnum.CREDIT_CREATED,
        description: `Credit created for ${dto.amount} ${creditSymbolName} on wallet, expireAt: ${dto.expireAt}`,
        metadata: {
          creditCode: savedCredit.creditCode,
          amount: dto.amount,
          creditWalletId: creditWallet.id,
          creditSymbol: creditSymbolName,
          hasCallMargin: dto.hasCallMargin,
          callMarginPercent: dto.callMarginPercent,
          reminderTimerHours: dto.reminderTimerHours,
          expireAt: dto.expireAt,
        },
      });

      await this.logFinanceAction(manager, {
        adminId,
        userId: dto.userId,
        creditId: savedCredit.id,
        walletId: creditWallet.id,
        actionType: CreditActionEnum.BALANCE_INCREASED,
        description: `Balance increased by ${dto.amount} ${creditSymbolName} for credit ${savedCredit.creditCode}`,
        metadata: { amount: dto.amount, creditCode: savedCredit.creditCode },
      });

      return savedCredit;
    });
  }

  async linkOrderToCredit(creditId: string, order: OrderEntity, priceAtOrderTime: number): Promise<CreditOrderEntity> {
    return await this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId, status: CreditStatusEnum.ACTIVE },
      });
      if (!credit) throw new BadRequestException("Credit not found or not active");

      const creditOrder = manager.create(CreditOrderEntity, {
        creditId,
        orderId: order.id,
        priceAtOrderTime,
        status: CreditOrderStatusEnum.ACTIVE,
        drawdownPercent: credit.callMarginPercent,
      });
      return await manager.save(creditOrder);
    });
  }

  async checkOrderMarginCall(creditOrderId: string, currentPrice: number): Promise<void> {
    const creditOrder = await this.creditOrderRepository.findOne({
      where: { id: creditOrderId, status: CreditOrderStatusEnum.ACTIVE },
      relations: { credit: true, order: { pricePair: true } },
    });
    if (!creditOrder || !creditOrder.credit.hasCallMargin) return;

    const savedPrice = new Decimal(creditOrder.priceAtOrderTime);
    const newPrice = new Decimal(currentPrice);
    if (savedPrice.equals(0)) return;

    const drawdown = newPrice.minus(savedPrice).div(savedPrice).mul(100);
    const absDrawdown = drawdown.abs();

    creditOrder.currentPrice = currentPrice;

    if (absDrawdown.greaterThanOrEqualTo(creditOrder.credit.callMarginPercent)) {
      creditOrder.status = CreditOrderStatusEnum.MARGIN_CALLED;
      creditOrder.marginCalledAt = new Date();
      await this.creditOrderRepository.save(creditOrder);

      this.eventEmitter.emit(CreditEvents.MARGIN_CALL, {
        userId: creditOrder.credit.userId,
        creditId: creditOrder.creditId,
        marginPercent: creditOrder.credit.callMarginPercent,
      });

      // Block the user's wallets so no new credit-linked orders can be placed.
      await this.blockUserForMarginCall(creditOrder.credit.userId, creditOrder.creditId);

      // Persist an in-app margin-call notification.
      await this.creditNotificationRepository.save(
        this.creditNotificationRepository.create({
          userId: creditOrder.credit.userId,
          creditId: creditOrder.creditId,
          type: CreditNotificationTypeEnum.MARGIN_CALL,
          message:
            `Margin call triggered on credit ${creditOrder.credit.creditCode}. ` +
            `Your wallets have been frozen. Please contact support or settle your credit to resume trading.`,
          sentAt: new Date(),
        }),
      );

      await this.cancelCreditOrder(creditOrder);
    } else {
      await this.creditOrderRepository.save(creditOrder);
    }
  }

  async cancelCreditOrder(creditOrder: CreditOrderEntity): Promise<void> {
    const order = creditOrder.order;
    if (!order) return;

    if (order.status === "PENDING" || order.status === "PARTIALLY_COMPLETED") {
      const partialQty = new Decimal(order.executedQuantity || 0);
      const totalQty = new Decimal(order.quantity);

      let refundAmount = new Decimal(0);
      if (partialQty.greaterThan(0)) {
        refundAmount = partialQty.mul(creditOrder.priceAtOrderTime);
      }

      await this.dataSource.transaction(async (manager) => {
        if (refundAmount.greaterThan(0)) {
          const rialSymbol = await manager.findOne(SymbolEntity, {
            where: { symbolType: SymbolTypeEnum.RIAL },
          });
          if (rialSymbol) {
            let rialWallet = await manager.findOne(WalletEntity, {
              where: { userId: order.userId, symbolId: rialSymbol.id },
              lock: { mode: "pessimistic_write" },
            });
            if (!rialWallet) {
              rialWallet = manager.create(WalletEntity, {
                userId: order.userId,
                symbolId: rialSymbol.id,
                freeBalance: 0,
                lockedBalance: 0,
                status: WalletStatusEnum.ACTIVE,
              });
            }
            rialWallet.freeBalance = new Decimal(rialWallet.freeBalance).plus(refundAmount).toNumber();
            await manager.save(rialWallet);

            await this.logFinanceAction(manager, {
              adminId: null,
              userId: order.userId,
              creditId: creditOrder.creditId,
              orderId: order.id,
              actionType: CreditActionEnum.LIQUIDATION,
              description: `Partial order refund of ${refundAmount.toString()} to Rial wallet due to margin call`,
              metadata: { partialQuantity: partialQty.toString(), refundAmount: refundAmount.toString() },
            });
          }
        }

        if (order.status !== "CANCELLED") {
          order.status = "CANCELLED" as any;
          (order as any).cancelledAt = new Date();
          await manager.save(order);
        }
      });
    }
  }

  async sendReminderNotifications(): Promise<void> {
    const activeCredits = await this.creditRepository.find({
      where: { status: CreditStatusEnum.ACTIVE },
      relations: { user: true },
    });

    const now = new Date();

    for (const credit of activeCredits) {
      const expireAt = new Date(credit.expireAt);
      const diffMs = expireAt.getTime() - now.getTime();
      const diffHours = diffMs / (1000 * 60 * 60);

      if (diffHours <= 0) continue;

      const reminderHours = new Decimal(credit.reminderTimerHours);
      if (diffHours > credit.reminderTimerHours) continue;

      const shouldSend = !credit.reminderLastSentAt ||
        (now.getTime() - credit.reminderLastSentAt.getTime()) >= credit.reminderTimerHours * 60 * 60 * 1000;

      if (!shouldSend) continue;

      const daysRemaining = Math.ceil(diffHours / 24);
      const message =
        `Credit ${credit.creditCode} expires in ${daysRemaining} day(s) (${diffHours.toFixed(1)} hours). ` +
        `Please settle your credit to avoid account restrictions.`;

      const notification = this.creditNotificationRepository.create({
        userId: credit.userId,
        creditId: credit.id,
        type: CreditNotificationTypeEnum.REMINDER,
        message,
        sentAt: now,
      });
      await this.creditNotificationRepository.save(notification);

      credit.reminderLastSentAt = now;
      await this.creditRepository.save(credit);

      await this.financeLogRepository.save({
        adminId: null,
        userId: credit.userId,
        creditId: credit.id,
        actionType: CreditActionEnum.REMINDER_SENT,
        description: message,
        metadata: { daysRemaining, hoursRemaining: diffHours, reminderTimerHours: credit.reminderTimerHours },
        actionTime: now,
      } as any);

      this.logger.log(`Reminder sent for credit ${credit.creditCode} to user ${credit.userId}`);
      this.eventEmitter.emit(CreditEvents.REMINDER, {
        userId: credit.userId,
        creditId: credit.id,
        daysRemaining,
      });
    }
  }

  async processExpiredCredits(): Promise<void> {
    const now = new Date();
    const expiredCredits = await this.creditRepository.find({
      where: { status: CreditStatusEnum.ACTIVE, expireAt: LessThan(now) },
      relations: { user: true },
    });

    for (const credit of expiredCredits) {
      await this.dataSource.transaction(async (manager) => {
        credit.status = CreditStatusEnum.EXPIRED;

        // Forced liquidation: repay the loan and sell collateral to cover the
        // shortfall (repayable leverage) before blocking the user.
        const creditWallet = await this.resolveCreditWallet(manager, credit);
        const repayResult = await this.repayAndLiquidate(manager, credit, creditWallet, now);
        await manager.save(credit);

        const wallets = await manager.find(WalletEntity, {
          where: { userId: credit.userId },
          lock: { mode: "pessimistic_write" },
        });

        for (const wallet of wallets) {
          if (wallet.status === WalletStatusEnum.ACTIVE) {
            wallet.status = WalletStatusEnum.FROZEN;
            wallet.frozenAt = now;
            wallet.adminNote = `Frozen due to credit ${credit.creditCode} expiry`;
            await manager.save(wallet);
          }
        }

        await this.logFinanceAction(manager, {
          adminId: null,
          userId: credit.userId,
          creditId: credit.id,
          actionType: CreditActionEnum.EXPIRY_FREEZE_ALL,
          description: `Credit ${credit.creditCode} expired. Repaid ${repayResult.repaid}, liquidated ${repayResult.liquidated}, shortfall ${repayResult.shortfall}. All wallets frozen.`,
          metadata: {
            creditCode: credit.creditCode,
            walletCount: wallets.length,
            repaid: repayResult.repaid,
            liquidated: repayResult.liquidated,
            shortfall: repayResult.shortfall,
          },
        });

        const notification = manager.create(CreditNotificationEntity, {
          userId: credit.userId,
          creditId: credit.id,
          type: CreditNotificationTypeEnum.EXPIRED,
          message: `Credit ${credit.creditCode} has expired. All your wallets have been frozen. ` +
            `Please contact support to settle your credit.`,
          sentAt: now,
        });
        await manager.save(notification);

        this.logger.warn(`Credit ${credit.creditCode} expired, all wallets frozen for user ${credit.userId}`);
      });
      this.eventEmitter.emit(CreditEvents.EXPIRED, {
        userId: credit.userId,
        creditId: credit.id,
        amount: credit.amount,
      });
    }
  }

  @OnEvent(CreditEvents.PRICE_UPDATE, { async: true })
  async handlePriceUpdate(payload: { pricePairId: string; currentPrice: number }): Promise<void> {
    if (!payload?.pricePairId || !payload.currentPrice) return;
    try {
      await this.processMarginCallChecks([{ pricePairId: payload.pricePairId, price: payload.currentPrice }]);
    } catch (error) {
      this.logger.error(
        `Margin check failed for pair ${payload.pricePairId}: ${(error as Error).message}`,
      );
    }
  }

  async processMarginCallChecks(priceUpdates: Array<{ pricePairId: string; price: number }>): Promise<void> {
    for (const update of priceUpdates) {
      const activeCreditOrders = await this.creditOrderRepository.find({
        where: { status: CreditOrderStatusEnum.ACTIVE },
        relations: { credit: true, order: { pricePair: true } },
      });

      for (const co of activeCreditOrders) {
        if (!co.credit.hasCallMargin) continue;
        if (co.order?.pricePairId !== update.pricePairId) continue;
        await this.checkOrderMarginCall(co.id, update.price);
      }
    }
  }

  async settleCredit(adminId: string, creditId: string, description?: string, imagePath?: string): Promise<CreditEntity> {
    const settledCredit = await this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new NotFoundException("Credit not found");
      if (credit.status !== CreditStatusEnum.ACTIVE && credit.status !== CreditStatusEnum.EXPIRED) {
        throw new BadRequestException(`Cannot settle credit with status ${credit.status}`);
      }

      credit.status = CreditStatusEnum.SETTLED;
      credit.settledAt = new Date();
      credit.notes = description || credit.notes;
      credit.settledByAdminId = adminId;
      if (imagePath) {
        credit.settleImagePath = imagePath;
      }
      await manager.save(credit);

      // Repay the loan: take back whatever is left in the credit wallet and
      // liquidate frozen collateral to cover any shortfall (repayable leverage).
      const creditWallet = await this.resolveCreditWallet(manager, credit);
      const repayResult = await this.repayAndLiquidate(manager, credit, creditWallet, new Date());
      await manager.save(credit);

      const wallets = await manager.find(WalletEntity, {
        where: { userId: credit.userId },
      });

      for (const wallet of wallets) {
        let unfrozenAmount = 0;

        if (wallet.status === WalletStatusEnum.FROZEN && wallet.frozenAt) {
          wallet.status = WalletStatusEnum.ACTIVE;
          wallet.frozenAt = null;
          wallet.adminNote = `Unfrozen after credit ${credit.creditCode} settlement`;
          await manager.save(wallet);
        }

        if (wallet.frozenFreeBalance > 0) {
          unfrozenAmount += wallet.frozenFreeBalance;
          wallet.freeBalance = new Decimal(wallet.freeBalance).plus(wallet.frozenFreeBalance).toNumber();
          wallet.frozenFreeBalance = 0;
          await manager.save(wallet);
        }
        if (wallet.frozenLockedBalance > 0) {
          unfrozenAmount += wallet.frozenLockedBalance;
          wallet.frozenLockedBalance = 0;
          await manager.save(wallet);
        }

        if (unfrozenAmount > 0) {
          const unfreezeTxn = manager.create(TransactionEntity, {
            walletId: wallet.id,
            transactionId: crypto.randomUUID(),
            transactionType: TransactionTypeEnum.MATERIAL_UNFREEZE,
            status: TransactionStatusEnum.COMPLETED,
            amount: unfrozenAmount,
            fee: 0,
            description: `Unfrozen after credit ${credit.creditCode} settlement`,
            metadata: { adminId, creditCode: credit.creditCode, creditId: credit.id },
            completedAt: new Date(),
          });
          await manager.save(unfreezeTxn);
        }
      }

      await this.logFinanceAction(manager, {
        adminId,
        userId: credit.userId,
        creditId: credit.id,
        actionType: CreditActionEnum.CREDIT_SETTLED,
        description: description || `Credit ${credit.creditCode} settled`,
        metadata: { creditCode: credit.creditCode, settledAt: credit.settledAt },
      });

      await this.logFinanceAction(manager, {
        adminId,
        userId: credit.userId,
        creditId: credit.id,
        actionType: CreditActionEnum.WALLET_UNFROZEN,
        description: `All wallets unfrozen after credit ${credit.creditCode} settlement`,
        metadata: { walletCount: wallets.length },
      });

      await this.logFinanceAction(manager, {
        adminId,
        userId: credit.userId,
        creditId: credit.id,
        actionType: CreditActionEnum.CREDIT_SETTLED,
        description:
          `Credit ${credit.creditCode} repayment: repaid ${repayResult.repaid}, ` +
          `liquidated ${repayResult.liquidated}, shortfall ${repayResult.shortfall}`,
        metadata: {
          creditCode: credit.creditCode,
          repaid: repayResult.repaid,
          liquidated: repayResult.liquidated,
          shortfall: repayResult.shortfall,
        },
      });

      const notification = manager.create(CreditNotificationEntity, {
        userId: credit.userId,
        creditId: credit.id,
        type: CreditNotificationTypeEnum.SETTLEMENT,
        message: `Credit ${credit.creditCode} has been settled. Your wallets are now active.`,
        sentAt: new Date(),
      });
      await manager.save(notification);

      return credit;
    });

    this.eventEmitter.emit(CreditEvents.SETTLED, {
      userId: settledCredit.userId,
      creditId: settledCredit.id,
    });
    return settledCredit;
  }

  async cancelCredit(adminId: string, creditId: string, reason?: string): Promise<CreditEntity> {
    return await this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new NotFoundException("Credit not found");
      if (credit.status === CreditStatusEnum.SETTLED || credit.status === CreditStatusEnum.CANCELLED) {
        throw new BadRequestException(`Cannot cancel credit with status ${credit.status}`);
      }

      credit.status = CreditStatusEnum.CANCELLED;
      credit.notes = reason || credit.notes;
      await manager.save(credit);

      const wallets = await manager.find(WalletEntity, {
        where: { userId: credit.userId },
      });

      for (const wallet of wallets) {
        let unfrozenAmount = 0;

        if (wallet.status === WalletStatusEnum.FROZEN && wallet.frozenAt) {
          wallet.status = WalletStatusEnum.ACTIVE;
          wallet.frozenAt = null;
          wallet.adminNote = `Unfrozen after credit ${credit.creditCode} cancellation`;
          await manager.save(wallet);
        }

        if (wallet.frozenFreeBalance > 0) {
          unfrozenAmount += wallet.frozenFreeBalance;
          wallet.freeBalance = new Decimal(wallet.freeBalance).plus(wallet.frozenFreeBalance).toNumber();
          wallet.frozenFreeBalance = 0;
          await manager.save(wallet);
        }
        if (wallet.frozenLockedBalance > 0) {
          unfrozenAmount += wallet.frozenLockedBalance;
          wallet.frozenLockedBalance = 0;
          await manager.save(wallet);
        }

        if (unfrozenAmount > 0) {
          const unfreezeTxn = manager.create(TransactionEntity, {
            walletId: wallet.id,
            transactionId: crypto.randomUUID(),
            transactionType: TransactionTypeEnum.MATERIAL_UNFREEZE,
            status: TransactionStatusEnum.COMPLETED,
            amount: unfrozenAmount,
            fee: 0,
            description: `Unfrozen after credit ${credit.creditCode} cancellation`,
            metadata: { adminId, creditCode: credit.creditCode, creditId: credit.id },
            completedAt: new Date(),
          });
          await manager.save(unfreezeTxn);
        }
      }

      await this.logFinanceAction(manager, {
        adminId,
        userId: credit.userId,
        creditId: credit.id,
        actionType: CreditActionEnum.CREDIT_CANCELLED,
        description: reason || `Credit ${credit.creditCode} cancelled`,
        metadata: { creditCode: credit.creditCode, reason },
      });

      return credit;
    });
  }

  async getUserActiveCredit(userId: string): Promise<CreditEntity | null> {
    return await this.creditRepository.findOne({
      where: { userId, status: CreditStatusEnum.ACTIVE },
      relations: { creditOrders: true },
    });
  }

  async getUserCredits(userId: string): Promise<CreditEntity[]> {
    return await this.creditRepository.find({
      where: { userId },
      relations: { creditOrders: { order: true } },
      order: { createAt: "DESC" },
    });
  }

  async getAllCredits(query?: { userId?: string; status?: CreditStatusEnum; search?: string }): Promise<CreditEntity[]> {
    const qb = this.creditRepository.createQueryBuilder("credit")
      .leftJoinAndSelect("credit.user", "user")
      .leftJoinAndSelect("credit.creditOrders", "creditOrders");

    if (query?.userId) {
      qb.andWhere("credit.userId = :userId", { userId: query.userId });
    }
    if (query?.status) {
      qb.andWhere("credit.status = :status", { status: query.status });
    }
    if (query?.search) {
      qb.andWhere("(credit.creditCode ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)", {
        search: `%${query.search}%`,
      });
    }

    return await qb.orderBy("credit.createAt", "DESC").getMany();
  }

  async getUserNotifications(userId: string): Promise<CreditNotificationEntity[]> {
    return await this.creditNotificationRepository.find({
      where: { userId },
      order: { sentAt: "DESC" },
      take: 50,
    });
  }

  async markNotificationRead(id: string, userId: string): Promise<CreditNotificationEntity> {
    const notification = await this.creditNotificationRepository.findOne({ where: { id, userId } });
    if (!notification) throw new NotFoundException("Notification not found");
    notification.isRead = true;
    notification.readAt = new Date();
    return await this.creditNotificationRepository.save(notification);
  }

  private async logFinanceAction(
    manager: any,
    data: {
      adminId: string | null;
      userId?: string;
      creditId?: string;
      walletId?: string;
      orderId?: string;
      actionType: CreditActionEnum;
      description: string;
      metadata?: any;
    },
  ): Promise<void> {
    const log = manager.create(FinanceLogEntity, {
      adminId: data.adminId,
      userId: data.userId,
      creditId: data.creditId,
      walletId: data.walletId,
      orderId: data.orderId,
      actionType: data.actionType,
      description: data.description,
      metadata: data.metadata,
      actionTime: new Date(),
    });
    await manager.save(log);
  }

  // Enforces CREDIT_MAX_AMOUNT and CREDIT_MAX_DURATION_DAYS from the user's level.
  private async enforceCreditLimits(userId: string, amount: number, expireAt: string): Promise<void> {
    const maxAmount = await this.userLevelService.getFeatureValue(userId, "CREDIT_MAX_AMOUNT");
    const maxAmt = typeof maxAmount === "object" ? Number(maxAmount?.amount) : Number(maxAmount);
    if (maxAmt > 0 && Number(amount) > maxAmt) {
      throw new BadRequestException(
        `حداکثر مبلغ اعتبار در سطح شما ${maxAmt.toLocaleString("fa-IR")} ریال است`
      );
    }

    const maxDur = await this.userLevelService.getFeatureValue(userId, "CREDIT_MAX_DURATION_DAYS");
    const maxDays = Number(maxDur);
    if (maxDays > 0 && expireAt) {
      const days = Math.ceil((new Date(expireAt).getTime() - Date.now()) / 86400000);
      if (days > maxDays) {
        throw new BadRequestException(
          `حداکثر مدت اعتبار در سطح شما ${maxDays} روز است`
        );
      }
    }
  }

  // Resolves the wallet that received the credit amount (creditWalletId stored at
  // creation), falling back to the user's RIAL wallet.
  private async resolveCreditWallet(manager: any, credit: CreditEntity): Promise<WalletEntity | null> {
    const creditWalletId = credit.metadata?.creditWalletId;
    if (creditWalletId) {
      const wallet = await manager.findOne(WalletEntity, {
        where: { id: creditWalletId, userId: credit.userId },
      });
      if (wallet) return wallet;
    }
    const rialSymbol = await manager.findOne(SymbolEntity, {
      where: { symbolType: SymbolTypeEnum.RIAL },
    });
    if (!rialSymbol) return null;
    return manager.findOne(WalletEntity, {
      where: { userId: credit.userId, symbolId: rialSymbol.id },
    });
  }

  // Repays a credit loan: takes back what remains in the credit wallet and
  // liquidates frozen material collateral (at current price) to cover shortfall.
  // Idempotent — tracks already-repaid amounts in credit.metadata so expiry and a
  // later settlement don't double-charge the user.
  private async repayAndLiquidate(
    manager: any,
    credit: CreditEntity,
    creditWallet: WalletEntity | null,
    now: Date,
  ): Promise<{ repaid: number; liquidated: number; shortfall: number }> {
    credit.metadata = credit.metadata || {};
    const alreadyRepaid = new Decimal(credit.metadata.repaidAmount || 0);
    let owed = new Decimal(credit.amount).minus(alreadyRepaid);
    let repaid = new Decimal(0);
    let liquidated = new Decimal(0);

    // 1. Repay from the credit wallet's free balance.
    if (creditWallet && owed.greaterThan(0)) {
      const free = new Decimal(creditWallet.freeBalance);
      if (free.greaterThan(0)) {
        const repay = Decimal.min(free, owed);
        creditWallet.freeBalance = free.minus(repay).toNumber();
        creditWallet.adminNote = `Repaid ${repay.toString()} for credit ${credit.creditCode}`;
        await manager.save(creditWallet);
        owed = owed.minus(repay);
        repaid = repaid.plus(repay);

        await this.logFinanceAction(manager, {
          adminId: null,
          userId: credit.userId,
          creditId: credit.id,
          walletId: creditWallet.id,
          actionType: CreditActionEnum.CREDIT_SETTLED,
          description: `Credit ${credit.creditCode} repayment of ${repay.toString()} from wallet`,
          metadata: { repay: repay.toString(), creditCode: credit.creditCode },
        });
      }
    }

    // 2. Liquidate frozen material collateral to cover the remaining shortfall.
    if (owed.greaterThan(0)) {
      const wallets = await manager.find(WalletEntity, {
        where: { userId: credit.userId },
        lock: { mode: "pessimistic_write" },
      });

      for (const wallet of wallets) {
        if (owed.lessThanOrEqualTo(0)) break;
        const frozen = new Decimal(wallet.frozenFreeBalance || 0);
        if (frozen.lessThanOrEqualTo(0)) continue;

        const price = await this.getSymbolRialPrice(manager, wallet.symbolId);
        if (!price || price <= 0) continue;

        const neededUnits = owed.div(price);
        const unitsToLiquidate = Decimal.min(frozen, neededUnits);
        if (unitsToLiquidate.lessThanOrEqualTo(0)) continue;

        const proceeds = unitsToLiquidate.mul(price);
        wallet.frozenFreeBalance = frozen.minus(unitsToLiquidate).toNumber();
        await manager.save(wallet);

        owed = owed.minus(proceeds);
        liquidated = liquidated.plus(unitsToLiquidate);

        await this.logFinanceAction(manager, {
          adminId: null,
          userId: credit.userId,
          creditId: credit.id,
          walletId: wallet.id,
          actionType: CreditActionEnum.LIQUIDATION,
          description: `Liquidated ${unitsToLiquidate.toString()} of collateral to cover credit ${credit.creditCode} repayment`,
          metadata: {
            units: unitsToLiquidate.toString(),
            proceeds: proceeds.toString(),
            symbolId: wallet.symbolId,
          },
        });

        const txn = manager.create(TransactionEntity, {
          walletId: wallet.id,
          transactionId: crypto.randomUUID(),
          transactionType: TransactionTypeEnum.CREDIT_LIQUIDATION,
          status: TransactionStatusEnum.COMPLETED,
          amount: unitsToLiquidate.toNumber(),
          fee: 0,
          description: `Liquidated ${unitsToLiquidate.toString()} collateral for credit ${credit.creditCode}`,
          metadata: { creditCode: credit.creditCode, creditId: credit.id, proceeds: proceeds.toString() },
          completedAt: now,
        });
        await manager.save(txn);
      }
    }

    // 3. Track progress for idempotency and expose any unresolved shortfall.
    const liquidatedAmount = new Decimal(credit.metadata.liquidatedAmount || 0).plus(liquidated);
    credit.metadata.repaidAmount = new Decimal(credit.metadata.repaidAmount || 0).plus(repaid).toNumber();
    credit.metadata.liquidatedAmount = liquidatedAmount.toNumber();
    if (owed.greaterThan(0)) {
      credit.metadata.shortfall = owed.toNumber();
    } else {
      credit.metadata.shortfall = 0;
    }

    return {
      repaid: repaid.toNumber(),
      liquidated: liquidated.toNumber(),
      shortfall: owed.greaterThan(0) ? owed.toNumber() : 0,
    };
  }

  // Rial price per unit of a collateral symbol, from a valid rial-quoted pair
  // (per-gram price). Returns null when no price is available so liquidation can
  // be deferred rather than failing the whole credit.
  private async getSymbolRialPrice(manager: any, symbolId: string): Promise<number | null> {
    const rialSymbol = await manager.findOne(SymbolEntity, {
      where: { symbolType: SymbolTypeEnum.RIAL, isActive: true },
    });
    if (!rialSymbol) return null;
    const pair = await this.pricePairRepository.findOne({
      where: { baseId: symbolId, quoteId: rialSymbol.id, isValid: true },
    });
    if (!pair) return null;
    const price = Number(pair.bestSellGramPrice);
    return price > 0 ? price : null;
  }

  // Freezes every wallet of the user to block further trading (used on margin
  // call). Unblocking happens via admin settle/cancel which restores ACTIVE.
  private async blockUserForMarginCall(userId: string, creditId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const wallets = await manager.find(WalletEntity, {
        where: { userId },
        lock: { mode: "pessimistic_write" },
      });
      const now = new Date();
      for (const wallet of wallets) {
        if (wallet.status === WalletStatusEnum.ACTIVE) {
          wallet.status = WalletStatusEnum.FROZEN;
          wallet.frozenAt = now;
          wallet.adminNote = `Frozen due to margin call on credit ${creditId}`;
          await manager.save(wallet);
        }
      }

      await this.logFinanceAction(manager, {
        adminId: null,
        userId,
        creditId,
        actionType: CreditActionEnum.ALL_WALLETS_FROZEN,
        description: `All wallets frozen due to margin call on credit ${creditId}`,
        metadata: { walletCount: wallets.length },
      });
    });
  }
}
