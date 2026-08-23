import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { Repository, DataSource, LessThan, IsNull, Not } from "typeorm";
import Decimal from "decimal.js";
import { CreditEntity } from "./entity/credit.entity";
import { CreditOrderEntity } from "./entity/credit-order.entity";
import { CreditNotificationEntity } from "./entity/credit-notification.entity";
import { CreditStatusEnum } from "./enum/credit-status.enum";
import { CreditOrderStatusEnum } from "./enum/credit-order-status.enum";
import { CreditNotificationTypeEnum } from "./enum/credit-notification-type.enum";
import { SettlementStateEnum } from "./enum/settlement-state.enum";
import { RiskStateEnum } from "./enum/risk-state.enum";
import { CreditEnforceModeEnum } from "./enum/credit-enforce-mode.enum";
import { CreateCreditDto } from "./dto/create-credit.dto";
import { RequestCreditDto } from "./dto/request-credit.dto";
import { WalletTypeEnum } from "../wallet/enum/wallet-type.enum";
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

      const creditTradingValue = await this.userLevelService.getFeatureValue(dto.userId, "CREDIT_TRADING_ENABLED");
      const creditTradingDisabled =
        creditTradingValue !== null &&
        creditTradingValue !== undefined &&
        (creditTradingValue === false || creditTradingValue?.enabled === false);
      if (creditTradingDisabled) {
        throw new BadRequestException("Credit trading is not enabled for this user's level");
      }

      // Total credit amount = sum of the increase-wallet allocations (falls back
      // to a single dto.amount when no increasedWallets are provided).
      const totalAmount =
        dto.increasedWallets?.length
          ? dto.increasedWallets.reduce((s, w) => s + (w.amount || 0), 0)
          : dto.amount;
      if (totalAmount <= 0) {
        throw new BadRequestException("Credit amount must be greater than zero");
      }

      await this.enforceCreditLimits(dto.userId, totalAmount, dto.expireAt);
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
            where: { userId: dto.userId, symbolId: symbol.id, walletType: WalletTypeEnum.DEPOSIT },
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

      // Determine the wallets that receive the credit amount. Prefer the explicit
      // increasedWallets list; otherwise fall back to a single wallet
      // (creditWalletId, defaulting to the user's RIAL wallet).
      type IncreaseAlloc = {
        wallet: WalletEntity;
        symbolName: string;
        amount: number;
        priceAtCreation: number | null;
      };
      const increaseAllocs: IncreaseAlloc[] = [];

      if (dto.increasedWallets && dto.increasedWallets.length) {
        for (const iw of dto.increasedWallets) {
          if (iw.amount <= 0) continue;
          const wallet = await manager.findOne(WalletEntity, {
            where: { id: iw.walletId, userId: dto.userId },
            lock: { mode: "pessimistic_write" },
          });
          if (!wallet) throw new NotFoundException(`Increase wallet ${iw.walletId} not found for user`);
          if (wallet.status !== WalletStatusEnum.ACTIVE) {
            throw new BadRequestException(`Increase wallet ${iw.walletId} is not active`);
          }
          const sym = await manager.findOne(SymbolEntity, { where: { id: wallet.symbolId } });
          const priceAtCreation = await this.getSymbolRialPrice(manager, wallet.symbolId);
          increaseAllocs.push({
            wallet,
            symbolName: sym?.name || sym?.slug || wallet.symbolId,
            amount: iw.amount,
            priceAtCreation,
          });
        }
      } else {
        // Backwards-compatible single-wallet path.
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
            where: { userId: dto.userId, symbolId: rialSymbol.id, walletType: WalletTypeEnum.DEPOSIT },
            lock: { mode: "pessimistic_write" },
          });
          if (!creditWallet) {
            creditWallet = manager.create(WalletEntity, {
              userId: dto.userId,
              symbolId: rialSymbol.id,
              walletType: WalletTypeEnum.DEPOSIT,
              freeBalance: 0,
              lockedBalance: 0,
              status: WalletStatusEnum.ACTIVE,
            });
          }
          creditSymbolName = rialSymbol.name || "RIAL";
        }
        const priceAtCreation = await this.getSymbolRialPrice(manager, creditWallet.symbolId);
        increaseAllocs.push({
          wallet: creditWallet,
          symbolName: creditSymbolName,
          amount: totalAmount,
          priceAtCreation,
        });
      }

      if (!increaseAllocs.length) {
        throw new BadRequestException("At least one wallet must receive the credit amount");
      }

      const primaryWallet = increaseAllocs[0].wallet;
      const primarySymbolName = increaseAllocs[0].symbolName;
      const increasedMeta = increaseAllocs.map((a) => ({
        walletId: a.wallet.id,
        symbolId: a.wallet.symbolId,
        symbolName: a.symbolName,
        amount: a.amount,
        priceAtCreation: a.priceAtCreation,
      }));

      // Apply the increase to each selected wallet (creditBalance, not freeBalance).
      for (const a of increaseAllocs) {
        a.wallet.creditBalance = new Decimal(a.wallet.creditBalance).plus(a.amount).toNumber();
        a.wallet.freeBalance = new Decimal(a.wallet.availableBalance).plus(a.wallet.creditBalance).toNumber();
        a.wallet.adminNote = `Credit deposit of ${a.amount} ${a.symbolName}`;
        await manager.save(a.wallet);

        const transaction = manager.create(TransactionEntity, {
          walletId: a.wallet.id,
          transactionId: crypto.randomUUID(),
          transactionType: TransactionTypeEnum.CREDIT_DEPOSIT,
          status: TransactionStatusEnum.COMPLETED,
          amount: a.amount,
          fee: 0,
          description: `Credit balance increase of ${a.amount} ${a.symbolName}`,
          metadata: { adminId, creditCode: `CR-${Date.now().toString(36).toUpperCase()}` },
          completedAt: new Date(),
        });
        await manager.save(transaction);
      }

      const creditCode = `CR-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      const credit = manager.create(CreditEntity, {
        userId: dto.userId,
        adminId,
        creditCode,
        amount: totalAmount,
        status: CreditStatusEnum.ACTIVE,
        hasCallMargin: dto.hasCallMargin || false,
        callMarginPercent: dto.callMarginPercent,
        reminderTimerHours: dto.reminderTimerHours || 24,
        maxExecutionTradeLevel: dto.maxExecutionTradeLevel,
        executedTradeLevel: 0,
        maxConcurrentOrders: dto.maxConcurrentOrders,
        maxTradeChainDepth: dto.maxTradeChainDepth,
        currentTradeChainDepth: 0,
        settlementState: SettlementStateEnum.GREEN,
        riskState: RiskStateEnum.NORMAL,
        greenDurationHours: dto.greenDurationHours || 8,
        yellowDurationHours: dto.yellowDurationHours || 4,
        redDurationHours: dto.redDurationHours || 4,
        outstandingShortfall: 0,
        isInDefault: false,
        expireAt: new Date(dto.expireAt),
        activatedAt: new Date(),
        notes: dto.notes,
        metadata: {
          frozenMaterialSymbols: frozenSymbolNames,
          creditWalletId: primaryWallet.id,
          creditSymbol: primarySymbolName,
          increasedWallets: increasedMeta,
        },
      });
      const savedCredit = await manager.save(credit);

      await this.logFinanceAction(manager, {
        adminId,
        userId: dto.userId,
        creditId: savedCredit.id,
        walletId: primaryWallet.id,
        actionType: CreditActionEnum.CREDIT_CREATED,
        description: `Credit created for ${totalAmount} ${primarySymbolName} on wallet, expireAt: ${dto.expireAt}`,
        metadata: {
          creditCode: savedCredit.creditCode,
          amount: totalAmount,
          creditWalletId: primaryWallet.id,
          creditSymbol: primarySymbolName,
          increasedWallets: increasedMeta,
          hasCallMargin: dto.hasCallMargin,
          callMarginPercent: dto.callMarginPercent,
          reminderTimerHours: dto.reminderTimerHours,
          expireAt: dto.expireAt,
        },
      });

      for (const a of increaseAllocs) {
        await this.logFinanceAction(manager, {
          adminId,
          userId: dto.userId,
          creditId: savedCredit.id,
          walletId: a.wallet.id,
          actionType: CreditActionEnum.BALANCE_INCREASED,
          description: `Balance increased by ${a.amount} ${a.symbolName} for credit ${savedCredit.creditCode}`,
          metadata: { amount: a.amount, creditCode: savedCredit.creditCode },
        });
      }

      return savedCredit;
    });
  }

  /**
   * Credit v2 self-service facility: user freezes `amount` from a DEPOSIT
   * wallet into a COLLATERAL wallet, and instantly receives a leveraged credit
   * line in the level's base symbol (IRR) issued into a CREDIT wallet.
   * The facility snapshots the level's risk settings at creation time.
   */
  async requestCredit(userId: string, dto: RequestCreditDto): Promise<CreditEntity> {
    return await this.dataSource.transaction(async (manager) => {
      const user = await manager.findOne(UserEntity, { where: { id: userId } });
      if (!user) throw new NotFoundException("User not found");

      const creditTradingValue = await this.userLevelService.getFeatureValue(userId, "CREDIT_TRADING_ENABLED");
      const creditTradingDisabled =
        creditTradingValue !== null &&
        creditTradingValue !== undefined &&
        (creditTradingValue === false || creditTradingValue?.enabled === false);
      if (creditTradingDisabled) {
        throw new BadRequestException("Credit trading is not enabled for this user's level");
      }

      const level = await this.userLevelService.getUserLevel(userId);
      if (!level?.creditBaseSymbolId) {
        throw new BadRequestException("Your level has no credit facility configured");
      }
      if (level.creditMaxLeverage == null || dto.leverage > Number(level.creditMaxLeverage)) {
        throw new BadRequestException(
          `Leverage exceeds your level maximum (${level.creditMaxLeverage ?? "unavailable"})`,
        );
      }
      if (!(dto.amount > 0)) {
        throw new BadRequestException("Collateral amount must be greater than zero");
      }

      const existingActive = await manager.findOne(CreditEntity, {
        where: { userId, status: CreditStatusEnum.ACTIVE },
      });
      if (existingActive) {
        throw new BadRequestException("User already has an active credit. Settle it first.");
      }

      // Price the collateral symbol against the level base symbol (IRR).
      const depositWallet = await manager.findOne(WalletEntity, {
        where: { id: dto.depositWalletId, userId },
        lock: { mode: "pessimistic_write" },
      });
      if (!depositWallet) throw new NotFoundException("Deposit wallet not found for user");
      if (depositWallet.walletType && depositWallet.walletType !== WalletTypeEnum.DEPOSIT) {
        throw new BadRequestException("Collateral must come from a deposit wallet");
      }
      if (depositWallet.status !== WalletStatusEnum.ACTIVE) {
        throw new BadRequestException("Deposit wallet is not active");
      }

      const available = new Decimal(depositWallet.freeBalance).minus(depositWallet.frozenFreeBalance || 0);
      if (available.lessThan(dto.amount)) {
        throw new BadRequestException("Insufficient free balance in the deposit wallet");
      }

      const collateralPair = await this.pricePairRepository.findOne({
        where: { baseId: depositWallet.symbolId, quoteId: level.creditBaseSymbolId, isValid: true },
      });
      const collateralPrice = collateralPair ? Number(collateralPair.bestSellPrice) : null;
      if (!collateralPair || !collateralPrice || collateralPrice <= 0) {
        // Collateral denominated directly in the base symbol (e.g. IRR cash).
        if (depositWallet.symbolId !== level.creditBaseSymbolId) {
          throw new BadRequestException(
            "No active price pair to value this collateral against the credit base symbol",
          );
        }
      }

      const collateralValue = new Decimal(dto.amount).mul(collateralPrice || 1);
      const creditLimit = collateralValue.mul(dto.leverage);
      await this.enforceCreditLimits(userId, creditLimit.toNumber(), new Date(Date.now() + 3650 * 86400000).toISOString());

      // 1. Freeze: DEPOSIT → COLLATERAL wallet row.
      depositWallet.freeBalance = new Decimal(depositWallet.freeBalance).minus(dto.amount).toNumber();
      await manager.save(depositWallet);

      let collateralWallet = await manager.findOne(WalletEntity, {
        where: { userId, symbolId: depositWallet.symbolId, walletType: WalletTypeEnum.COLLATERAL },
        lock: { mode: "pessimistic_write" },
      });
      if (!collateralWallet) {
        collateralWallet = manager.create(WalletEntity, {
          userId,
          symbolId: depositWallet.symbolId,
          walletType: WalletTypeEnum.COLLATERAL,
          status: WalletStatusEnum.ACTIVE,
          freeBalance: 0,
          lockedBalance: 0,
          availableBalance: 0,
          creditBalance: 0,
          frozenFreeBalance: 0,
          frozenLockedBalance: 0,
        });
      }
      collateralWallet.freeBalance = new Decimal(collateralWallet.freeBalance || 0).plus(dto.amount).toNumber();
      const savedCollateralWallet = await manager.save(collateralWallet);

      const freezeTxn = manager.create(TransactionEntity, {
        walletId: savedCollateralWallet.id,
        transactionId: crypto.randomUUID(),
        transactionType: TransactionTypeEnum.MATERIAL_FREEZE,
        status: TransactionStatusEnum.COMPLETED,
        amount: dto.amount,
        fee: 0,
        description: `Collateral freeze for self-service credit`,
        metadata: { userId, fromWalletId: depositWallet.id, creditAmount: dto.amount },
        completedAt: new Date(),
      });
      await manager.save(freezeTxn);

      // 2. Issue the credit line into a CREDIT wallet row for the base symbol.
      let creditWallet = await manager.findOne(WalletEntity, {
        where: { userId, symbolId: level.creditBaseSymbolId, walletType: WalletTypeEnum.CREDIT },
        lock: { mode: "pessimistic_write" },
      });
      if (!creditWallet) {
        creditWallet = manager.create(WalletEntity, {
          userId,
          symbolId: level.creditBaseSymbolId,
          walletType: WalletTypeEnum.CREDIT,
          status: WalletStatusEnum.ACTIVE,
          freeBalance: 0,
          lockedBalance: 0,
          availableBalance: 0,
          creditBalance: 0,
          frozenFreeBalance: 0,
          frozenLockedBalance: 0,
        });
      }
      creditWallet.creditBalance = new Decimal(creditWallet.creditBalance || 0).plus(creditLimit).toNumber();
      creditWallet.freeBalance = new Decimal(creditWallet.availableBalance || 0).plus(creditWallet.creditBalance).toNumber();
      const savedCreditWallet = await manager.save(creditWallet);

      const issueTxn = manager.create(TransactionEntity, {
        walletId: savedCreditWallet.id,
        transactionId: crypto.randomUUID(),
        transactionType: TransactionTypeEnum.CREDIT_DEPOSIT,
        status: TransactionStatusEnum.COMPLETED,
        amount: creditLimit.toNumber(),
        fee: 0,
        description: `Credit line issued against collateral`,
        metadata: { userId, collateralWalletId: savedCollateralWallet.id, leverage: dto.leverage },
        completedAt: new Date(),
      });
      await manager.save(issueTxn);

      // 3. Facility — ACTIVE immediately, with a snapshot of the level's risk
      // settings so later level changes don't affect open facilities.
      const maxDays = Number(await this.userLevelService.getFeatureValue(userId, "CREDIT_MAX_DURATION_DAYS")) || 30;
      const creditCode = `CR-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      const credit = manager.create(CreditEntity, {
        userId,
        adminId: null,
        creditCode,
        amount: creditLimit.toNumber(),
        status: CreditStatusEnum.ACTIVE,
        expireAt: new Date(Date.now() + maxDays * 86400000),
        activatedAt: new Date(),
        leverage: dto.leverage,
        creditLimit: creditLimit.toNumber(),
        usedCredit: 0,
        collateralSymbolId: depositWallet.symbolId,
        collateralAmount: dto.amount,
        initialCollateralValue: collateralValue.toNumber(),
        currentCollateralValue: collateralValue.toNumber(),
        drawdownPercent: level.creditDrawdownPercent != null ? Number(level.creditDrawdownPercent) : null,
        lastDrawdownPercent: 0,
        creditBaseSymbolId: level.creditBaseSymbolId,
        enforceOnDrawdown: level.creditEnforceOnDrawdown,
        enforceOnExpiry: level.creditEnforceOnExpiry,
        enforceRequestDeadline: level.creditEnforceRequestDeadline,
        metadata: {
          selfService: true,
          collateralWalletId: savedCollateralWallet.id,
          creditWalletId: savedCreditWallet.id,
          depositWalletId: depositWallet.id,
          maxParallelRequests: level.creditMaxParallelRequests,
          maxExecutionLevel: level.creditMaxExecutionLevel,
        },
      });
      const savedCredit = await manager.save(credit);

      const notification = manager.create(CreditNotificationEntity, {
        userId: savedCredit.userId,
        creditId: savedCredit.id,
        type: CreditNotificationTypeEnum.SETTLEMENT,
        message: `Credit ${savedCredit.creditCode} opened with leverage ${dto.leverage}x. Credit limit: ${creditLimit.toFixed(0)}.`,
        isRead: false,
      });
      await manager.save(notification);

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
              where: { userId: order.userId, symbolId: rialSymbol.id, walletType: WalletTypeEnum.DEPOSIT },
              lock: { mode: "pessimistic_write" },
            });
            if (!rialWallet) {
              rialWallet = manager.create(WalletEntity, {
                userId: order.userId,
                symbolId: rialSymbol.id,
                walletType: WalletTypeEnum.DEPOSIT,
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
      // Per-order margin checks (existing open positions).
      const activeCreditOrders = await this.creditOrderRepository.find({
        where: { status: CreditOrderStatusEnum.ACTIVE },
        relations: { credit: true, order: { pricePair: true } },
      });

      for (const co of activeCreditOrders) {
        if (!co.credit.hasCallMargin) continue;
        if (co.order?.pricePairId !== update.pricePairId) continue;
        await this.checkOrderMarginCall(co.id, update.price);
      }

      // Credit-level margin checks: re-value the increase wallets against the
      // rial price captured at creation. If the drawdown passes the threshold
      // while call margin is enabled, liquidate the credit.
      const activeCredits = await this.creditRepository.find({
        where: { status: CreditStatusEnum.ACTIVE },
      });
      for (const credit of activeCredits) {
        if (!credit.hasCallMargin) continue;
        await this.checkIncreaseWalletMarginCall(credit, update.pricePairId, update.price);
      }
    }
  }

  // Re-values the credit's increase wallets against their creation price. When
  // the updated price pair belongs to an increase wallet and the adverse move
  // reaches the call-margin threshold, the credit is force-liquidated.
  private async checkIncreaseWalletMarginCall(
    credit: CreditEntity,
    pricePairId: string,
    currentPrice: number,
  ): Promise<void> {
    const increasedWallets: Array<{ symbolId?: string; priceAtCreation?: number }> =
      credit.metadata?.increasedWallets || [];
    if (!increasedWallets.length) return;

    const rialSymbol = await this.symbolRepository.findOne({
      where: { symbolType: SymbolTypeEnum.RIAL, isActive: true },
    });
    if (!rialSymbol) return;

    for (const iw of increasedWallets) {
      if (!iw.symbolId || !iw.priceAtCreation) continue;
      const pair = await this.pricePairRepository.findOne({
        where: { baseId: iw.symbolId, quoteId: rialSymbol.id, isValid: true },
      });
      if (!pair || pair.id !== pricePairId) continue;

      const saved = new Decimal(iw.priceAtCreation);
      if (saved.equals(0)) continue;
      const drawdown = new Decimal(currentPrice)
        .minus(saved)
        .div(saved)
        .mul(100)
        .abs();
      if (drawdown.greaterThanOrEqualTo(credit.callMarginPercent)) {
        await this.liquidateCreditForMarginCall(credit.id);
        return;
      }
    }
  }

  // Force-liquidates a credit on margin call: repays the loan (claws back the
  // increase-wallet balance and liquidates frozen collateral for any shortfall),
  // cancels open credit orders, blocks the user's wallets and notifies them.
  private async liquidateCreditForMarginCall(creditId: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit || credit.status !== CreditStatusEnum.ACTIVE) return;

      const creditWallet = await this.resolveCreditWallet(manager, credit);
      const liquidation = await this.repayAndLiquidate(
        manager,
        credit,
        creditWallet,
        new Date(),
      );

      const activeOrders = await this.creditOrderRepository.find({
        where: { creditId: credit.id, status: CreditOrderStatusEnum.ACTIVE },
        relations: { order: true },
      });
      for (const co of activeOrders) {
        if (co.order) await this.cancelCreditOrder(co);
      }

      credit.status = CreditStatusEnum.SETTLED;
      credit.settledAt = new Date();
      credit.notes = (credit.notes ? `${credit.notes} ` : "") + "Liquidated on margin call";
      credit.metadata = {
        ...(credit.metadata || {}),
        settleReason: "MARGIN_CALL_LIQUIDATION",
        marginCallLiquidatedAt: new Date().toISOString(),
        liquidation,
      };
      await manager.save(credit);

      await this.blockUserForMarginCall(credit.userId, credit.id, manager);

      await this.logFinanceAction(manager, {
        adminId: null,
        userId: credit.userId,
        creditId: credit.id,
        actionType: CreditActionEnum.LIQUIDATION,
        description: `Credit ${credit.creditCode} liquidated due to margin call`,
        metadata: { reason: "MARGIN_CALL", liquidation },
      });

      await this.creditNotificationRepository.save(
        this.creditNotificationRepository.create({
          userId: credit.userId,
          creditId: credit.id,
          type: CreditNotificationTypeEnum.MARGIN_CALL,
          message:
            `Credit ${credit.creditCode} was liquidated due to a margin call. ` +
            `Your wallets have been frozen. Please contact support.`,
          sentAt: new Date(),
        }),
      );
    });
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
      credit.settlementState = SettlementStateEnum.SETTLED;
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

        // Sync freeBalance = availableBalance + creditBalance + frozenFreeBalance
        wallet.freeBalance = new Decimal(wallet.availableBalance)
          .plus(wallet.creditBalance)
          .plus(wallet.frozenFreeBalance)
          .toNumber();
        await manager.save(wallet);

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
      credit.settlementState = SettlementStateEnum.SETTLED;
      credit.notes = reason || credit.notes;
      await manager.save(credit);

      // Claw back the credited amount from every increase wallet's creditBalance
      // (reverse of the CREDIT_DEPOSIT at creation). Done BEFORE unfreezing
      // collateral so the just-unfrozen balance isn't mistaken for credit funds.
      const increasedWallets: Array<{
        walletId?: string;
        amount?: number;
      }> = credit.metadata?.increasedWallets || [];
      for (const iw of increasedWallets) {
        if (!iw.walletId || !iw.amount || iw.amount <= 0) continue;
        const wallet = await manager.findOne(WalletEntity, {
          where: { id: iw.walletId, userId: credit.userId },
          lock: { mode: "pessimistic_write" },
        });
        if (!wallet || wallet.creditBalance <= 0) continue;

        const clawback = new Decimal(Math.min(wallet.creditBalance, iw.amount));
        wallet.creditBalance = new Decimal(wallet.creditBalance).minus(clawback).toNumber();
        wallet.freeBalance = new Decimal(wallet.availableBalance).plus(wallet.creditBalance).toNumber();
        wallet.adminNote = `Credit ${credit.creditCode} amount clawed back on cancellation`;
        await manager.save(wallet);

        const clawbackTxn = manager.create(TransactionEntity, {
          walletId: wallet.id,
          transactionId: crypto.randomUUID(),
          transactionType: TransactionTypeEnum.CREDIT_WITHDRAWAL,
          status: TransactionStatusEnum.COMPLETED,
          amount: clawback.toNumber(),
          fee: 0,
          description: `Credit ${credit.creditCode} amount of ${clawback.toString()} removed on cancellation`,
          metadata: { adminId, creditCode: credit.creditCode, creditId: credit.id, reason },
          completedAt: new Date(),
        });
        await manager.save(clawbackTxn);

        await this.logFinanceAction(manager, {
          adminId,
          userId: credit.userId,
          creditId: credit.id,
          walletId: wallet.id,
          actionType: CreditActionEnum.CREDIT_CANCELLED,
          description: `Credit ${credit.creditCode} amount of ${clawback.toString()} clawed back on cancellation`,
          metadata: { creditCode: credit.creditCode, clawback: clawback.toNumber(), reason },
        });
      }

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
          wallet.frozenFreeBalance = 0;
          await manager.save(wallet);
        }
        if (wallet.frozenLockedBalance > 0) {
          unfrozenAmount += wallet.frozenLockedBalance;
          wallet.frozenLockedBalance = 0;
          await manager.save(wallet);
        }

        // Sync freeBalance = availableBalance + creditBalance + frozenFreeBalance
        wallet.freeBalance = new Decimal(wallet.availableBalance)
          .plus(wallet.creditBalance)
          .plus(wallet.frozenFreeBalance)
          .toNumber();
        await manager.save(wallet);

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
      where: { userId: credit.userId, symbolId: rialSymbol.id, walletType: WalletTypeEnum.DEPOSIT },
    });
  }

  // Repays a credit loan: takes back what remains in the credit wallet's
  // creditBalance first, then liquidates frozen material collateral (at current
  // price) to cover shortfall. Implements FULL RECOURSE: user remains liable
  // for any shortfall after collateral is exhausted.
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

    // 1. Repay from every increase wallet's creditBalance (the wallets that
    //    received the credit at creation), not just the primary one.
    const increaseWallets: Array<{ walletId?: string; amount?: number }> =
      credit.metadata?.increasedWallets || [];
    const increaseWalletIds = new Set(
      increaseWallets.map((iw) => iw.walletId).filter(Boolean),
    );
    // Backwards-compatible fallback: if no increasedWallets metadata exists,
    // treat the resolved credit wallet as the only increase target.
    if (!increaseWalletIds.size && creditWallet) {
      increaseWalletIds.add(creditWallet.id);
    }

    if (increaseWalletIds.size && owed.greaterThan(0)) {
      for (const walletId of increaseWalletIds) {
        if (owed.lessThanOrEqualTo(0)) break;
        const wallet = await manager.findOne(WalletEntity, {
          where: { id: walletId as string, userId: credit.userId },
          lock: { mode: "pessimistic_write" },
        });
        if (!wallet) continue;
        const creditBal = new Decimal(wallet.creditBalance || 0);
        if (creditBal.lessThanOrEqualTo(0)) continue;
        const repay = Decimal.min(creditBal, owed);
        wallet.creditBalance = creditBal.minus(repay).toNumber();
        wallet.freeBalance = new Decimal(wallet.availableBalance)
          .plus(wallet.creditBalance)
          .toNumber();
        wallet.adminNote = `Repaid ${repay.toString()} for credit ${credit.creditCode}`;
        await manager.save(wallet);
        owed = owed.minus(repay);
        repaid = repaid.plus(repay);

        await this.logFinanceAction(manager, {
          adminId: null,
          userId: credit.userId,
          creditId: credit.id,
          walletId: wallet.id,
          actionType: CreditActionEnum.CREDIT_SETTLED,
          description: `Credit ${credit.creditCode} repayment of ${repay.toString()} from creditBalance`,
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
        wallet.freeBalance = new Decimal(wallet.availableBalance)
          .plus(wallet.creditBalance)
          .plus(wallet.frozenFreeBalance)
          .toNumber();
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

    // 3. Full Recourse: track shortfall (user remains liable)
    const shortfall = owed.greaterThan(0) ? owed.toNumber() : 0;
    if (shortfall > 0) {
      credit.outstandingShortfall = shortfall;
      credit.isInDefault = true;
      credit.riskState = RiskStateEnum.DEFAULT;
      credit.metadata.defaultReason = "INSUFFICIENT_COLLATERAL";
      credit.metadata.defaultAt = now.toISOString();
    } else {
      credit.outstandingShortfall = 0;
      credit.isInDefault = false;
    }

    // 4. Track progress for idempotency and expose any unresolved shortfall.
    const liquidatedAmount = new Decimal(credit.metadata.liquidatedAmount || 0).plus(liquidated);
    credit.metadata.repaidAmount = new Decimal(credit.metadata.repaidAmount || 0).plus(repaid).toNumber();
    credit.metadata.liquidatedAmount = liquidatedAmount.toNumber();
    credit.metadata.shortfall = shortfall;

    return {
      repaid: repaid.toNumber(),
      liquidated: liquidated.toNumber(),
      shortfall,
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
  private async blockUserForMarginCall(
    userId: string,
    creditId: string,
    manager?: any,
  ): Promise<void> {
    const run = async (em: any) => {
      const wallets = await em.find(WalletEntity, {
        where: { userId },
        lock: { mode: "pessimistic_write" },
      });
      const now = new Date();
      for (const wallet of wallets) {
        if (wallet.status === WalletStatusEnum.ACTIVE) {
          wallet.status = WalletStatusEnum.FROZEN;
          wallet.frozenAt = now;
          wallet.adminNote = `Frozen due to margin call on credit ${creditId}`;
          await em.save(wallet);
        }
      }

      await this.logFinanceAction(em, {
        adminId: null,
        userId,
        creditId,
        actionType: CreditActionEnum.ALL_WALLETS_FROZEN,
        description: `All wallets frozen due to margin call on credit ${creditId}`,
        metadata: { walletCount: wallets.length },
      });
    };

    if (manager) {
      await run(manager);
    } else {
      await this.dataSource.transaction(run);
    }
  }

  // Settlement Timer State Machine (handoff Section 20):
  // GREEN = T0 → T+greenDurationHours
  // YELLOW = T+greenDurationHours → T+greenDurationHours+yellowDurationHours
  // RED = T+green+yellow → T+green+yellow+redDurationHours
  // ADMIN_REVIEW = T+green+yellow+red
  async processSettlementTimers(): Promise<void> {
    const activeCredits = await this.creditRepository.find({
      where: { status: CreditStatusEnum.ACTIVE },
    });

    const now = new Date();

    for (const credit of activeCredits) {
      if (!credit.activatedAt) continue;

      const activatedAt = new Date(credit.activatedAt);
      const elapsedMs = now.getTime() - activatedAt.getTime();
      const elapsedHours = elapsedMs / (1000 * 60 * 60);

      const greenHours = credit.greenDurationHours || 8;
      const yellowHours = credit.yellowDurationHours || 4;
      const redHours = credit.redDurationHours || 4;

      const yellowDeadline = greenHours;
      const redDeadline = greenHours + yellowHours;
      const adminReviewDeadline = greenHours + yellowHours + redHours;

      let newState: SettlementStateEnum | null = null;

      if (elapsedHours >= adminReviewDeadline && credit.settlementState !== SettlementStateEnum.ADMIN_REVIEW) {
        newState = SettlementStateEnum.ADMIN_REVIEW;
      } else if (elapsedHours >= redDeadline && credit.settlementState === SettlementStateEnum.YELLOW) {
        newState = SettlementStateEnum.RED;
      } else if (elapsedHours >= yellowDeadline && credit.settlementState === SettlementStateEnum.GREEN) {
        newState = SettlementStateEnum.YELLOW;
      }

      if (newState) {
        credit.settlementState = newState;

        if (newState === SettlementStateEnum.YELLOW && !credit.settlementYellowAt) {
          credit.settlementYellowAt = now;
        } else if (newState === SettlementStateEnum.RED && !credit.settlementRedAt) {
          credit.settlementRedAt = now;
        } else if (newState === SettlementStateEnum.ADMIN_REVIEW && !credit.settlementAdminReviewAt) {
          credit.settlementAdminReviewAt = now;
        }

        await this.creditRepository.save(credit);

        await this.creditNotificationRepository.save(
          this.creditNotificationRepository.create({
            userId: credit.userId,
            creditId: credit.id,
            type: CreditNotificationTypeEnum.SETTLEMENT,
            message:
              `Credit ${credit.creditCode} settlement state changed to ${newState}. ` +
              (newState === SettlementStateEnum.ADMIN_REVIEW
                ? "An admin will review your credit shortly."
                : `Please settle your credit before the deadline.`),
            sentAt: now,
          }),
        );

        this.eventEmitter.emit(CreditEvents.SETTLEMENT_STATE_CHANGED, {
          userId: credit.userId,
          creditId: credit.id,
          previousState: credit.settlementState,
          newState,
        });

        this.logger.log(
          `Credit ${credit.creditCode} settlement state: ${credit.settlementState} → ${newState} ` +
          `(elapsed ${elapsedHours.toFixed(1)}h)`,
        );
      }
    }
  }

  // Risk State Machine (handoff Section 19):
  // Evaluates risk based on collateral value vs credit exposure.
  // NORMAL: Healthy margin ratio
  // WARNING: Margin ratio approaching danger zone
  // MARGIN_CALL: Margin ratio below maintenance threshold
  async processRiskStateTransitions(): Promise<void> {
    const activeCredits = await this.creditRepository.find({
      where: { status: CreditStatusEnum.ACTIVE },
    });

    for (const credit of activeCredits) {
      await this.evaluateRiskState(credit);
    }
  }

  private async evaluateRiskState(credit: CreditEntity): Promise<void> {
    const increasedWallets: Array<{
      walletId?: string;
      symbolId?: string;
      amount?: number;
      priceAtCreation?: number;
    }> = credit.metadata?.increasedWallets || [];

    if (!increasedWallets.length) return;

    // Calculate total collateral value from frozen wallets
    let totalCollateralValue = 0;
    const wallets = await this.walletRepository.find({
      where: { userId: credit.userId },
    });

    for (const wallet of wallets) {
      const frozen = new Decimal(wallet.frozenFreeBalance || 0);
      if (frozen.greaterThan(0)) {
        const price = await this.getSymbolRialPrice(this.dataSource.manager, wallet.symbolId);
        if (price && price > 0) {
          totalCollateralValue += frozen.mul(price).toNumber();
        }
      }
    }

    // Calculate current value of credit exposure (increase wallets)
    let currentExposureValue = 0;
    for (const iw of increasedWallets) {
      if (!iw.symbolId || !iw.amount) continue;
      const currentPrice = await this.getSymbolRialPrice(this.dataSource.manager, iw.symbolId);
      if (currentPrice && currentPrice > 0) {
        currentExposureValue += iw.amount * currentPrice;
      }
    }

    // Calculate equity = collateral value - exposure value (what the user would have left)
    // For a credit system: equity = collateral value - outstanding loan
    const equity = totalCollateralValue - credit.amount;
    
    // Margin ratio = equity / credit amount (as a percentage)
    const marginRatio = credit.amount > 0 ? (equity / credit.amount) * 100 : 0;

    // Risk thresholds (configurable per policy)
    const WARNING_THRESHOLD = 15; // 15% margin ratio
    const MARGIN_CALL_THRESHOLD = 7.5; // 7.5% margin ratio

    let newRiskState: RiskStateEnum | null = null;

    if (marginRatio <= MARGIN_CALL_THRESHOLD && credit.riskState !== RiskStateEnum.MARGIN_CALL) {
      newRiskState = RiskStateEnum.MARGIN_CALL;
    } else if (marginRatio <= WARNING_THRESHOLD && credit.riskState === RiskStateEnum.NORMAL) {
      newRiskState = RiskStateEnum.WARNING;
    } else if (marginRatio > WARNING_THRESHOLD && credit.riskState === RiskStateEnum.WARNING) {
      newRiskState = RiskStateEnum.NORMAL;
    }

    if (newRiskState) {
      const previousState = credit.riskState;
      credit.riskState = newRiskState;

      if (newRiskState === RiskStateEnum.WARNING && !credit.riskWarningAt) {
        credit.riskWarningAt = new Date();
      } else if (newRiskState === RiskStateEnum.MARGIN_CALL && !credit.riskMarginCallAt) {
        credit.riskMarginCallAt = new Date();
      }

      await this.creditRepository.save(credit);

      await this.creditNotificationRepository.save(
        this.creditNotificationRepository.create({
          userId: credit.userId,
          creditId: credit.id,
          type: newRiskState === RiskStateEnum.MARGIN_CALL
            ? CreditNotificationTypeEnum.MARGIN_CALL
            : CreditNotificationTypeEnum.SETTLEMENT,
          message:
            `Credit ${credit.creditCode} risk state changed to ${newRiskState}. ` +
            `Margin ratio: ${marginRatio.toFixed(2)}%. ` +
            (newRiskState === RiskStateEnum.MARGIN_CALL
              ? "Your positions may be liquidated if margin ratio falls further."
              : "Please monitor your positions carefully."),
          sentAt: new Date(),
        }),
      );

      this.eventEmitter.emit(CreditEvents.RISK_STATE_CHANGED, {
        userId: credit.userId,
        creditId: credit.id,
        previousState,
        newState: newRiskState,
        marginRatio,
        equity,
        collateralValue: totalCollateralValue,
      });

      this.logger.log(
        `Credit ${credit.creditCode} risk state: ${previousState} → ${newRiskState} ` +
        `(margin ratio: ${marginRatio.toFixed(2)}%)`,
      );
    }
  }

  // ── Credit v2: drawdown monitoring & self-service settlement ─────────

  /**
   * Re-prices the facility's collateral against the credit base symbol and
   * updates `currentCollateralValue` / `lastDrawdownPercent`. Drawdown is the
   * % loss of the collateral's value vs its value at facility opening.
   * Returns the updated credit (unsaved caller must save, or use the manager).
   */
  async recomputeDrawdown(credit: CreditEntity, manager?: any): Promise<{ credit: CreditEntity; drawdownPercent: number }> {
    const em = manager || this.creditRepository.manager;
    if (!credit.collateralSymbolId || !credit.initialCollateralValue) {
      return { credit, drawdownPercent: Number(credit.lastDrawdownPercent) || 0 };
    }
    let price: number | null = null;
    if (credit.collateralSymbolId === credit.creditBaseSymbolId) {
      price = 1;
    } else {
      const pair = await this.pricePairRepository.findOne({
        where: { baseId: credit.collateralSymbolId, quoteId: credit.creditBaseSymbolId, isValid: true },
      });
      price = pair ? Number(pair.bestSellPrice) : null;
    }
    if (!price || price <= 0) {
      return { credit, drawdownPercent: Number(credit.lastDrawdownPercent) || 0 };
    }
    const currentValue = new Decimal(credit.collateralAmount || 0).mul(price);
    const initial = new Decimal(credit.initialCollateralValue);
    const drawdown = initial.greaterThan(0)
      ? Decimal.max(0, initial.minus(currentValue)).div(initial).mul(100)
      : new Decimal(0);

    credit.currentCollateralValue = currentValue.toNumber();
    credit.lastDrawdownPercent = drawdown.toDecimalPlaces(2).toNumber();
    if (!manager) await this.creditRepository.save(credit);
    return { credit, drawdownPercent: credit.lastDrawdownPercent };
  }

  /**
   * Called from the order path before accepting a new order. ENFORCE mode
   * liquidates the facility; ALERT mode notifies and blocks exposure-increasing
   * (BUY) orders via the returned flag.
   */
  async enforceDrawdownRules(credit: CreditEntity): Promise<{ blockBuy: boolean }> {
    const { credit: fresh, drawdownPercent } = await this.recomputeDrawdown(credit);
    const threshold = fresh.drawdownPercent != null ? Number(fresh.drawdownPercent) : null;
    if (threshold == null || threshold <= 0 || drawdownPercent < threshold) {
      return { blockBuy: false };
    }

    if (fresh.enforceOnDrawdown === CreditEnforceModeEnum.ENFORCE) {
      await this.liquidateForDrawdown(fresh.id, drawdownPercent);
      return { blockBuy: true };
    }

    // ALERT: notify once per threshold crossing and block BUY orders.
    await this.creditNotificationRepository.save(
      this.creditNotificationRepository.create({
        userId: fresh.userId,
        creditId: fresh.id,
        type: CreditNotificationTypeEnum.MARGIN_CALL,
        message:
          `Credit ${fresh.creditCode} drawdown at ${drawdownPercent.toFixed(2)}% ` +
          `(threshold ${threshold}%). Exposure-increasing orders are blocked until recovery.`,
        sentAt: new Date(),
      }),
    );
    return { blockBuy: true };
  }

  /**
   * Drawdown liquidation (ENFORCE mode): cancels open credit orders, claws
   * back remaining credit, converts the collateral back to the DEPOSIT wallet
   * (minus realized shortfall), and settles the facility.
   */
  async liquidateForDrawdown(creditId: string, drawdownPercent?: number): Promise<CreditEntity> {
    return await this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId, status: CreditStatusEnum.ACTIVE },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new BadRequestException("Credit not found or not active");

      // Cancel any still-active credit orders so nothing new settles.
      const openCreditOrders = await manager.find(CreditOrderEntity, {
        where: { creditId: credit.id, status: CreditOrderStatusEnum.ACTIVE },
      });
      for (const co of openCreditOrders) {
        co.status = CreditOrderStatusEnum.CANCELLED;
        await manager.save(co);
      }

      // Claw back remaining credit from the CREDIT wallet.
      const creditWalletId = credit.metadata?.creditWalletId;
      if (creditWalletId) {
        const cw = await manager.findOne(WalletEntity, {
          where: { id: creditWalletId, userId: credit.userId },
          lock: { mode: "pessimistic_write" },
        });
        if (cw) {
          cw.creditBalance = 0;
          cw.freeBalance = new Decimal(cw.availableBalance || 0).toNumber();
          await manager.save(cw);
        }
      }

      // Return the (current-valued) collateral to the DEPOSIT wallet.
      const collateralWalletId = credit.metadata?.collateralWalletId;
      if (collateralWalletId) {
        const colw = await manager.findOne(WalletEntity, {
          where: { id: collateralWalletId, userId: credit.userId },
          lock: { mode: "pessimistic_write" },
        });
        if (colw && Number(colw.freeBalance) > 0) {
          const amount = new Decimal(colw.freeBalance);
          colw.freeBalance = 0;
          await manager.save(colw);

          const depositWallet = await manager.findOne(WalletEntity, {
            where: { userId: credit.userId, symbolId: colw.symbolId, walletType: WalletTypeEnum.DEPOSIT },
            lock: { mode: "pessimistic_write" },
          });
          if (depositWallet) {
            depositWallet.freeBalance = new Decimal(depositWallet.freeBalance).plus(amount).toNumber();
            await manager.save(depositWallet);
            const txn = manager.create(TransactionEntity, {
              walletId: depositWallet.id,
              transactionId: crypto.randomUUID(),
              transactionType: TransactionTypeEnum.CREDIT_LIQUIDATION,
              status: TransactionStatusEnum.COMPLETED,
              amount: amount.toNumber(),
              fee: 0,
              description: `Collateral returned after drawdown liquidation of credit ${credit.creditCode}`,
              metadata: { creditId: credit.id, drawdownPercent: drawdownPercent ?? credit.lastDrawdownPercent },
              completedAt: new Date(),
            });
            await manager.save(txn);
          }
        }
      }

      credit.status = CreditStatusEnum.SETTLED;
      credit.settledAt = new Date();
      credit.metadata = { ...(credit.metadata || {}), settleReason: "DRAWDOWN_LIQUIDATION" };
      const saved = await manager.save(credit);

      await manager.save(
        manager.create(CreditNotificationEntity, {
          userId: credit.userId,
          creditId: credit.id,
          type: CreditNotificationTypeEnum.MARGIN_CALL,
          message:
            `Credit ${credit.creditCode} was liquidated: drawdown reached ` +
            `${(drawdownPercent ?? credit.lastDrawdownPercent).toFixed(2)}% (threshold ${credit.drawdownPercent}%). ` +
            `Remaining collateral was returned to your deposit wallet.`,
          sentAt: new Date(),
        }),
      );

      this.eventEmitter.emit(CreditEvents.SETTLED, {
        userId: credit.userId,
        creditId: credit.id,
        reason: "DRAWDOWN_LIQUIDATION",
      });
      return saved;
    });
  }

  /**
   * User self-settlement (expiry repayment): debits the owed credit from the
   * facility's CREDIT wallet. If the wallet is short, the shortfall must first
   * be deposited (DEPOSIT wallet is used to top up). On full repayment all
   * credit-acquired assets are released: CREDIT wallet balances move to the
   * DEPOSIT wallets and the facility becomes SETTLED.
   */
  async settleFromUser(userId: string, creditId: string): Promise<CreditEntity> {
    return await this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId, userId, status: CreditStatusEnum.ACTIVE },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new BadRequestException("Credit not found or not active");

      // Compute owed amount (credit limit minus already-repaid).
      credit.metadata = credit.metadata || {};
      const alreadyRepaid = new Decimal(credit.metadata.repaidAmount || 0);
      let owed = new Decimal(credit.amount || 0).minus(alreadyRepaid);

      // 1. Repay from the CREDIT wallet's creditBalance.
      const creditWalletId = credit.metadata?.creditWalletId;
      if (creditWalletId && owed.greaterThan(0)) {
        const cw = await manager.findOne(WalletEntity, {
          where: { id: creditWalletId, userId: credit.userId },
          lock: { mode: "pessimistic_write" },
        });
        if (cw && Number(cw.creditBalance) > 0) {
          const repay = Decimal.min(new Decimal(cw.creditBalance), owed);
          cw.creditBalance = new Decimal(cw.creditBalance).minus(repay).toNumber();
          cw.freeBalance = new Decimal(cw.availableBalance || 0).plus(cw.creditBalance).toNumber();
          await manager.save(cw);
          owed = owed.minus(repay);
          credit.metadata.repaidAmount = alreadyRepaid.plus(repay).toNumber();
        }
      }

      // 2. If still short, take from the user's DEPOSIT wallet (same symbol as credit base).
      if (owed.greaterThan(0) && credit.creditBaseSymbolId) {
        const depositWallet = await manager.findOne(WalletEntity, {
          where: { userId: credit.userId, symbolId: credit.creditBaseSymbolId, walletType: WalletTypeEnum.DEPOSIT },
          lock: { mode: "pessimistic_write" },
        });
        if (depositWallet && Number(depositWallet.freeBalance) >= owed.toNumber()) {
          depositWallet.freeBalance = new Decimal(depositWallet.freeBalance).minus(owed).toNumber();
          await manager.save(depositWallet);
          credit.metadata.repaidAmount = new Decimal(credit.metadata.repaidAmount || 0).plus(owed).toNumber();
          owed = new Decimal(0);
        } else if (owed.greaterThan(0)) {
          throw new BadRequestException(
            `Insufficient deposit balance to settle credit. Shortfall: ${owed.toNumber()}`,
          );
        }
      }

      // 3. Release credit-acquired assets: move CREDIT wallet balances to DEPOSIT.
      const creditWallets = await manager.find(WalletEntity, {
        where: { userId: credit.userId, walletType: WalletTypeEnum.CREDIT },
      });
      for (const cw of creditWallets) {
        if (Number(cw.freeBalance) <= 0) continue;
        const depositWallet = await manager.findOne(WalletEntity, {
          where: { userId: credit.userId, symbolId: cw.symbolId, walletType: WalletTypeEnum.DEPOSIT },
          lock: { mode: "pessimistic_write" },
        });
        if (depositWallet) {
          depositWallet.freeBalance = new Decimal(depositWallet.freeBalance).plus(cw.freeBalance).toNumber();
          await manager.save(depositWallet);
        }
        cw.freeBalance = 0;
        cw.creditBalance = 0;
        await manager.save(cw);
      }

      // 4. Return collateral to DEPOSIT.
      const collateralWalletId = credit.metadata?.collateralWalletId;
      if (collateralWalletId) {
        const colw = await manager.findOne(WalletEntity, {
          where: { id: collateralWalletId, userId: credit.userId },
          lock: { mode: "pessimistic_write" },
        });
        if (colw && Number(colw.freeBalance) > 0) {
          const depositWallet = await manager.findOne(WalletEntity, {
            where: { userId: credit.userId, symbolId: colw.symbolId, walletType: WalletTypeEnum.DEPOSIT },
            lock: { mode: "pessimistic_write" },
          });
          if (depositWallet) {
            depositWallet.freeBalance = new Decimal(depositWallet.freeBalance).plus(colw.freeBalance).toNumber();
            await manager.save(depositWallet);
          }
          colw.freeBalance = 0;
          await manager.save(colw);
        }
      }

      credit.status = CreditStatusEnum.SETTLED;
      credit.settledAt = new Date();
      credit.settlementState = SettlementStateEnum.SETTLED;
      credit.metadata = { ...(credit.metadata || {}), settleReason: "USER_SETTLEMENT" };
      const saved = await manager.save(credit);

      await manager.save(
        manager.create(CreditNotificationEntity, {
          userId: credit.userId,
          creditId: credit.id,
          type: CreditNotificationTypeEnum.SETTLEMENT,
          message: `Credit ${credit.creditCode} has been settled. All assets released to your deposit wallet.`,
          sentAt: new Date(),
        }),
      );

      this.eventEmitter.emit(CreditEvents.SETTLED, {
        userId: credit.userId,
        creditId: credit.id,
        reason: "USER_SETTLEMENT",
      });
      return saved;
    });
  }

  async processPendDeadlines(): Promise<void> {
    const now = new Date();

    const pendingOrders = await this.dataSource.manager.find(OrderEntity, {
      where: { isCreditLinked: true },
      relations: { user: true },
    });

    for (const order of pendingOrders) {
      if (!order.pendDeadlineExpireAt) continue;
      const expireAt = new Date(order.pendDeadlineExpireAt);
      const graceEndAt = order.pendDeadlineGraceEndAt ? new Date(order.pendDeadlineGraceEndAt) : null;

      let newState: string | null = null;
      if (graceEndAt && now > graceEndAt) {
        newState = "CLOSED";
      } else if (now > expireAt) {
        newState = "GRACE";
      } else if (order.pendDeadlineWarnAt && now > new Date(order.pendDeadlineWarnAt)) {
        newState = "RED";
      }

      if (newState && newState !== order.pendDeadlineState) {
        order.pendDeadlineState = newState;
        await this.dataSource.manager.save(order);

        if (newState === "CLOSED" && order.status === "PENDING") {
          const credit = await this.dataSource.manager.findOne(CreditEntity, {
            where: { userId: order.userId, status: CreditStatusEnum.ACTIVE },
          });
          if (credit?.enforceRequestDeadline) {
            order.status = "CANCELLED" as any;
            (order as any).cancelledAt = now;
            await this.dataSource.manager.save(order);
            await this.creditNotificationRepository.save(
              this.creditNotificationRepository.create({
                userId: order.userId,
                creditId: credit.id,
                type: CreditNotificationTypeEnum.EXPIRY_WARNING,
                message: `Order ${order.orderCode} was auto-cancelled: pend deadline expired.`,
                sentAt: now,
              }),
            );
          }
        }
      }
    }
  }
}
