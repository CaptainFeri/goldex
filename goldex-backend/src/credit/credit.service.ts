import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EventEmitter2, OnEvent } from "@nestjs/event-emitter";
import { Repository, DataSource, LessThan, IsNull, Not, In } from "typeorm";
import Decimal from "decimal.js";
import { CreditEntity } from "./entity/credit.entity";
import { CreditOrderEntity } from "./entity/credit-order.entity";
import { CreditNotificationEntity } from "./entity/credit-notification.entity";
import { CollateralLockEntity } from "./entity/collateral-lock.entity";
import { CreditStatusEnum } from "./enum/credit-status.enum";
import { CreditOrderStatusEnum } from "./enum/credit-order-status.enum";
import { CollateralLockStatusEnum } from "./enum/collateral-lock-status.enum";
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
import { UserKycEntity } from "../user/entity/user.kyc.entity";
import { KycStatusEnum } from "../baseinfo/enum/kycStatus.enum";
import { OrderEntity } from "../order/order.entity";
import { OrderStatusEnum } from "../order/enum/order.status.enum";
import { FinanceLogEntity } from "../finance-log/entity/finance-log.entity";
import { CreditActionEnum } from "./enum/credit-action.enum";
import { WalletStatusEnum } from "../wallet/enum/wallet-status.enum";
import { WalletOrderService } from "../wallet/services/wallet-order.service";
import { CreditSettlementService, SettlementState } from "./settlement/credit-settlement.service";
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
    @InjectRepository(CollateralLockEntity)
    private collateralLockRepository: Repository<CollateralLockEntity>,
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
    @InjectRepository(UserKycEntity)
    private userKycRepository: Repository<UserKycEntity>,
    @InjectRepository(FinanceLogEntity)
    private financeLogRepository: Repository<FinanceLogEntity>,
    private dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly userLevelService: UserLevelService,
    private readonly walletOrderService: WalletOrderService,
    private readonly settlementService: CreditSettlementService,
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

      await this.enforceCreditLimits(dto.userId, totalAmount);
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
        maxCreditNotional: dto.maxCreditNotional,
        maxTotalLockedCollateral: dto.maxTotalLockedCollateral,
        settlementState: SettlementStateEnum.GREEN,
        riskState: RiskStateEnum.NORMAL,
        greenDurationHours: dto.greenDurationHours || 8,
        yellowDurationHours: dto.yellowDurationHours || 4,
        redDurationHours: dto.redDurationHours || 4,
        outstandingShortfall: 0,
        isInDefault: false,
        expireAt: dto.expireAt ? new Date(dto.expireAt) : new Date('2099-12-31T23:59:59.999Z'),
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

      // KYC is required only if the user's level is configured to require it.
      const requireKyc = level.creditRequireKyc !== false;
      if (requireKyc) {
        const kyc = await manager.findOne(UserKycEntity, { where: { userId } });
        if (!kyc || kyc.status !== KycStatusEnum.APPROVED) {
          throw new BadRequestException("KYC approval is required to open a credit facility");
        }
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

      // Collateral must be a BASE or QUOTE symbol of one of the level's price
      // pairs (e.g. XAU/IRR → XAU or IRR, XAU/USD → XAU or USD, USD/IRR → USD
      // or IRR). Users can freeze either leg of their trading pairs. The credit
      // base symbol is always allowed.
      const levelPairSymbolIds = new Set(
        (level.pairs || []).flatMap((p: any) => [
          p.baseId || p.baseSymbol?.id,
          p.quoteId || p.quoteSymbol?.id,
        ]).filter(Boolean),
      );
      if (level.creditBaseSymbolId) levelPairSymbolIds.add(level.creditBaseSymbolId);
      if (
        levelPairSymbolIds.size > 0 &&
        !levelPairSymbolIds.has(depositWallet.symbolId)
      ) {
        throw new BadRequestException(
          "Collateral must be a base or quote symbol of your level's trading pairs",
        );
      }

      const available = new Decimal(depositWallet.freeBalance).minus(depositWallet.frozenFreeBalance || 0);
      if (available.lessThan(dto.amount)) {
        throw new BadRequestException("Insufficient free balance in the deposit wallet");
      }

      const collateralPair = await this.pricePairRepository.findOne({
        where: { baseId: depositWallet.symbolId, quoteId: level.creditBaseSymbolId, isValid: true },
      });
      const collateralPrice = collateralPair ? Number(collateralPair.bestSellGramPrice) : null;
      if (!collateralPair || !collateralPrice || collateralPrice <= 0) {
        // Collateral denominated directly in the base symbol (e.g. IRR cash).
        if (depositWallet.symbolId !== level.creditBaseSymbolId) {
          throw new BadRequestException(
            "No active price pair to value this collateral against the credit base symbol",
          );
        }
      }

      // Enforce the level's max credit amount against the projected credit
      // limit (collateral × price × leverage), and cap the facility duration.
      const maxAmount = await this.userLevelService.getFeatureValue(userId, "CREDIT_MAX_AMOUNT");
      const maxAmt = typeof maxAmount === "object" ? Number(maxAmount?.amount) : Number(maxAmount);
      const unitPrice =
        depositWallet.symbolId === level.creditBaseSymbolId ? 1 : collateralPrice || 0;
      const projectedCredit =
        unitPrice > 0 ? new Decimal(dto.amount).mul(unitPrice).mul(dto.leverage).toNumber() : 0;
      if (maxAmt > 0 && projectedCredit > maxAmt) {
        throw new BadRequestException(
          `حداکثر مبلغ اعتبار در سطح شما ${maxAmt.toLocaleString("fa-IR")} ریال است`,
        );
      }

      // Don't calculate credit amount yet - it will be calculated when user creates first order
      // using the current pair price at that moment
      const maxDuration = await this.userLevelService.getFeatureValue(userId, "CREDIT_MAX_DURATION_DAYS");
      const maxDays = typeof maxDuration === "object"
        ? Number(maxDuration?.days ?? maxDuration?.amount)
        : Number(maxDuration);
      const expireAt =
        maxDays > 0
          ? new Date(Date.now() + maxDays * 24 * 60 * 60 * 1000)
          : new Date('2099-12-31T23:59:59.999Z');

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
        metadata: { userId, fromWalletId: depositWallet.id, collateralAmount: dto.amount },
        completedAt: new Date(),
      });
      await manager.save(freezeTxn);

      // 2. Create facility and ISSUE the credit immediately at creation.
      //    Initial collateral value = frozen amount × current price
      //    (e.g. 50g XAU × 10 IRR = 500 IRR) — the drawdown baseline.
      const creditCode = `CR-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      const initialCollateralValue =
        depositWallet.symbolId === level.creditBaseSymbolId
          ? dto.amount
          : collateralPrice
            ? new Decimal(dto.amount).mul(collateralPrice).toNumber()
            : 0;
      // Capacity: BUY = collateral value × leverage (IRR), SELL = frozen
      // amount × leverage in the base symbol (e.g. XAU).
      const collateralValue = new Decimal(dto.amount).mul(unitPrice);
      const creditLimit = collateralValue.mul(dto.leverage || 1);
      const sellCreditAmount = new Decimal(dto.amount).mul(dto.leverage || 1);

      const credit = manager.create(CreditEntity, {
        userId,
        adminId: null,
        creditCode,
        amount: creditLimit.toNumber(),
        status: CreditStatusEnum.ACTIVE,
        expireAt,
        activatedAt: new Date(),
        leverage: dto.leverage,
        creditLimit: creditLimit.toNumber(),
        usedCredit: 0,
        collateralSymbolId: depositWallet.symbolId,
        collateralAmount: dto.amount,
        initialCollateralValue,
        currentCollateralValue: initialCollateralValue,
        drawdownPercent: level.creditDrawdownPercent != null ? Number(level.creditDrawdownPercent) : null,
        lastDrawdownPercent: 0,
        creditBaseSymbolId: level.creditBaseSymbolId,
        enforceOnDrawdown: level.creditEnforceOnDrawdown,
        enforceOnExpiry: level.creditEnforceOnExpiry,
        enforceRequestDeadline: level.creditEnforceRequestDeadline,
        maxCreditNotional:
          level.creditMaxNotional != null ? Number(level.creditMaxNotional) : null,
        maxTotalLockedCollateral:
          level.creditMaxLockedCollateral != null ? Number(level.creditMaxLockedCollateral) : null,
        metadata: {
          selfService: true,
          collateralWalletId: savedCollateralWallet.id,
          depositWalletId: depositWallet.id,
          maxParallelRequests: level.creditMaxParallelRequests,
          maxExecutionLevel: level.creditMaxExecutionLevel,
          creditConfigs: level.creditConfigs || {},
        },
      });
      const savedCredit = await manager.save(credit);

      // ── Issue the CREDIT wallets (BUY = IRR creditLimit, SELL = base capacity) ──
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
      await manager.save(
        manager.create(TransactionEntity, {
          walletId: savedCreditWallet.id,
          transactionId: crypto.randomUUID(),
          transactionType: TransactionTypeEnum.CREDIT_DEPOSIT,
          status: TransactionStatusEnum.COMPLETED,
          amount: creditLimit.toNumber(),
          fee: 0,
          description: `Credit line issued on credit creation`,
          metadata: { creditId: credit.id, leverage: credit.leverage, collateralPrice: unitPrice },
          completedAt: new Date(),
        }),
      );

      let sellCreditWalletId: string | null = null;
      if (sellCreditAmount.greaterThan(0)) {
        let baseCreditWallet = await manager.findOne(WalletEntity, {
          where: { userId, symbolId: credit.collateralSymbolId, walletType: WalletTypeEnum.CREDIT },
          lock: { mode: "pessimistic_write" },
        });
        if (!baseCreditWallet) {
          baseCreditWallet = manager.create(WalletEntity, {
            userId,
            symbolId: credit.collateralSymbolId,
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
        baseCreditWallet.creditBalance = new Decimal(baseCreditWallet.creditBalance || 0).plus(sellCreditAmount).toNumber();
        baseCreditWallet.freeBalance = new Decimal(baseCreditWallet.availableBalance || 0).plus(baseCreditWallet.creditBalance).toNumber();
        const savedBaseWallet = await manager.save(baseCreditWallet);
        sellCreditWalletId = savedBaseWallet.id;
        await manager.save(
          manager.create(TransactionEntity, {
            walletId: savedBaseWallet.id,
            transactionId: crypto.randomUUID(),
            transactionType: TransactionTypeEnum.CREDIT_DEPOSIT,
            status: TransactionStatusEnum.COMPLETED,
            amount: sellCreditAmount.toNumber(),
            fee: 0,
            description: `Credit sell capacity issued on credit creation`,
            metadata: { creditId: credit.id, leverage: credit.leverage, symbolId: credit.collateralSymbolId },
            completedAt: new Date(),
          }),
        );
      }

      savedCredit.metadata = {
        ...(savedCredit.metadata || {}),
        creditWalletId: savedCreditWallet.id,
        sellCreditWalletId,
        sellCreditAmount: sellCreditAmount.toNumber(),
        sellCreditSymbolId: credit.collateralSymbolId,
        creditCalculatedAt: new Date().toISOString(),
        collateralPriceAtCalculation: unitPrice,
      };
      await manager.save(savedCredit);

      const notification = manager.create(CreditNotificationEntity, {
        userId: savedCredit.userId,
        creditId: savedCredit.id,
        type: CreditNotificationTypeEnum.SETTLEMENT,
        message:
          `Credit ${savedCredit.creditCode} opened with leverage ${dto.leverage}x. ` +
          `Credit limit ${creditLimit.toFixed(0)} ${level.creditBaseSymbolId}.`,
        isRead: false,
      });
      await manager.save(notification);

      return savedCredit;
    });
  }

  /**
   * Idempotently guarantees the credit SELL capacity wallet (base/collateral
   * symbol, e.g. XAU) holds the leveraged sell capacity
   * `collateralAmount × leverage`. This is a safety net for when the sell
   * capacity wallet is missing or empty — without it, credit SELL orders fail
   * with INSUFFICIENT_BALANCE.
   */
  async ensureSellCreditCapacity(creditId: string): Promise<number> {
    return await this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId, status: CreditStatusEnum.ACTIVE },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new BadRequestException("Credit not found or not active");
      // Legacy admin credits (no collateral/leverage snapshot) have no sell capacity.
      if (!credit.collateralSymbolId || !credit.leverage) return 0;

      const expected = new Decimal(credit.collateralAmount || 0).mul(credit.leverage || 1);
      if (!expected.greaterThan(0)) return 0;

      let wallet = await manager.findOne(WalletEntity, {
        where: { userId: credit.userId, symbolId: credit.collateralSymbolId, walletType: WalletTypeEnum.CREDIT },
        lock: { mode: "pessimistic_write" },
      });
      if (!wallet) {
        wallet = manager.create(WalletEntity, {
          userId: credit.userId,
          symbolId: credit.collateralSymbolId,
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

      const current = new Decimal(Number(wallet.creditBalance) || 0);
      if (current.greaterThanOrEqualTo(expected)) {
        // Already at capacity. Never reset freeBalance — it reflects the
        // remaining sell capacity (consumed by frozen/completed sells), so
        // prior sells must keep reducing it.
        return current.toNumber();
      }

      // Top up only the deficit so the wallet reaches the leveraged capacity.
      const topUp = expected.minus(current);
      wallet.creditBalance = expected.toNumber();
      wallet.freeBalance = new Decimal(Number(wallet.freeBalance) || 0).plus(topUp).toNumber();
      const saved = await manager.save(wallet);

      await manager.save(
        manager.create(TransactionEntity, {
          walletId: saved.id,
          transactionId: crypto.randomUUID(),
          transactionType: TransactionTypeEnum.CREDIT_DEPOSIT,
          status: TransactionStatusEnum.COMPLETED,
          amount: topUp.toNumber(),
          fee: 0,
          description: `Credit sell capacity ensured (+${topUp.toString()})`,
          metadata: { creditId: credit.id, symbolId: credit.collateralSymbolId, expected: expected.toString() },
          completedAt: new Date(),
        }),
      );

      return expected.toNumber();
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
      // ALERT mode: notify the user but leave the facility open for manual
      // settlement (the admin decides).
      if (credit.enforceOnExpiry === CreditEnforceModeEnum.ALERT) {
        await this.creditNotificationRepository.save(
          this.creditNotificationRepository.create({
            userId: credit.userId,
            creditId: credit.id,
            type: CreditNotificationTypeEnum.EXPIRED,
            message:
              `Credit ${credit.creditCode} has expired. Please settle it or contact support.`,
            sentAt: now,
          }),
        );
        this.eventEmitter.emit(CreditEvents.EXPIRED, {
          userId: credit.userId,
          creditId: credit.id,
          amount: credit.amount,
        });
        continue;
      }

      // ENFORCE (or default): force-liquidate at the current mark price. The
      // settlement engine consumes collateral for any deficit and returns the
      // remainder, so we restore the wallets afterwards instead of freezing them
      // (a frozen SETTLED credit would have no recovery path).
      try {
        await this.settlementService.liquidate(credit.id, "EXPIRY_LIQUIDATION");
      } catch (err) {
        this.logger.error(
          `Expiry liquidation failed for credit ${credit.creditCode}: ${(err as Error).message}`,
        );
        continue;
      }

      await this.unfreezeWalletsAfterSettlement(credit.userId, credit.creditCode);

      await this.creditNotificationRepository.save(
        this.creditNotificationRepository.create({
          userId: credit.userId,
          creditId: credit.id,
          type: CreditNotificationTypeEnum.EXPIRED,
          message:
            `Credit ${credit.creditCode} has expired and was liquidated. ` +
            `Any remaining collateral has been returned to your deposit wallet.`,
          sentAt: now,
        }),
      );

      this.logger.warn(`Credit ${credit.creditCode} expired and was liquidated for user ${credit.userId}`);

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
      // The increase wallet holds a LONG position in its symbol, so the adverse
      // move is a price decline (saved → current). Trigger the margin call only
      // on a loss, not on a favourable price rise.
      const loss = new Decimal(saved).minus(currentPrice).div(saved).mul(100);
      if (loss.greaterThanOrEqualTo(credit.callMarginPercent)) {
        await this.liquidateCreditForMarginCall(credit.id);
        return;
      }
    }
  }

  // Force-liquidates a credit on margin call: repays the loan (claws back the
  // increase-wallet balance and liquidates frozen collateral for any shortfall),
  // cancels open credit orders, blocks the user's wallets and notifies them.
  private async liquidateCreditForMarginCall(creditId: string): Promise<void> {
    const credit = await this.creditRepository.findOne({
      where: { id: creditId, status: CreditStatusEnum.ACTIVE },
    });
    if (!credit) return;

    await this.settlementService.liquidate(creditId, "MARGIN_CALL_LIQUIDATION", {
      notes: "Liquidated on margin call",
    });

    // Liquidation already marks the credit SETTLED, so freezing the wallets here
    // would leave them permanently blocked (admin settle/reactivate can no longer
    // act on a settled credit). Restore them instead — any deficit was already
    // covered from the collateral by the settlement engine.
    await this.unfreezeWalletsAfterSettlement(credit.userId, credit.creditCode);

    await this.creditNotificationRepository.save(
      this.creditNotificationRepository.create({
        userId: credit.userId,
        creditId,
        type: CreditNotificationTypeEnum.MARGIN_CALL,
        message:
          `Credit ${credit.creditCode} was liquidated due to a margin call. ` +
          `Any remaining collateral has been returned to your deposit wallet.`,
        sentAt: new Date(),
      }),
    );
  }

  async settleCredit(
    adminId: string,
    creditId: string,
    description?: string,
    imagePath?: string,
    force?: boolean,
  ): Promise<CreditEntity> {
    // Financial settlement is performed by the settlement engine (idempotent,
    // atomic). It values the actual borrowed/held position at the mark price,
    // releases surplus and consumes collateral for any deficit. Voluntary
    // settlement is gated on the facility's credit wallets netting to zero or
    // positive after collateral (no outstanding shortfall) — `force` is an
    // explicit, audited override for the rare case an admin must settle a
    // facility left in default anyway.
    const settledCredit = await this.settlementService.settleCredit(creditId, {
      mode: "ADMIN",
      adminId,
      notes: description,
      imagePath,
      reason: "ADMIN_SETTLEMENT",
      force,
    });

    // Restore the user's wallets (unfreeze + release any frozen collateral).
    await this.unfreezeWalletsAfterSettlement(settledCredit.userId, settledCredit.creditCode, adminId);

    this.eventEmitter.emit(CreditEvents.SETTLED, {
      userId: settledCredit.userId,
      creditId: settledCredit.id,
      reason: "ADMIN_SETTLEMENT",
    });
    return settledCredit;
  }

  /**
   * Admin-initiated forced liquidation. Delegates to the settlement engine
   * (cash-settles at mark price, consumes collateral for any deficit) and then
   * restores the user's wallets.
   */
  async forceLiquidateCredit(adminId: string, creditId: string, reason?: string): Promise<CreditEntity> {
    const settledCredit = await this.settlementService.liquidate(creditId, "ADMIN_FORCE_LIQUIDATION", {
      adminId,
      notes: reason,
    });

    await this.unfreezeWalletsAfterSettlement(settledCredit.userId, settledCredit.creditCode, adminId);

    this.eventEmitter.emit(CreditEvents.SETTLED, {
      userId: settledCredit.userId,
      creditId: settledCredit.id,
      reason: "ADMIN_FORCE_LIQUIDATION",
    });
    return settledCredit;
  }

  private async unfreezeWalletsAfterSettlement(userId: string, creditCode: string, adminId?: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const wallets = await manager.find(WalletEntity, {
        where: { userId },
        lock: { mode: "pessimistic_write" },
      });

      for (const wallet of wallets) {
        let unfrozenAmount = 0;

        if (wallet.status === WalletStatusEnum.FROZEN && wallet.frozenAt) {
          wallet.status = WalletStatusEnum.ACTIVE;
          wallet.frozenAt = null;
          wallet.adminNote = `Unfrozen after credit ${creditCode} settlement`;
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
          wallet.lockedBalance = new Decimal(wallet.lockedBalance).plus(wallet.frozenLockedBalance).toNumber();
          wallet.frozenLockedBalance = 0;
          await manager.save(wallet);
        }

        // freeBalance already reflects the restored frozen funds above. Do NOT
        // recompute it from availableBalance (a column that is never maintained
        // and is always 0) — that would wipe the user's real balance.

        if (unfrozenAmount > 0) {
          const unfreezeTxn = manager.create(TransactionEntity, {
            walletId: wallet.id,
            transactionId: crypto.randomUUID(),
            transactionType: TransactionTypeEnum.MATERIAL_UNFREEZE,
            status: TransactionStatusEnum.COMPLETED,
            amount: unfrozenAmount,
            fee: 0,
            description: `Unfrozen after credit ${creditCode} settlement`,
            metadata: { adminId: adminId ?? null, creditCode, creditId: null },
            completedAt: new Date(),
          });
          await manager.save(unfreezeTxn);
        }
      }

      await this.logFinanceAction(manager, {
        adminId: adminId ?? null,
        userId,
        actionType: CreditActionEnum.WALLET_UNFROZEN,
        description: `All wallets unfrozen after credit ${creditCode} settlement`,
        metadata: { walletCount: wallets.length },
      });
    });
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

      // A facility with open or executed trades cannot be cancelled safely — the
      // borrowed position must go through settlement instead.
      const openOrders = await manager.count(CreditOrderEntity, {
        where: { creditId: credit.id, status: Not(CreditOrderStatusEnum.CANCELLED) },
      });
      if (openOrders > 0) {
        throw new BadRequestException(
          "Credit has open or completed trades. Settle it instead of cancelling.",
        );
      }

      credit.status = CreditStatusEnum.CANCELLED;
      credit.settlementState = SettlementStateEnum.SETTLED;
      credit.notes = reason || credit.notes;
      await manager.save(credit);

      // v2 self-service credits: void the credit line (CREDIT wallets) and return
      // the frozen collateral (COLLATERAL wallet) to the deposit wallet.
      if (credit.collateralSymbolId && credit.creditBaseSymbolId && credit.leverage) {
        await this.voidV2CreditOnCancel(manager, credit, adminId, reason);
      }

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
          wallet.freeBalance = new Decimal(wallet.freeBalance).plus(wallet.frozenFreeBalance).toNumber();
          wallet.frozenFreeBalance = 0;
          await manager.save(wallet);
        }
        if (wallet.frozenLockedBalance > 0) {
          unfrozenAmount += wallet.frozenLockedBalance;
          wallet.lockedBalance = new Decimal(wallet.lockedBalance).plus(wallet.frozenLockedBalance).toNumber();
          wallet.frozenLockedBalance = 0;
          await manager.save(wallet);
        }

        // freeBalance already reflects the restored frozen funds above. Do NOT
        // recompute it from availableBalance (a column that is never maintained
        // and is always 0) — that would wipe the user's real balance.

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

  // Voids the v2 self-service credit line (CREDIT wallets) and returns the frozen
  // collateral (COLLATERAL wallet) back to the user's DEPOSIT wallet. Used when
  // cancelling a leverage-based credit that has no executed trades.
  private async voidV2CreditOnCancel(
    manager: any,
    credit: CreditEntity,
    adminId: string,
    reason?: string,
  ): Promise<void> {
    // Void the credit line: zero the base-symbol and sell-capacity CREDIT wallets.
    const creditWallets = await manager.find(WalletEntity, {
      where: { userId: credit.userId, walletType: WalletTypeEnum.CREDIT },
      lock: { mode: "pessimistic_write" },
    });
    for (const cw of creditWallets) {
      const voided = new Decimal(cw.creditBalance || 0)
        .plus(cw.freeBalance || 0)
        .plus(cw.lockedBalance || 0);
      if (voided.lessThanOrEqualTo(0)) continue;
      cw.creditBalance = 0;
      cw.freeBalance = 0;
      cw.lockedBalance = 0;
      await manager.save(cw);
      await manager.save(
        manager.create(TransactionEntity, {
          walletId: cw.id,
          transactionId: crypto.randomUUID(),
          transactionType: TransactionTypeEnum.CREDIT_WITHDRAWAL,
          status: TransactionStatusEnum.COMPLETED,
          amount: voided.toNumber(),
          fee: 0,
          description: `Credit ${credit.creditCode} line of ${voided.toString()} voided on cancellation`,
          metadata: { adminId, creditCode: credit.creditCode, creditId: credit.id, reason },
          completedAt: new Date(),
        }),
      );
    }

    // Return the frozen collateral to the user's DEPOSIT wallet.
    let collateralWallet: WalletEntity | null = null;
    if (credit.metadata?.collateralWalletId) {
      collateralWallet = await manager.findOne(WalletEntity, {
        where: { id: credit.metadata.collateralWalletId, userId: credit.userId },
        lock: { mode: "pessimistic_write" },
      });
    }
    if (!collateralWallet && credit.collateralSymbolId) {
      collateralWallet = await manager.findOne(WalletEntity, {
        where: {
          userId: credit.userId,
          symbolId: credit.collateralSymbolId,
          walletType: WalletTypeEnum.COLLATERAL,
        },
        lock: { mode: "pessimistic_write" },
      });
    }
    if (!collateralWallet || new Decimal(collateralWallet.freeBalance || 0).lessThanOrEqualTo(0)) {
      return;
    }

    const returned = new Decimal(collateralWallet.freeBalance || 0);
    let depositWallet = await manager.findOne(WalletEntity, {
      where: {
        userId: credit.userId,
        symbolId: credit.collateralSymbolId,
        walletType: WalletTypeEnum.DEPOSIT,
      },
      lock: { mode: "pessimistic_write" },
    });
    if (!depositWallet) {
      depositWallet = manager.create(WalletEntity, {
        userId: credit.userId,
        symbolId: credit.collateralSymbolId,
        walletType: WalletTypeEnum.DEPOSIT,
        status: WalletStatusEnum.ACTIVE,
        freeBalance: 0,
        lockedBalance: 0,
        availableBalance: 0,
        creditBalance: 0,
        frozenFreeBalance: 0,
        frozenLockedBalance: 0,
      });
    }
    depositWallet.freeBalance = new Decimal(depositWallet.freeBalance || 0).plus(returned).toNumber();
    await manager.save(depositWallet);
    collateralWallet.freeBalance = 0;
    await manager.save(collateralWallet);

    await manager.save(
      manager.create(TransactionEntity, {
        walletId: depositWallet.id,
        transactionId: crypto.randomUUID(),
        transactionType: TransactionTypeEnum.MATERIAL_UNFREEZE,
        status: TransactionStatusEnum.COMPLETED,
        amount: returned.toNumber(),
        fee: 0,
        description: `Collateral of ${returned.toString()} returned after credit ${credit.creditCode} cancellation`,
        metadata: { adminId, creditCode: credit.creditCode, creditId: credit.id, reason },
        completedAt: new Date(),
      }),
    );

    await this.logFinanceAction(manager, {
      adminId,
      userId: credit.userId,
      creditId: credit.id,
      walletId: depositWallet.id,
      actionType: CreditActionEnum.CREDIT_CANCELLED,
      description: `Collateral of ${returned.toString()} returned after credit ${credit.creditCode} cancellation`,
      metadata: { creditCode: credit.creditCode, returned: returned.toNumber(), reason },
    });
  }

  async getUserActiveCredit(userId: string): Promise<CreditEntity | null> {
    return await this.creditRepository.findOne({
      where: { userId, status: CreditStatusEnum.ACTIVE },
      relations: { creditOrders: true },
    });
  }

  /**
   * Sum the IRR value of all COMPLETED credit-linked orders. This is the
   * facility's "used credit" per the product rule:
   *   available = creditLimit (credit created at price) − all orders completed
   * Pending orders are not included here — their amount is locked by the wallet
   * freeze (freeBalance → lockedBalance), which reduces the available wallet
   * capacity independently.
   */
  async computeUsedCredit(creditId: string): Promise<number> {
    const rows = await this.creditOrderRepository.find({
      where: { creditId },
      relations: { order: true },
    });
    let total = new Decimal(0);
    for (const co of rows) {
      const o = co.order;
      if (!o) continue;
      if (o.status !== "COMPLETED") continue;
      const price = Number(o.price) || Number(co.priceAtOrderTime) || 0;
      const qty = Number(o.executedQuantity) > 0 ? Number(o.executedQuantity) : Number(o.quantity || 0);
      total = total.plus(new Decimal(qty).mul(price));
    }
    return total.toNumber();
  }

  /**
   * Sum the completed-order IRR usage across a set of credits in a single query
   * (used by the admin dashboard stats to avoid N+1 computeUsedCredit calls).
   */
  private async sumCompletedCreditUsage(creditIds: string[]): Promise<number> {
    if (!creditIds.length) return 0;
    const rows = await this.creditOrderRepository.find({
      where: { creditId: In(creditIds) },
      relations: { order: true },
    });
    let total = new Decimal(0);
    for (const co of rows) {
      const o = co.order;
      if (!o || o.status !== "COMPLETED") continue;
      const price = Number(o.price) || Number(co.priceAtOrderTime) || 0;
      const qty = Number(o.executedQuantity) > 0 ? Number(o.executedQuantity) : Number(o.quantity || 0);
      total = total.plus(new Decimal(qty).mul(price));
    }
    return total.toNumber();
  }

  /**
   * Per-credit completed-order IRR usage (single query) — used by the CSV export
   * so every row reflects live usage rather than the stale usedCredit column.
   */
  private async computeUsedCreditMap(creditIds: string[]): Promise<Record<string, number>> {
    const map: Record<string, number> = {};
    if (!creditIds.length) return map;
    const rows = await this.creditOrderRepository.find({
      where: { creditId: In(creditIds) },
      relations: { order: true },
    });
    for (const co of rows) {
      const o = co.order;
      if (!o || o.status !== "COMPLETED") continue;
      const price = Number(o.price) || Number(co.priceAtOrderTime) || 0;
      const qty = Number(o.executedQuantity) > 0 ? Number(o.executedQuantity) : Number(o.quantity || 0);
      map[co.creditId] = new Decimal(map[co.creditId] || 0).plus(new Decimal(qty).mul(price)).toNumber();
    }
    return map;
  }

  /**
   * Facility overview for the active credit: live used/available credit,
   * collateral metrics and risk/settlement state. Used by the user panel and
   * admin dashboard.
   */
  async getCreditOverview(userId: string): Promise<any | null> {
    const credit = await this.getUserActiveCredit(userId);
    if (!credit) return null;

    const usedCredit = await this.computeUsedCredit(credit.id);
    const creditLimit = Number(credit.creditLimit) || 0;

    // CREDIT-wallet free/locked per symbol for display.
    const creditWallets = await this.walletRepository.find({
      where: { userId, walletType: WalletTypeEnum.CREDIT },
      relations: { symbol: true },
    });
    const balances = creditWallets.map((w) => ({
      symbolId: w.symbolId,
      symbolSlug: w.symbol?.slug || w.symbolId,
      freeBalance: Number(w.freeBalance) || 0,
      lockedBalance: Number(w.lockedBalance) || 0,
      creditBalance: Number(w.creditBalance) || 0,
    }));

    // Available credit = creditLimit − completed-order usage. Pending orders are
    // excluded here because their capacity is already held by the CREDIT wallet
    // freeze (freeBalance → lockedBalance).
    const availableCredit = Math.max(0, creditLimit - usedCredit);

    let currentCollateralValue = Number(credit.currentCollateralValue) || 0;
    let lastDrawdownPercent = Number(credit.lastDrawdownPercent) || 0;
    if (credit.collateralSymbolId && credit.initialCollateralValue) {
      try {
        const { drawdownPercent } = await this.recomputeDrawdown(credit);
        lastDrawdownPercent = drawdownPercent;
        currentCollateralValue = Number(credit.currentCollateralValue) || currentCollateralValue;
      } catch {
        // keep last-known values on price failure
      }
    }

    // Per-trade collateral lock summary (handoff §3 Collateral Locked/Available).
    const lockSummary = await this.getCollateralLockSummary(credit.id);

    // Live, signed per-symbol exposure ("negative used balance") and whether
    // the facility could settle right now (all credit wallets net to zero or
    // positive after collateral). Best-effort — a missing mark price (e.g. no
    // trades yet, or a legacy facility) just omits these rather than failing
    // the whole overview.
    let eligibility: any = null;
    try {
      eligibility = await this.settlementService.previewSettlementEligibility(credit);
    } catch {
      // No mark price available yet — leave eligibility null.
    }

    return {
      id: credit.id,
      creditCode: credit.creditCode,
      status: credit.status,
      leverage: credit.leverage,
      creditLimit,
      usedCredit,
      availableCredit,
      collateralSymbolId: credit.collateralSymbolId,
      collateralAmount: Number(credit.collateralAmount) || 0,
      collateralLocked: lockSummary.totalLocked,
      collateralAvailable: lockSummary.available,
      initialCollateralValue: Number(credit.initialCollateralValue) || 0,
      currentCollateralValue,
      lastDrawdownPercent,
      drawdownPercent: credit.drawdownPercent,
      riskState: credit.riskState,
      settlementState: credit.settlementState,
      maxConcurrentOrders: credit.maxConcurrentOrders,
      maxTradeChainDepth: credit.maxTradeChainDepth,
      maxCreditNotional: credit.maxCreditNotional,
      maxTotalLockedCollateral: credit.maxTotalLockedCollateral,
      balances,
      positions: eligibility?.positions ?? [],
      settlementEligible: eligibility?.eligible ?? null,
      settlementShortfall: eligibility?.shortfall ?? 0,
    };
  }

  /**
   * Current mark price of the facility's collateral against the credit base
   * symbol. Returns 1 when the collateral is denominated directly in the base
   * symbol, and 0 when no live price pair is available (callers must treat 0 as
   * "unable to price" rather than assuming a price of 1).
   */
  async getCollateralMarkPrice(credit: CreditEntity): Promise<number> {
    if (!credit.collateralSymbolId || !credit.creditBaseSymbolId) return 0;
    if (credit.collateralSymbolId === credit.creditBaseSymbolId) return 1;
    const pair = await this.pricePairRepository.findOne({
      where: {
        baseId: credit.collateralSymbolId,
        quoteId: credit.creditBaseSymbolId,
        isValid: true,
      },
    });
    const price = pair ? Number(pair.bestSellGramPrice) || Number(pair.bestSellPrice) || 0 : 0;
    return price > 0 ? price : 0;
  }

  /**
   * Collateral required to back a notional exposure (handoff §4.2):
   *   requiredCollateral = exposure / leverage
   * expressed in collateral units (e.g. grams). Example: selling 500g XAU at
   * 10m IRR/g with leverage 5 → (500 × 10m) / 5 / 10m = 100g locked.
   */
  async computeRequiredCollateral(credit: CreditEntity, notionalIr: number): Promise<number> {
    const leverage = Number(credit.leverage) || 1;
    if (leverage <= 0) return 0;
    const price = await this.getCollateralMarkPrice(credit);
    if (price <= 0) return 0;
    return new Decimal(notionalIr || 0).div(leverage).div(price).toNumber();
  }

  /**
   * Create a per-trade collateral lock (handoff §13). Enforces that the lock
   * does not exceed Collateral Available and the max-total-locked ratio.
   */
  async createCollateralLockForOrder(
    creditId: string,
    creditOrderId: string,
    notionalIr: number,
  ): Promise<CollateralLockEntity> {
    const credit = await this.creditRepository.findOne({ where: { id: creditId } });
    if (!credit) throw new NotFoundException("Credit not found");

    const amount = await this.computeRequiredCollateral(credit, notionalIr);
    if (new Decimal(amount).lessThanOrEqualTo(0)) {
      throw new BadRequestException("CREDIT_COLLATERAL_REQUIRED: unable to compute required collateral");
    }

    const summary = await this.getCollateralLockSummary(creditId);
    const collateralTotal = new Decimal(credit.collateralAmount || 0);
    const available = Decimal.max(0, collateralTotal.minus(summary.totalLocked));

    if (new Decimal(amount).greaterThan(available)) {
      throw new BadRequestException(
        `CREDIT_INSUFFICIENT_COLLATERAL: required ${amount} of collateral, only ${available} available`,
      );
    }
    const maxRatio = credit.maxTotalLockedCollateral != null ? Number(credit.maxTotalLockedCollateral) : null;
    if (maxRatio != null && collateralTotal.greaterThan(0)) {
      const projectedRatio = new Decimal(summary.totalLocked).plus(amount).div(collateralTotal);
      if (projectedRatio.greaterThan(maxRatio)) {
        throw new BadRequestException(
          `CREDIT_MAX_LOCKED_COLLATERAL: locking ${projectedRatio.toFixed(4)} exceeds the max ratio ${maxRatio}`,
        );
      }
    }

    const price = await this.getCollateralMarkPrice(credit);
    const lock = this.collateralLockRepository.create({
      creditId,
      creditOrderId,
      amount,
      notionalValue: notionalIr,
      priceAtLock: price,
      status: CollateralLockStatusEnum.ACTIVE,
      activatedAt: new Date(),
    });
    return this.collateralLockRepository.save(lock);
  }

  /**
   * Release the collateral lock of a credit trade that never opened (cancelled
   * / rejected before execution). Idempotent.
   */
  async releaseCollateralLockForCreditOrder(creditOrderId: string): Promise<void> {
    const locks = await this.collateralLockRepository.find({
      where: { creditOrderId, status: CollateralLockStatusEnum.ACTIVE },
    });
    const now = new Date();
    for (const lock of locks) {
      lock.status = CollateralLockStatusEnum.RELEASED;
      lock.releasedAt = now;
      await this.collateralLockRepository.save(lock);
    }
  }

  /**
   * Collateral lock summary for a facility (handoff §3):
   *   totalLocked  = Σ ACTIVE + RELEASE_PENDING locks
   *   available    = collateralTotal − totalLocked
   */
  async getCollateralLockSummary(creditId: string): Promise<{
    totalLocked: number;
    available: number;
    active: number;
    released: number;
    consumed: number;
  }> {
    const credit = await this.creditRepository.findOne({ where: { id: creditId } });
    const total = new Decimal(credit?.collateralAmount || 0);
    const locks = await this.collateralLockRepository.find({ where: { creditId } });

    let totalLocked = new Decimal(0);
    let released = new Decimal(0);
    let consumed = new Decimal(0);
    let active = 0;
    for (const lock of locks) {
      const amt = new Decimal(lock.amount || 0);
      if (
        lock.status === CollateralLockStatusEnum.ACTIVE ||
        lock.status === CollateralLockStatusEnum.RELEASE_PENDING ||
        lock.status === CollateralLockStatusEnum.CREATED
      ) {
        totalLocked = totalLocked.plus(amt);
        active += 1;
      } else if (lock.status === CollateralLockStatusEnum.RELEASED) {
        released = released.plus(amt);
      } else if (lock.status === CollateralLockStatusEnum.CONSUMED) {
        consumed = consumed.plus(amt);
      }
    }
    return {
      totalLocked: totalLocked.toNumber(),
      available: Decimal.max(0, total.minus(totalLocked)).toNumber(),
      active,
      released: released.toNumber(),
      consumed: consumed.toNumber(),
    };
  }

  /** List the per-trade collateral lock records of a facility (admin). */
  async getCollateralLocks(creditId: string): Promise<CollateralLockEntity[]> {
    return this.collateralLockRepository.find({
      where: { creditId },
      relations: { creditOrder: { order: true } },
      order: { createAt: "DESC" },
    });
  }

  /**
   * Credit pre-check (handoff §9, §15). Enforces the facility's risk-limit
   * parameters that are not covered by the existing guards in the order path:
   *   - maxConcurrentOrders  (max_parallel_trades)
   *   - maxTradeChainDepth   (max_asset_depth)
   *   - maxCreditNotional    (max_credit_notional)
   *   - maxTotalLockedCollateral (via createCollateralLockForOrder)
   */
  async runCreditPreCheck(
    credit: CreditEntity,
    opts: { side: string; notionalIr: number; excludeOrderId?: string },
  ): Promise<void> {
    // ── max_parallel_trades (concurrent open orders) ────────────────
    if (credit.maxConcurrentOrders != null) {
      const activeCount = await this.creditOrderRepository.count({
        where: { creditId: credit.id, status: CreditOrderStatusEnum.ACTIVE },
      });
      if (activeCount >= credit.maxConcurrentOrders) {
        throw new BadRequestException(
          `CREDIT_MAX_PARALLEL_TRADES: ${activeCount} active trades exceeds the max of ${credit.maxConcurrentOrders}`,
        );
      }
    }

    // ── max_asset_depth (chain depth) ────────────────────────────────
    if (credit.maxTradeChainDepth != null) {
      const activeOrders = await this.creditOrderRepository.find({
        where: { creditId: credit.id, status: CreditOrderStatusEnum.ACTIVE },
      });
      const currentDepth = activeOrders.reduce(
        (max, co) => Math.max(max, Number(co.tradeChainLevel) || 1),
        1,
      );
      if (currentDepth >= credit.maxTradeChainDepth) {
        throw new BadRequestException(
          `CREDIT_MAX_ASSET_DEPTH: chain depth ${currentDepth} has reached the max of ${credit.maxTradeChainDepth}`,
        );
      }
    }

    // ── max_credit_notional (nominal exposure cap) ──────────────────
    if (credit.maxCreditNotional != null && Number(credit.maxCreditNotional) > 0) {
      // Current exposure = IRR value of completed credit orders (the real open
      // notional), not the placement-time `usedCredit` bump which also counts
      // pending/rejected orders.
      const usedNotional = await this.computeUsedCredit(credit.id);
      const projected = new Decimal(usedNotional).plus(opts.notionalIr || 0);
      if (projected.greaterThan(Number(credit.maxCreditNotional))) {
        throw new BadRequestException(
          `CREDIT_MAX_NOTIONAL: projected exposure ${projected.toFixed(2)} exceeds the max of ${credit.maxCreditNotional}`,
        );
      }
    }
  }

  /**
   * Aggregate KPIs for the admin credit dashboard.
   */
  async getCreditStats(): Promise<any> {
    const all = await this.creditRepository.find({ relations: { user: true } });
    const active = all.filter((c) => c.status === CreditStatusEnum.ACTIVE);

    const sum = (arr: CreditEntity[], pick: (c: CreditEntity) => number) =>
      arr.reduce((s, c) => s + (Number(pick(c)) || 0), 0);

    // Live used credit = IRR value of completed credit orders (single query).
    const activeUsedCredit = await this.sumCompletedCreditUsage(active.map((c) => c.id));

    const settlementDist = {} as Record<string, number>;
    const riskDist = {} as Record<string, number>;
    for (const c of all) {
      settlementDist[c.settlementState] = (settlementDist[c.settlementState] || 0) + 1;
      riskDist[c.riskState] = (riskDist[c.riskState] || 0) + 1;
    }

    return {
      totals: {
        credits: all.length,
        active: active.length,
        settled: all.filter((c) => c.status === CreditStatusEnum.SETTLED).length,
        cancelled: all.filter((c) => c.status === CreditStatusEnum.CANCELLED).length,
        expired: all.filter((c) => c.status === CreditStatusEnum.EXPIRED).length,
      },
      exposure: {
        activeCreditLimit: sum(active, (c) => c.creditLimit),
        activeUsedCredit,
        activeCollateralValue: sum(active, (c) => c.currentCollateralValue || c.initialCollateralValue),
        activeCollateralAmount: sum(active, (c) => c.collateralAmount),
      },
      risk: {
        inDefault: all.filter((c) => c.isInDefault || c.riskState === RiskStateEnum.DEFAULT).length,
        marginCall: active.filter((c) => c.riskState === RiskStateEnum.MARGIN_CALL).length,
        warning: active.filter((c) => c.riskState === RiskStateEnum.WARNING).length,
        adminReview: active.filter((c) => c.settlementState === SettlementStateEnum.ADMIN_REVIEW).length,
        suspended: all.filter((c) => c.status === CreditStatusEnum.SUSPENDED).length,
      },
      settlementDistribution: settlementDist,
      riskDistribution: riskDist,
    };
  }

  /**
   * Whether the facility can complete a voluntary settlement right now — i.e.
   * whether its credit wallets net to zero or positive after collateral, with
   * no outstanding shortfall. Read-only preview used by both panels to show
   * the gate (and what's still owed per symbol) before the user hits Settle.
   */
  async getSettlementEligibility(creditId: string): Promise<any> {
    const credit = await this.getCreditById(creditId);
    return this.settlementService.previewSettlementEligibility(credit);
  }

  /**
   * Enhanced risk view for a credit (admin): live valuation from the
   * settlement engine plus per-symbol credit wallet balances.
   */
  async getCreditRisk(creditId: string): Promise<any> {
    const credit = await this.getCreditById(creditId);
    let state: any = null;
    let stateError: string | null = null;
    let eligible: boolean | null = null;
    try {
      state = await this.settlementService.computeState(credit);
      eligible = state.shortfall <= 0;
    } catch (err) {
      stateError = (err as Error).message || "CREDIT_NO_MARK_PRICE";
    }

    const usedCredit = await this.computeUsedCredit(credit.id);
    const creditLimit = Number(credit.creditLimit) || 0;
    const creditWallets = await this.walletRepository.find({
      where: { userId: credit.userId, walletType: WalletTypeEnum.CREDIT },
      relations: { symbol: true },
    });
    const balances = creditWallets.map((w) => ({
      symbolId: w.symbolId,
      symbolSlug: w.symbol?.slug || w.symbolId,
      freeBalance: Number(w.freeBalance) || 0,
      lockedBalance: Number(w.lockedBalance) || 0,
      creditBalance: Number(w.creditBalance) || 0,
    }));
    // available = creditLimit − completed-order usage (pending orders are held
    // by the CREDIT wallet freeze).
    const availableCredit = Math.max(0, creditLimit - usedCredit);

    return {
      credit,
      valuation: state,
      stateError,
      eligible,
      usedCredit,
      availableCredit,
      creditLimit,
      balances,
      suspended: credit.status === CreditStatusEnum.SUSPENDED,
    };
  }

  /**
   * All credits for a specific user (admin), plus their live active overview.
   */
  async getUserCreditsAdmin(userId: string): Promise<any> {
    const credits = await this.creditRepository.find({
      where: { userId },
      relations: { creditOrders: true },
      order: { createAt: "DESC" },
    });
    let activeOverview: any = null;
    const active = credits.find((c) => c.status === CreditStatusEnum.ACTIVE);
    if (active) {
      activeOverview = await this.getCreditOverview(userId);
    }
    return { credits, activeOverview };
  }

  /**
   * Suspend a user's credit: freeze all their wallets (blocks trading) and tag
   * the facility as suspended. Reactivation restores the wallets.
   */
  async suspendCredit(adminId: string, creditId: string, reason?: string): Promise<CreditEntity> {
    return await this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId, status: CreditStatusEnum.ACTIVE },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new BadRequestException("Active credit not found");

      credit.status = CreditStatusEnum.SUSPENDED;
      credit.metadata = { ...(credit.metadata || {}), suspendedAt: new Date().toISOString(), suspendedBy: adminId, suspendReason: reason };
      await manager.save(credit);

      await this.blockUserForMarginCall(credit.userId, creditId, manager);

      await this.logFinanceAction(manager, {
        adminId,
        userId: credit.userId,
        creditId: credit.id,
        actionType: CreditActionEnum.CREDIT_SUSPENDED,
        description: `Credit ${credit.creditCode} suspended${reason ? `: ${reason}` : ""}. All wallets frozen.`,
        metadata: { reason },
      });
      return credit;
    });
  }

  /**
   * Reactivate a suspended credit: restore the user's wallets to ACTIVE.
   */
  async reactivateCredit(adminId: string, creditId: string, reason?: string): Promise<CreditEntity> {
    return await this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId, status: CreditStatusEnum.SUSPENDED },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new BadRequestException("Suspended credit not found");

      credit.status = CreditStatusEnum.ACTIVE;
      credit.metadata = { ...(credit.metadata || {}), reactivatedAt: new Date().toISOString(), reactivatedBy: adminId };
      await manager.save(credit);

      await this.unblockUserWallets(manager, credit.userId);

      await this.logFinanceAction(manager, {
        adminId,
        userId: credit.userId,
        creditId: credit.id,
        actionType: CreditActionEnum.CREDIT_REACTIVATED,
        description: `Credit ${credit.creditCode} reactivated${reason ? `: ${reason}` : ""}. Wallets unfrozen.`,
        metadata: { reason },
      });
      return credit;
    });
  }

  /**
   * Extend the settlement timer by pushing the activation time forward.
   */
  async extendCredit(adminId: string, creditId: string, hours: number, reason?: string): Promise<CreditEntity> {
    return await this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId, status: CreditStatusEnum.ACTIVE },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new BadRequestException("Active credit not found");

      const base = credit.activatedAt ? new Date(credit.activatedAt) : new Date();
      credit.activatedAt = new Date(base.getTime() + hours * 60 * 60 * 1000);
      // Restart to GREEN so the full window is available again.
      credit.settlementState = SettlementStateEnum.GREEN;
      credit.settlementYellowAt = null;
      credit.settlementRedAt = null;
      credit.settlementAdminReviewAt = null;
      await manager.save(credit);

      await this.logFinanceAction(manager, {
        adminId,
        userId: credit.userId,
        creditId: credit.id,
        actionType: CreditActionEnum.CREDIT_EXTENDED,
        description: `Credit ${credit.creditCode} settlement extended by ${hours}h${reason ? ` (${reason})` : ""}`,
        metadata: { hours, reason },
      });
      return credit;
    });
  }

  /**
   * Admin override of the credit limit. Adjusts the creditLimit and applies the
   * delta to the base (credit currency) CREDIT wallet balance.
   */
  async adjustCreditLimit(adminId: string, creditId: string, newLimit: number, reason?: string): Promise<CreditEntity> {
    return await this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId, status: CreditStatusEnum.ACTIVE },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new BadRequestException("Active credit not found");
      if (!credit.creditBaseSymbolId) throw new BadRequestException("Credit has no base symbol to adjust");

      const oldLimit = Number(credit.creditLimit) || 0;
      const delta = new Decimal(newLimit).minus(oldLimit);
      if (newLimit < 0) throw new BadRequestException("Credit limit cannot be negative");

      let creditWallet = await manager.findOne(WalletEntity, {
        where: { userId: credit.userId, symbolId: credit.creditBaseSymbolId, walletType: WalletTypeEnum.CREDIT },
        lock: { mode: "pessimistic_write" },
      });
      if (!creditWallet) {
        creditWallet = manager.create(WalletEntity, {
          userId: credit.userId,
          symbolId: credit.creditBaseSymbolId,
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
      // Only allow lowering below current locked+free if it stays non-negative.
      const newWalletBalance = new Decimal(creditWallet.creditBalance || 0).plus(delta);
      if (newWalletBalance.lessThan(0)) {
        throw new BadRequestException("New limit would make the credit wallet negative");
      }
      creditWallet.creditBalance = newWalletBalance.toNumber();
      creditWallet.freeBalance = new Decimal(creditWallet.availableBalance || 0)
        .plus(creditWallet.creditBalance)
        .toNumber();
      await manager.save(creditWallet);

      credit.creditLimit = newLimit;
      await manager.save(credit);

      await this.logFinanceAction(manager, {
        adminId,
        userId: credit.userId,
        creditId: credit.id,
        walletId: creditWallet.id,
        actionType: CreditActionEnum.CREDIT_LIMIT_ADJUSTED,
        description: `Credit ${credit.creditCode} limit adjusted ${oldLimit} → ${newLimit}${reason ? ` (${reason})` : ""}`,
        metadata: { oldLimit, newLimit, delta: delta.toNumber(), reason },
      });
      return credit;
    });
  }

  /**
   * Unfreeze a user's wallets (restore ACTIVE) without touching balances.
   * Used on credit reactivation.
   */
  private async unblockUserWallets(manager: any, userId: string): Promise<void> {
    const wallets = await manager.find(WalletEntity, {
      where: { userId },
      lock: { mode: "pessimistic_write" },
    });
    for (const wallet of wallets) {
      if (wallet.status === WalletStatusEnum.FROZEN) {
        wallet.status = WalletStatusEnum.ACTIVE;
        wallet.frozenAt = null;
        wallet.adminNote = `Unfrozen on credit reactivation`;
        await manager.save(wallet);
      }
    }
  }

  async getUserCredits(userId: string): Promise<CreditEntity[]> {
    return await this.creditRepository.find({
      where: { userId },
      relations: { creditOrders: { order: true } },
      order: { createAt: "DESC" },
    });
  }

  async getCreditById(creditId: string): Promise<CreditEntity> {
    const credit = await this.creditRepository.findOne({
      where: { id: creditId },
      relations: {
        user: true,
        creditOrders: {
          order: {
            pricePair: { baseSymbol: true, quoteSymbol: true },
          },
        },
      },
    });
    if (!credit) throw new NotFoundException("Credit not found");
    return credit;
  }

  /**
   * Calculate profit/loss for a credit based on its orders.
   * For BUY orders: PnL = (currentPrice - entryPrice) * quantity
   * For SELL orders: PnL = (entryPrice - currentPrice) * quantity
   */
  calculateCreditPnL(credit: CreditEntity): {
    totalPnL: number;
    realizedPnL: number;
    unrealizedPnL: number;
    orders: Array<{
      orderId: string;
      side: string;
      entryPrice: number;
      currentPrice: number | null;
      quantity: number;
      executedQuantity: number;
      pnl: number;
      status: string;
      pairKey: string;
    }>;
  } {
    let realizedPnL = 0;
    let unrealizedPnL = 0;
    const orderDetails: Array<{
      orderId: string;
      side: string;
      entryPrice: number;
      currentPrice: number | null;
      quantity: number;
      executedQuantity: number;
      pnl: number;
      status: string;
      pairKey: string;
    }> = [];

    for (const co of credit.creditOrders || []) {
      const order = co.order;
      if (!order) continue;

      const entryPrice = Number(co.priceAtOrderTime) || 0;
      const currentPrice = co.currentPrice ? Number(co.currentPrice) : null;
      const quantity = Number(order.quantity) || 0;
      const executedQuantity = Number(order.executedQuantity) || 0;
      const pairKey = order.pricePair
        ? `${order.pricePair.baseSymbol?.slug || "?"}/${order.pricePair.quoteSymbol?.slug || "?"}`
        : "?";

      let pnl = 0;
      if (currentPrice && executedQuantity > 0) {
        if (order.side === "BUY") {
          pnl = (currentPrice - entryPrice) * executedQuantity;
        } else {
          pnl = (entryPrice - currentPrice) * executedQuantity;
        }
      }

      if (order.status === "COMPLETED" || order.status === "CANCELLED") {
        realizedPnL += pnl;
      } else {
        unrealizedPnL += pnl;
      }

      orderDetails.push({
        orderId: order.id,
        side: order.side,
        entryPrice,
        currentPrice,
        quantity,
        executedQuantity,
        pnl,
        status: order.status,
        pairKey,
      });
    }

    return {
      totalPnL: realizedPnL + unrealizedPnL,
      realizedPnL,
      unrealizedPnL,
      orders: orderDetails,
    };
  }

  async getAllCredits(query?: {
    userId?: string;
    status?: CreditStatusEnum;
    settlementState?: SettlementStateEnum;
    riskState?: RiskStateEnum;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    limit?: number;
  }): Promise<{ items: CreditEntity[]; total: number; page: number; limit: number }> {
    const qb = this.creditRepository.createQueryBuilder("credit")
      .leftJoinAndSelect("credit.user", "user")
      .leftJoinAndSelect("credit.creditOrders", "creditOrders");

    if (query?.userId) {
      qb.andWhere("credit.userId = :userId", { userId: query.userId });
    }
    if (query?.status) {
      qb.andWhere("credit.status = :status", { status: query.status });
    }
    if (query?.settlementState) {
      qb.andWhere("credit.settlementState = :settlementState", { settlementState: query.settlementState });
    }
    if (query?.riskState) {
      qb.andWhere("credit.riskState = :riskState", { riskState: query.riskState });
    }
    if (query?.from) {
      qb.andWhere("credit.createAt >= :from", { from: new Date(query.from) });
    }
    if (query?.to) {
      qb.andWhere("credit.createAt <= :to", { to: new Date(query.to) });
    }
    if (query?.search) {
      qb.andWhere("(credit.creditCode ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.phone ILIKE :search)", {
        search: `%${query.search}%`,
      });
    }

    qb.orderBy("credit.createAt", "DESC");
    const total = await qb.getCount();
    const page = query?.page || 1;
    const limit = query?.limit || 20;
    const items = await qb
      .skip((page - 1) * limit)
      .take(limit)
      .getMany();

    return { items, total, page, limit };
  }

  /**
   * Build a CSV string of credits matching the query for admin export.
   */
  async exportCreditsCsv(query?: Parameters<CreditService["getAllCredits"]>[0]): Promise<string> {
    const { items } = await this.getAllCredits({ ...query, limit: 100000, page: 1 });
    const usedCreditMap = await this.computeUsedCreditMap(items.map((c) => c.id));
    const esc = (v: any) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "creditCode", "status", "userId", "userName", "phone", "amount", "creditLimit",
      "usedCredit", "leverage", "collateralAmount", "collateralValue", "drawdownPercent",
      "lastDrawdownPercent", "riskState", "settlementState", "createdAt", "expireAt", "settledAt",
    ].join(",");
    const rows = items.map((c) =>
      [
        c.creditCode,
        c.status,
        c.userId,
        c.user ? `${c.user.firstName ?? ""} ${c.user.lastName ?? ""}`.trim() : "",
        c.user?.phone ?? "",
        c.amount,
        c.creditLimit,
        usedCreditMap[c.id] ?? c.usedCredit ?? "",
        c.leverage ?? "",
        c.collateralAmount ?? "",
        c.currentCollateralValue ?? "",
        c.drawdownPercent ?? "",
        c.lastDrawdownPercent ?? "",
        c.riskState,
        c.settlementState,
        c.createAt ? new Date(c.createAt).toISOString() : "",
        c.expireAt ? new Date(c.expireAt).toISOString() : "",
        c.settledAt ? new Date(c.settledAt).toISOString() : "",
      ]
        .map(esc)
        .join(","),
    );
    return [header, ...rows].join("\n");
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
  private async enforceCreditLimits(userId: string, amount: number): Promise<void> {
    const maxAmount = await this.userLevelService.getFeatureValue(userId, "CREDIT_MAX_AMOUNT");
    const maxAmt = typeof maxAmount === "object" ? Number(maxAmount?.amount) : Number(maxAmount);
    if (maxAmt > 0 && Number(amount) > maxAmt) {
      throw new BadRequestException(
        `حداکثر مبلغ اعتبار در سطح شما ${maxAmt.toLocaleString("fa-IR")} ریال است`
      );
    }
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
        const previousState = credit.settlementState;
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
          previousState,
          newState,
        });

        this.logger.log(
          `Credit ${credit.creditCode} settlement state: ${previousState} → ${newState} ` +
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
    // Value the facility at the current mark price using the settlement engine.
    let state: SettlementState;
    try {
      state = await this.settlementService.computeState(credit);
    } catch (err) {
      // No mark price available - defer the risk evaluation.
      return;
    }

    // Only facilities with actual exposure are risk-relevant.
    if (state.exposure <= 0) return;

    // Drawdown enforcement (equity-based): if the credit trades push equity
    // below the allowed drawdown, ENFORCE closes the credit (loss deducted from
    // collateral, remainder refunded to the deposit wallet) and ALERT notifies.
    const ddThreshold = credit.drawdownPercent != null ? Number(credit.drawdownPercent) : null;
    if (ddThreshold != null && ddThreshold > 0) {
      const initial = Number(credit.initialCollateralValue) || 0;
      const drawdown = initial > 0 ? Math.max(0, (initial - state.equity) / initial) * 100 : 0;
      if (drawdown >= ddThreshold) {
        if (credit.enforceOnDrawdown === CreditEnforceModeEnum.ENFORCE) {
          await this.liquidateForDrawdown(credit.id, drawdown);
          return;
        }
        // ALERT: notify once per threshold crossing.
        await this.creditNotificationRepository.save(
          this.creditNotificationRepository.create({
            userId: credit.userId,
            creditId: credit.id,
            type: CreditNotificationTypeEnum.MARGIN_CALL,
            message:
              `Credit ${credit.creditCode} drawdown touched ${drawdown.toFixed(2)}% ` +
              `(threshold ${ddThreshold}%). Exposure-increasing orders are blocked until recovery.`,
            sentAt: new Date(),
          }),
        );
      }
    }

    // Margin ratio is a decimal (e.g. 0.238 = 23.8%).
    const marginRatio = state.marginRatio;
    const WARNING_THRESHOLD = 0.15; // 15%
    const MARGIN_CALL_THRESHOLD = 0.075; // 7.5%

    let newRiskState: RiskStateEnum | null = null;

    if (marginRatio == null) {
      newRiskState = RiskStateEnum.NORMAL;
    } else if (marginRatio <= MARGIN_CALL_THRESHOLD && credit.riskState !== RiskStateEnum.MARGIN_CALL) {
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

      const marginPercent = marginRatio != null ? (marginRatio * 100).toFixed(2) : "8";
      await this.creditNotificationRepository.save(
        this.creditNotificationRepository.create({
          userId: credit.userId,
          creditId: credit.id,
          type: newRiskState === RiskStateEnum.MARGIN_CALL
            ? CreditNotificationTypeEnum.MARGIN_CALL
            : CreditNotificationTypeEnum.SETTLEMENT,
          message:
            `Credit ${credit.creditCode} risk state changed to ${newRiskState}. ` +
            `Margin ratio: ${marginPercent}%. Equity ${state.equity.toFixed(2)}. ` +
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
        equity: state.equity,
        collateralValue: state.collateralValue,
      });

      this.logger.log(
        `Credit ${credit.creditCode} risk state: ${previousState} → ${newRiskState} ` +
        `(margin ratio: ${marginPercent}%)`,
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
  /**
   * Re-prices the facility and computes the drawdown % relative to the initial
   * collateral value. Drawdown now uses the facility's EQUITY (current
   * collateral value + credit-trade net PnL) so losing credit trades move the
   * drawdown into the penalty area, not just collateral depreciation.
   */
  async recomputeDrawdown(credit: CreditEntity, manager?: any): Promise<{ credit: CreditEntity; drawdownPercent: number }> {
    const em = manager || this.creditRepository.manager;
    if (!credit.collateralSymbolId || !credit.initialCollateralValue) {
      return { credit, drawdownPercent: Number(credit.lastDrawdownPercent) || 0 };
    }
    const initial = new Decimal(credit.initialCollateralValue);

    let equity: Decimal | null = null;
    let currentValue: Decimal | null = null;
    try {
      const state = await this.settlementService.computeState(credit, em);
      equity = new Decimal(state.equity);
      currentValue = new Decimal(state.collateralValue);
    } catch {
      // No mark price — fall back to collateral-only valuation below.
    }

    let drawdown: Decimal;
    if (equity != null) {
      drawdown = initial.greaterThan(0)
        ? Decimal.max(0, initial.minus(equity)).div(initial).mul(100)
        : new Decimal(0);
    } else {
      // Collateral-only fallback using the current pair price.
      let price: number | null = null;
      if (credit.collateralSymbolId === credit.creditBaseSymbolId) {
        price = 1;
      } else {
        const pair = await this.pricePairRepository.findOne({
          where: { baseId: credit.collateralSymbolId, quoteId: credit.creditBaseSymbolId, isValid: true },
        });
        price = pair ? Number(pair.bestSellGramPrice) : null;
      }
      if (!price || price <= 0) {
        return { credit, drawdownPercent: Number(credit.lastDrawdownPercent) || 0 };
      }
      currentValue = new Decimal(credit.collateralAmount || 0).mul(price);
      drawdown = initial.greaterThan(0)
        ? Decimal.max(0, initial.minus(currentValue)).div(initial).mul(100)
        : new Decimal(0);
    }

    credit.currentCollateralValue = (currentValue ?? new Decimal(0)).toNumber();
    // NOTE: creditLimit stays fixed at the value issued at facility creation
    // (collateral value at creation × leverage). It is NOT re-derived from the
    // live collateral value here — that would make the limit swing with the mark
    // price while usedCredit accumulates statically, producing an inconsistent
    // "available credit" figure. Live buying power is derived at read time (see
    // getCreditOverview) if needed.
    credit.lastDrawdownPercent = drawdown.toDecimalPlaces(2).toNumber();
    if (!manager) await this.creditRepository.save(credit);
    return { credit, drawdownPercent: credit.lastDrawdownPercent };
  }

  /**
   * Called from the order path before accepting a new order. ENFORCE mode
   * liquidates the facility; ALERT mode notifies and blocks exposure-increasing
   * (BUY) orders via the returned flag.
   */
  async enforceDrawdownRules(
    credit: CreditEntity,
    override?: { drawdownPercent?: number | null; enforceOnDrawdown?: CreditEnforceModeEnum | null },
  ): Promise<{ blockBuy: boolean }> {
    const { credit: fresh, drawdownPercent } = await this.recomputeDrawdown(credit);
    const threshold =
      override?.drawdownPercent != null
        ? Number(override.drawdownPercent)
        : fresh.drawdownPercent != null
          ? Number(fresh.drawdownPercent)
          : null;
    if (threshold == null || threshold <= 0 || drawdownPercent < threshold) {
      return { blockBuy: false };
    }

    const enforce = override?.enforceOnDrawdown ?? fresh.enforceOnDrawdown;
    if (enforce === CreditEnforceModeEnum.ENFORCE) {
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
   * Drawdown / forced liquidation: delegates to the settlement engine, which
   * cash-settles the facility at the current mark price and consumes collateral
   * for any deficit.
   */
  async liquidateForDrawdown(creditId: string, drawdownPercent?: number): Promise<CreditEntity> {
    return this.settlementService.liquidate(creditId, "DRAWDOWN_LIQUIDATION");
  }

  /**
   * Adjust a credit's settlement policy (handoff §6.3, §6.5): admin approval
   * requirement, enabled settlement methods and netting policy.
   */
  async updateSettlementPolicy(
    adminId: string,
    creditId: string,
    dto: {
      requireAdminApprovalForSettlement?: boolean;
      settlementMethods?: string[];
      nettingEnabled?: boolean;
    },
    reason?: string,
  ): Promise<CreditEntity> {
    const credit = await this.creditRepository.findOne({ where: { id: creditId } });
    if (!credit) throw new NotFoundException("Credit not found");

    if (dto.requireAdminApprovalForSettlement != null) {
      credit.requireAdminApprovalForSettlement = dto.requireAdminApprovalForSettlement;
    }
    if (dto.settlementMethods && dto.settlementMethods.length > 0) {
      credit.settlementMethods = dto.settlementMethods;
    }
    if (dto.nettingEnabled != null) {
      credit.nettingEnabled = dto.nettingEnabled;
    }
    const saved = await this.creditRepository.save(credit);

    await this.financeLogRepository.save(
      this.financeLogRepository.create({
        adminId,
        userId: credit.userId,
        creditId: credit.id,
        actionType: CreditActionEnum.CREDIT_LIMIT_ADJUSTED,
        description:
          `Credit ${credit.creditCode} settlement policy updated` +
          (reason ? `: ${reason}` : ""),
        metadata: {
          requireAdminApprovalForSettlement: saved.requireAdminApprovalForSettlement,
          settlementMethods: saved.settlementMethods,
          nettingEnabled: saved.nettingEnabled,
        },
        actionTime: new Date(),
      }),
    );
    return saved;
  }

  /**
   * User self-settlement: delegates to the settlement engine, allowing the
   * user to top up a deficit from their deposit wallet before any collateral
   * is consumed.
   */
  async settleFromUser(userId: string, creditId: string): Promise<CreditEntity> {
    const credit = await this.creditRepository.findOne({
      where: { id: creditId, userId, status: CreditStatusEnum.ACTIVE },
    });
    if (!credit) throw new BadRequestException("Credit not found or not active");
    return this.settlementService.settleCredit(creditId, {
      mode: "USER_SELF",
      reason: "USER_SETTLEMENT",
      allowDepositTopUp: true,
    });
  }

  async processPendDeadlines(): Promise<void> {
    const now = new Date();

    const pendingOrders = await this.dataSource.manager.find(OrderEntity, {
      where: {
        isCreditLinked: true,
        status: In([OrderStatusEnum.PENDING, OrderStatusEnum.PARTIALLY_COMPLETED]),
      },
      relations: { user: true, pricePair: true },
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
            // Release the credit balance frozen for this request, then cancel.
            try {
              if (order.pricePair) {
                await this.walletOrderService.rejectOrder(order, order.pricePair, OrderStatusEnum.CANCELLED);
              } else {
                order.status = "CANCELLED" as any;
                (order as any).cancelledAt = now;
                await this.dataSource.manager.save(order);
              }
            } catch (error) {
              this.logger.error(
                `Failed to unlock & cancel overdue order ${order.orderCode}: ${(error as Error).message}`,
              );
              continue;
            }

            const creditOrder = await this.dataSource.manager.findOne(CreditOrderEntity, {
              where: { orderId: order.id, status: CreditOrderStatusEnum.ACTIVE },
            });
            if (creditOrder) {
              creditOrder.status = CreditOrderStatusEnum.CANCELLED;
              await this.dataSource.manager.save(creditOrder);
            }

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
