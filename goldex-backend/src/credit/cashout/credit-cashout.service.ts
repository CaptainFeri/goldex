import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import Decimal from "decimal.js";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { CreditEntity } from "../entity/credit.entity";
import { CreditOrderEntity } from "../entity/credit-order.entity";
import { CreditCashoutEntity } from "../entity/credit-cashout.entity";
import { CreditNotificationEntity } from "../entity/credit-notification.entity";
import { CollateralLockEntity } from "../entity/collateral-lock.entity";
import { CreditStatusEnum } from "../enum/credit-status.enum";
import { CreditOrderStatusEnum } from "../enum/credit-order-status.enum";
import { CashoutSourceEnum } from "../enum/cashout-source.enum";
import { CreditNotificationTypeEnum } from "../enum/credit-notification-type.enum";
import { CreditActionEnum } from "../enum/credit-action.enum";
import { RiskStateEnum } from "../enum/risk-state.enum";
import { CollateralLockStatusEnum } from "../enum/collateral-lock-status.enum";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { WalletTypeEnum } from "../../wallet/enum/wallet-type.enum";
import { WalletStatusEnum } from "../../wallet/enum/wallet-status.enum";
import { TransactionEntity } from "../../wallet/entities/transaction.entity";
import { TransactionTypeEnum } from "../../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../../wallet/enum/transaction.status.enum";
import { PricePairEntity } from "../../admin-pair/entity/price.pair.entity";
import { FinanceLogEntity } from "../../finance-log/entity/finance-log.entity";
import { SystemLedgerEntity } from "../../financial/entity/system-ledger.entity";
import { SystemLedgerType } from "../../financial/enum/system-ledger-type.enum";
import { OrderSideEnum } from "../../order/enum/order.side.enum";
import { OrderTypeEnum } from "../../order/enum/order.type.enum";
import { CreditEvents } from "../../shared/constants/events.constants";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -7, toExpPos: 21 });

/** One credit purchase, priced for cash-out, with per-source feasibility. */
export interface CashoutTradeOption {
  creditOrderId: string;
  orderId: string;
  orderCode: string;
  pairKey: string;
  executedQuantity: number;
  price: number;
  executedAt: Date | null;
  /** Credit repaid by cashing this trade out (credit currency, e.g. IRR). */
  amount: number;
  /** Facility cash-out fee rate (%). */
  feePercent: number;
  /** Platform cash-out fee on this trade (credit currency). */
  feeAmount: number;
  /** amount + feeAmount — what the chosen source is charged. */
  totalDue: number;
  /** Platform profit this cash-out books, valued in the credit currency. */
  systemProfitValue: number;
  assetSymbolId: string | null;
  assetSymbolSlug: string;
  /** Purchased asset released to the deposit wallet. */
  assetAmount: number;
  /** Purchased asset still held in the CREDIT wallet. */
  assetHeld: number;
  eligible: boolean;
  reason: string | null;
  deposit: { required: number; available: number; sufficient: boolean };
  collateral: {
    requiredUnits: number;
    available: number;
    sufficient: boolean;
    blockedReason: string | null;
    creditLimitReduction: number;
    sellCapacityReduction: number;
    /** Conversion commission booked by the platform, in collateral units. */
    spreadProfit: number;
  };
}

export interface CashoutOptions {
  supported: boolean;
  reason: string | null;
  creditId: string;
  creditCode: string;
  markPrice: number;
  creditBaseSymbolId: string | null;
  collateralSymbolId: string | null;
  depositBalance: number;
  collateralAvailable: number;
  /** Facility cash-out fee rate (%), managed by the admin. */
  feePercent: number;
  /** Commission the platform books when collateral is converted (%). */
  collateralConversionPercent: number;
  trades: CashoutTradeOption[];
}

/** Cash-out volume and platform-profit aggregates. */
export interface CashoutTotals {
  count: number;
  /** Credit repaid through cash-outs (credit currency). */
  volume: number;
  /** Cash-out fees earned (credit currency). */
  fees: number;
  /** Conversion commission earned (collateral units). */
  spreadProfit: number;
  /** Total platform profit, valued in the credit currency. */
  systemProfit: number;
  collateralConsumed: number;
  creditLimitReduction: number;
}

export interface CashoutActor {
  userId?: string | null;
  adminId?: string | null;
}

/**
 * Credit cash-out — the "cash out utilised credit" option, as opposed to
 * settling and closing the facility.
 *
 * A purchase previously made with credit is converted into a fully-paid
 * holding: the amount that was drawn from the credit line is paid back either
 * from the user's DEPOSIT wallet or out of their frozen collateral, the
 * purchased asset moves from the CREDIT wallet to the DEPOSIT wallet, and the
 * repaid amount returns to the facility's available credit. The facility
 * itself stays ACTIVE — nothing is closed, no collateral is released.
 *
 * Paying from collateral shrinks the facility proportionally: the consumed
 * collateral no longer backs any credit, so the leveraged BUY limit and SELL
 * capacity it supported are removed with it.
 *
 * A cashed-out trade leaves the facility's valuation entirely — it is marked
 * CASHED_OUT and skipped by the settlement engine, the used-credit sums and the
 * drawdown calculation.
 */
@Injectable()
export class CreditCashoutService {
  private readonly logger = new Logger(CreditCashoutService.name);

  constructor(
    @InjectRepository(CreditEntity)
    private readonly creditRepo: Repository<CreditEntity>,
    @InjectRepository(CreditOrderEntity)
    private readonly creditOrderRepo: Repository<CreditOrderEntity>,
    @InjectRepository(CreditCashoutEntity)
    private readonly cashoutRepo: Repository<CreditCashoutEntity>,
    @InjectRepository(PricePairEntity)
    private readonly pricePairRepo: Repository<PricePairEntity>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── read side ────────────────────────────────────────────────────────────

  /**
   * Every credit purchase of the facility that can still be cashed out, priced
   * at what it costs to cash out and annotated with whether the deposit wallet
   * or the frozen collateral can cover it.
   */
  async getCashoutOptions(creditId: string): Promise<CashoutOptions> {
    const credit = await this.creditRepo.findOne({ where: { id: creditId } });
    if (!credit) throw new NotFoundException("Credit not found");

    const base: CashoutOptions = {
      supported: true,
      reason: null,
      creditId: credit.id,
      creditCode: credit.creditCode,
      markPrice: 0,
      creditBaseSymbolId: credit.creditBaseSymbolId ?? null,
      collateralSymbolId: credit.collateralSymbolId ?? null,
      depositBalance: 0,
      collateralAvailable: 0,
      feePercent: Number(credit.cashoutFeePercent) || 0,
      collateralConversionPercent: 0,
      trades: [],
    };

    if (credit.status !== CreditStatusEnum.ACTIVE) {
      return { ...base, supported: false, reason: "CREDIT_NOT_ACTIVE" };
    }
    if (!credit.collateralSymbolId || !credit.creditBaseSymbolId || !credit.leverage) {
      return { ...base, supported: false, reason: "CASHOUT_NOT_SUPPORTED_FOR_LEGACY_CREDIT" };
    }

    const manager = this.creditRepo.manager;
    const collateralPair = await this.resolveCollateralPair(credit);
    const markPrice = this.markPriceOf(credit, collateralPair);
    const conversionPercent = collateralPair ? Number(collateralPair.sellCommission) || 0 : 0;
    const feePercent = Number(credit.cashoutFeePercent) || 0;
    const depositWallet = await manager.findOne(WalletEntity, {
      where: {
        userId: credit.userId,
        symbolId: credit.creditBaseSymbolId,
        walletType: WalletTypeEnum.DEPOSIT,
      },
    });
    const depositBalance = Number(depositWallet?.freeBalance) || 0;
    const collateralAvailable = await this.availableCollateral(manager, credit);
    const collateralBlockedReason = this.collateralSourceBlockedReason(credit, markPrice);

    const creditOrders = await this.creditOrderRepo.find({
      where: { creditId: credit.id },
      relations: { order: { pricePair: { baseSymbol: true, quoteSymbol: true } } },
      order: { createAt: "DESC" },
    });

    const creditWallets = await manager.find(WalletEntity, {
      where: { userId: credit.userId, walletType: WalletTypeEnum.CREDIT },
    });
    const heldBySymbol = new Map<string, number>();
    for (const w of creditWallets) heldBySymbol.set(w.symbolId, Number(w.freeBalance) || 0);

    const trades: CashoutTradeOption[] = [];
    for (const co of creditOrders) {
      if (!this.isCashoutCandidate(co)) continue;
      const priced = this.priceTrade(co);
      const assetHeld = priced.assetSymbolId ? heldBySymbol.get(priced.assetSymbolId) ?? 0 : 0;

      const feeAmount = new Decimal(priced.amount).mul(feePercent).div(100);
      const totalDue = new Decimal(priced.amount).plus(feeAmount);
      const requiredUnits = markPrice > 0 ? totalDue.div(markPrice).toNumber() : 0;
      const spreadProfit = new Decimal(requiredUnits).mul(conversionPercent).div(100).toNumber();
      const ratio =
        Number(credit.collateralAmount) > 0
          ? new Decimal(requiredUnits).div(Number(credit.collateralAmount))
          : new Decimal(0);
      const creditLimitReduction = ratio.mul(Number(credit.creditLimit) || 0).toNumber();
      const sellCapacityReduction = ratio
        .mul(new Decimal(Number(credit.collateralAmount) || 0).mul(Number(credit.leverage) || 1))
        .toNumber();

      const assetSufficient = new Decimal(assetHeld).greaterThanOrEqualTo(priced.assetAmount);
      trades.push({
        creditOrderId: co.id,
        orderId: co.orderId,
        orderCode: co.order?.orderCode || "",
        pairKey: priced.pairKey,
        executedQuantity: priced.quantity,
        price: priced.price,
        executedAt: co.order?.completedAt ?? null,
        amount: priced.amount,
        feePercent,
        feeAmount: feeAmount.toNumber(),
        totalDue: totalDue.toNumber(),
        systemProfitValue: feeAmount.plus(new Decimal(spreadProfit).mul(markPrice)).toNumber(),
        assetSymbolId: priced.assetSymbolId,
        assetSymbolSlug: priced.assetSymbolSlug,
        assetAmount: priced.assetAmount,
        assetHeld,
        eligible: assetSufficient,
        reason: assetSufficient ? null : "CASHOUT_ASSET_NOT_HELD",
        deposit: {
          required: totalDue.toNumber(),
          available: depositBalance,
          sufficient: new Decimal(depositBalance).greaterThanOrEqualTo(totalDue),
        },
        collateral: {
          requiredUnits,
          available: collateralAvailable,
          sufficient:
            !collateralBlockedReason &&
            requiredUnits > 0 &&
            new Decimal(collateralAvailable).greaterThanOrEqualTo(requiredUnits),
          blockedReason: collateralBlockedReason,
          creditLimitReduction,
          sellCapacityReduction,
          spreadProfit,
        },
      });
    }

    return {
      ...base,
      markPrice,
      depositBalance,
      collateralAvailable,
      collateralConversionPercent: conversionPercent,
      trades,
    };
  }

  /** Cash-out history of a facility (newest first) with its profit totals. */
  async findByCredit(creditId: string): Promise<{
    items: CreditCashoutEntity[];
    totals: CashoutTotals;
  }> {
    const items = await this.cashoutRepo.find({
      where: { creditId },
      order: { createAt: "DESC" },
    });
    return { items, totals: this.totalsOf(items) };
  }

  /**
   * Platform-wide cash-out KPIs for the admin credit dashboard: how much credit
   * was cashed out, how it was paid for, and what the platform earned on it.
   */
  async getStats(): Promise<CashoutTotals & { byDeposit: number; byCollateral: number }> {
    const items = await this.cashoutRepo.find();
    const totals = this.totalsOf(items);
    return {
      ...totals,
      byDeposit: items.filter((i) => i.source === CashoutSourceEnum.DEPOSIT).length,
      byCollateral: items.filter((i) => i.source === CashoutSourceEnum.COLLATERAL).length,
    };
  }

  private totalsOf(items: CreditCashoutEntity[]): CashoutTotals {
    const sum = (pick: (i: CreditCashoutEntity) => number) =>
      items.reduce((acc, i) => acc.plus(Number(pick(i)) || 0), new Decimal(0)).toNumber();
    return {
      count: items.length,
      volume: sum((i) => i.amount),
      fees: sum((i) => i.feeAmount),
      spreadProfit: sum((i) => i.spreadProfit),
      systemProfit: sum((i) => i.systemProfitValue),
      collateralConsumed: sum((i) => i.collateralConsumed),
      creditLimitReduction: sum((i) => i.creditLimitReduction),
    };
  }

  // ── write side ───────────────────────────────────────────────────────────

  /**
   * Cash out one credit purchase. Atomic and non-closing: the facility stays
   * ACTIVE and every other trade keeps running against it.
   */
  async cashout(
    creditId: string,
    params: { creditOrderId: string; source: CashoutSourceEnum; notes?: string },
    actor: CashoutActor = {},
  ): Promise<CreditCashoutEntity> {
    return this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new NotFoundException("Credit not found");
      if (credit.status !== CreditStatusEnum.ACTIVE) {
        throw new BadRequestException(`CASHOUT_CREDIT_NOT_ACTIVE: status ${credit.status}`);
      }
      if (!credit.collateralSymbolId || !credit.creditBaseSymbolId || !credit.leverage) {
        throw new BadRequestException("CASHOUT_NOT_SUPPORTED_FOR_LEGACY_CREDIT");
      }

      const co = await manager.findOne(CreditOrderEntity, {
        where: { id: params.creditOrderId, creditId: credit.id },
        relations: { order: { pricePair: { baseSymbol: true, quoteSymbol: true } } },
      });
      if (!co) throw new NotFoundException("Credit trade not found for this facility");
      if (co.status === CreditOrderStatusEnum.CASHED_OUT) {
        throw new BadRequestException("CASHOUT_ALREADY_DONE");
      }
      if (!this.isCashoutCandidate(co)) {
        throw new BadRequestException(
          "CASHOUT_TRADE_NOT_ELIGIBLE: only completed credit purchases (BUY) that are still " +
            "part of the facility can be cashed out",
        );
      }

      const priced = this.priceTrade(co);
      if (!(priced.amount > 0) || !priced.assetSymbolId || !(priced.assetAmount > 0)) {
        throw new BadRequestException("CASHOUT_TRADE_NOT_PRICEABLE");
      }

      const feePercent = Number(credit.cashoutFeePercent) || 0;
      const feeAmount = new Decimal(priced.amount).mul(feePercent).div(100);
      const totalDue = new Decimal(priced.amount).plus(feeAmount);

      const now = new Date();
      const wallets = new Map<string, WalletEntity>();
      const getWallet = async (symbolId: string, type: WalletTypeEnum, create = false) => {
        const key = `${type}:${symbolId}`;
        const cached = wallets.get(key);
        if (cached) return cached;
        let wallet = await manager.findOne(WalletEntity, {
          where: { userId: credit.userId, symbolId, walletType: type },
          lock: { mode: "pessimistic_write" },
        });
        if (!wallet) {
          if (!create) return null;
          wallet = manager.create(WalletEntity, {
            userId: credit.userId,
            symbolId,
            walletType: type,
            status: WalletStatusEnum.ACTIVE,
            freeBalance: 0,
            lockedBalance: 0,
            availableBalance: 0,
            creditBalance: 0,
            frozenFreeBalance: 0,
            frozenLockedBalance: 0,
          });
        }
        wallets.set(key, wallet);
        return wallet;
      };

      // ── 1. The purchased asset must still sit in the CREDIT wallet ────────
      const creditAssetWallet = await getWallet(priced.assetSymbolId, WalletTypeEnum.CREDIT);
      if (
        !creditAssetWallet ||
        new Decimal(creditAssetWallet.freeBalance || 0).lessThan(priced.assetAmount)
      ) {
        throw new BadRequestException(
          `CASHOUT_ASSET_NOT_HELD: this purchase needs ${priced.assetAmount} ${priced.assetSymbolSlug} ` +
            `in the credit wallet, but only ${Number(creditAssetWallet?.freeBalance) || 0} is available ` +
            `(it was traded away or is locked by an open order)`,
        );
      }

      const creditQuoteWallet = await getWallet(credit.creditBaseSymbolId, WalletTypeEnum.CREDIT);
      if (!creditQuoteWallet) {
        throw new BadRequestException("CASHOUT_CREDIT_WALLET_MISSING");
      }

      // ── 2. Take the purchase amount (plus the cash-out fee) from the source ─
      const collateralPair = await this.resolveCollateralPair(credit);
      const markPrice = this.markPriceOf(credit, collateralPair);
      let collateralConsumed = 0;
      let creditLimitReduction = 0;
      let sellCapacityReduction = 0;
      let spreadProfit = 0;

      if (params.source === CashoutSourceEnum.DEPOSIT) {
        const depositQuoteWallet = await getWallet(
          credit.creditBaseSymbolId,
          WalletTypeEnum.DEPOSIT,
        );
        if (
          !depositQuoteWallet ||
          new Decimal(depositQuoteWallet.freeBalance || 0).lessThan(totalDue)
        ) {
          throw new BadRequestException(
            `CASHOUT_INSUFFICIENT_DEPOSIT_BALANCE: ${totalDue.toFixed(2)} required ` +
              `(${priced.amount} purchase + ${feeAmount.toFixed(2)} fee), ` +
              `${Number(depositQuoteWallet?.freeBalance) || 0} available`,
          );
        }
        depositQuoteWallet.freeBalance = new Decimal(depositQuoteWallet.freeBalance)
          .minus(totalDue)
          .toNumber();
        await manager.save(depositQuoteWallet);
        await this.saveWalletTxn(manager, depositQuoteWallet, {
          amount: -totalDue.toNumber(),
          fee: feeAmount.toNumber(),
          description: `Credit ${credit.creditCode} cash-out of order ${priced.orderCode} paid from deposit wallet`,
          metadata: {
            creditId: credit.id,
            creditOrderId: co.id,
            fee: feeAmount.toNumber(),
            feePercent,
            type: "CASHOUT_PAYMENT_DEPOSIT",
          },
        });
      } else {
        const blocked = this.collateralSourceBlockedReason(credit, markPrice);
        if (blocked) throw new BadRequestException(blocked);

        const collateralWallet = await getWallet(
          credit.collateralSymbolId,
          WalletTypeEnum.COLLATERAL,
        );
        const requiredUnits = totalDue.div(markPrice);
        const available = await this.availableCollateral(manager, credit);
        if (
          !collateralWallet ||
          requiredUnits.greaterThan(available) ||
          requiredUnits.greaterThan(Number(collateralWallet.freeBalance) || 0)
        ) {
          throw new BadRequestException(
            `CASHOUT_INSUFFICIENT_COLLATERAL: ${requiredUnits.toFixed(8)} units required at the ` +
              `current price, ${available} available (collateral backing open trades cannot be used)`,
          );
        }

        const collateralBefore = new Decimal(credit.collateralAmount || 0);
        const ratio = collateralBefore.greaterThan(0)
          ? requiredUnits.div(collateralBefore)
          : new Decimal(0);
        const irCut = ratio.mul(Number(credit.creditLimit) || 0);
        const sellCapacityWallet = await getWallet(
          credit.collateralSymbolId,
          WalletTypeEnum.CREDIT,
        );
        const sellCut = sellCapacityWallet
          ? ratio.mul(Number(sellCapacityWallet.creditBalance) || 0)
          : new Decimal(0);

        // The credit backed by the consumed collateral disappears with it, so
        // the facility must still be able to give that capacity up after the
        // repayment is credited back.
        const quoteFreeAfter = new Decimal(creditQuoteWallet.freeBalance || 0)
          .plus(priced.amount)
          .minus(irCut);
        if (quoteFreeAfter.lessThan(0)) {
          throw new BadRequestException(
            `CASHOUT_INSUFFICIENT_CAPACITY: paying from collateral removes ${irCut.toFixed(2)} of ` +
              `credit limit, which exceeds the facility's unused credit. Pay from your deposit ` +
              `wallet or close open credit positions first.`,
          );
        }
        if (sellCapacityWallet) {
          const sellFreeAfter = new Decimal(sellCapacityWallet.freeBalance || 0)
            .minus(sellCut)
            .minus(
              sellCapacityWallet === creditAssetWallet ? new Decimal(priced.assetAmount) : new Decimal(0),
            );
          if (sellFreeAfter.lessThan(0)) {
            throw new BadRequestException(
              `CASHOUT_INSUFFICIENT_CAPACITY: paying from collateral removes ${sellCut.toFixed(8)} ` +
                `${priced.assetSymbolSlug} of sell capacity, which exceeds the unused capacity of the ` +
                `credit wallet. Pay from your deposit wallet or close open credit positions first.`,
            );
          }
        }

        collateralWallet.freeBalance = new Decimal(collateralWallet.freeBalance)
          .minus(requiredUnits)
          .toNumber();
        await manager.save(collateralWallet);
        await this.saveWalletTxn(manager, collateralWallet, {
          amount: -requiredUnits.toNumber(),
          description: `Credit ${credit.creditCode} cash-out of order ${priced.orderCode} paid from frozen collateral`,
          metadata: {
            creditId: credit.id,
            creditOrderId: co.id,
            markPrice,
            fee: feeAmount.toNumber(),
            feePercent,
            type: "CASHOUT_PAYMENT_COLLATERAL",
          },
        });

        // Converting collateral into the credit currency is a sell for the
        // user: the platform books its sell commission on it, in collateral
        // units, exactly as it does on a SELL order.
        const conversionPercent = collateralPair ? Number(collateralPair.sellCommission) || 0 : 0;
        spreadProfit = requiredUnits.mul(conversionPercent).div(100).toNumber();

        // Shrink the facility with the collateral that left it.
        const initialUnitValue = collateralBefore.greaterThan(0)
          ? new Decimal(credit.initialCollateralValue || 0).div(collateralBefore)
          : new Decimal(0);
        const collateralAfter = collateralBefore.minus(requiredUnits);
        credit.collateralAmount = collateralAfter.toNumber();
        credit.initialCollateralValue = Decimal.max(
          0,
          new Decimal(credit.initialCollateralValue || 0).minus(
            requiredUnits.mul(initialUnitValue),
          ),
        ).toNumber();
        credit.currentCollateralValue = collateralAfter.mul(markPrice).toNumber();
        credit.creditLimit = Decimal.max(
          0,
          new Decimal(credit.creditLimit || 0).minus(irCut),
        ).toNumber();
        credit.amount = Decimal.max(0, new Decimal(credit.amount || 0).minus(irCut)).toNumber();

        creditQuoteWallet.creditBalance = Decimal.max(
          0,
          new Decimal(creditQuoteWallet.creditBalance || 0).minus(irCut),
        ).toNumber();
        creditQuoteWallet.freeBalance = new Decimal(creditQuoteWallet.freeBalance)
          .minus(irCut)
          .toNumber();
        if (sellCapacityWallet && sellCut.greaterThan(0)) {
          sellCapacityWallet.creditBalance = Decimal.max(
            0,
            new Decimal(sellCapacityWallet.creditBalance || 0).minus(sellCut),
          ).toNumber();
          sellCapacityWallet.freeBalance = new Decimal(sellCapacityWallet.freeBalance)
            .minus(sellCut)
            .toNumber();
          await manager.save(sellCapacityWallet);
        }

        collateralConsumed = requiredUnits.toNumber();
        creditLimitReduction = irCut.toNumber();
        sellCapacityReduction = sellCut.toNumber();
      }

      // ── 3. Give the repaid credit back to the facility ────────────────────
      creditQuoteWallet.freeBalance = new Decimal(creditQuoteWallet.freeBalance)
        .plus(priced.amount)
        .toNumber();
      await manager.save(creditQuoteWallet);
      await this.saveWalletTxn(manager, creditQuoteWallet, {
        amount: priced.amount,
        description: `Credit ${credit.creditCode} repaid by cash-out of order ${priced.orderCode}`,
        metadata: {
          creditId: credit.id,
          creditOrderId: co.id,
          source: params.source,
          type: "CASHOUT_CREDIT_REPAID",
        },
      });

      // ── 3b. Book the platform's profit on this cash-out ───────────────────
      if (feeAmount.greaterThan(0)) {
        await manager.save(SystemLedgerEntity, {
          symbolId: credit.creditBaseSymbolId,
          type: SystemLedgerType.CREDIT_CASHOUT_FEE,
          amount: feeAmount.toNumber(),
          orderId: co.orderId,
          userId: credit.userId,
          description:
            `Cash-out fee ${feePercent}% on credit ${credit.creditCode} trade ${priced.orderCode}`,
        });
      }
      if (spreadProfit > 0) {
        await manager.save(SystemLedgerEntity, {
          symbolId: credit.collateralSymbolId,
          type: SystemLedgerType.CREDIT_CASHOUT_SPREAD,
          amount: spreadProfit,
          orderId: co.orderId,
          userId: credit.userId,
          description:
            `Collateral conversion commission on credit ${credit.creditCode} cash-out of ` +
            `trade ${priced.orderCode}`,
        });
      }

      // ── 4. Move the purchased asset CREDIT → DEPOSIT ──────────────────────
      creditAssetWallet.freeBalance = new Decimal(creditAssetWallet.freeBalance)
        .minus(priced.assetAmount)
        .toNumber();
      await manager.save(creditAssetWallet);
      const depositAssetWallet = await getWallet(
        priced.assetSymbolId,
        WalletTypeEnum.DEPOSIT,
        true,
      );
      depositAssetWallet.freeBalance = new Decimal(depositAssetWallet.freeBalance || 0)
        .plus(priced.assetAmount)
        .toNumber();
      await manager.save(depositAssetWallet);
      await this.saveWalletTxn(manager, depositAssetWallet, {
        amount: priced.assetAmount,
        description:
          `Credit purchase ${priced.orderCode} cashed out: ${priced.assetAmount} ` +
          `${priced.assetSymbolSlug} released to your deposit wallet`,
        metadata: {
          creditId: credit.id,
          creditOrderId: co.id,
          source: params.source,
          type: "CASHOUT_ASSET_RELEASED",
        },
      });

      // ── 5. Take the trade out of the facility ─────────────────────────────
      co.status = CreditOrderStatusEnum.CASHED_OUT;
      await manager.save(co);
      await this.releaseTradeCollateralLocks(manager, co.id, now);

      credit.usedCredit = await this.recomputeUsedCredit(manager, credit.id);
      const savedCredit = await manager.save(credit);

      const cashout = await manager.save(
        manager.create(CreditCashoutEntity, {
          creditId: credit.id,
          creditOrderId: co.id,
          orderId: co.orderId,
          source: params.source,
          amount: priced.amount,
          feePercent,
          feeAmount: feeAmount.toNumber(),
          spreadProfit,
          systemProfitValue: feeAmount
            .plus(new Decimal(spreadProfit).mul(markPrice || 0))
            .toNumber(),
          assetSymbolId: priced.assetSymbolId,
          assetAmount: priced.assetAmount,
          collateralConsumed,
          markPrice,
          creditLimitReduction,
          sellCapacityReduction,
          requestedBy: actor.userId ?? null,
          adminId: actor.adminId ?? null,
          notes: params.notes ?? null,
          metadata: {
            orderCode: priced.orderCode,
            pairKey: priced.pairKey,
            executedQuantity: priced.quantity,
            price: priced.price,
            assetSymbolSlug: priced.assetSymbolSlug,
            totalDue: totalDue.toNumber(),
            creditLimitAfter: savedCredit.creditLimit,
            collateralAmountAfter: savedCredit.collateralAmount,
            usedCreditAfter: savedCredit.usedCredit,
          },
        }),
      );

      await manager.save(
        manager.create(FinanceLogEntity, {
          adminId: actor.adminId ?? null,
          userId: credit.userId,
          creditId: credit.id,
          orderId: co.orderId,
          actionType: CreditActionEnum.CREDIT_CASHED_OUT,
          description:
            `Credit ${credit.creditCode}: purchase ${priced.orderCode} cashed out for ` +
            `${priced.amount} from ${params.source}. Released ${priced.assetAmount} ` +
            `${priced.assetSymbolSlug} to the deposit wallet.`,
          metadata: {
            source: params.source,
            amount: priced.amount,
            feeAmount: feeAmount.toNumber(),
            spreadProfit,
            assetAmount: priced.assetAmount,
            collateralConsumed,
            creditLimitReduction,
            sellCapacityReduction,
          },
          actionTime: now,
        }),
      );

      await manager.save(
        manager.create(CreditNotificationEntity, {
          userId: credit.userId,
          creditId: credit.id,
          type: CreditNotificationTypeEnum.SETTLEMENT,
          message:
            `Purchase ${priced.orderCode} was cashed out: ${priced.assetAmount} ` +
            `${priced.assetSymbolSlug} moved to your deposit wallet and ${priced.amount} of credit ` +
            `was repaid from your ${params.source === CashoutSourceEnum.DEPOSIT ? "deposit wallet" : "collateral"}.`,
          sentAt: now,
        }),
      );

      this.eventEmitter.emit(CreditEvents.CASHED_OUT, {
        userId: credit.userId,
        creditId: credit.id,
        creditOrderId: co.id,
        source: params.source,
        amount: priced.amount,
        assetAmount: priced.assetAmount,
      });

      this.logger.log(
        `Credit ${credit.creditCode}: cashed out trade ${priced.orderCode} for ${priced.amount} ` +
          `from ${params.source} (asset ${priced.assetAmount} ${priced.assetSymbolSlug}, ` +
          `collateral consumed ${collateralConsumed})`,
      );

      return cashout;
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  /** Only completed credit purchases still belonging to the facility qualify. */
  private isCashoutCandidate(co: CreditOrderEntity): boolean {
    const o = co.order;
    if (!o) return false;
    if (o.side !== OrderSideEnum.BUY) return false;
    if (String(o.status) !== "COMPLETED") return false;
    if (!(Number(o.executedQuantity) > 0)) return false;
    return (
      co.status !== CreditOrderStatusEnum.CASHED_OUT &&
      co.status !== CreditOrderStatusEnum.CANCELLED &&
      co.status !== CreditOrderStatusEnum.CLOSED
    );
  }

  /**
   * What the trade drew from the credit line and what it put into the CREDIT
   * wallet — mirrored exactly from `WalletOrderService.confirmOrderExecution`
   * so a cash-out moves the same amounts back.
   */
  private priceTrade(co: CreditOrderEntity): {
    quantity: number;
    price: number;
    amount: number;
    assetSymbolId: string | null;
    assetSymbolSlug: string;
    assetAmount: number;
    orderCode: string;
    pairKey: string;
  } {
    const o = co.order;
    const pair = o.pricePair;
    const quantity = Number(o.executedQuantity) || 0;
    const price = Number(o.price) || Number(co.priceAtOrderTime) || 0;
    const isQuote = o.orderType === OrderTypeEnum.QUOTE;
    const buyRate = Number(pair?.buyCommission) || 0;

    // QUOTE buys pay the commission in the quote currency and receive the full
    // quantity; MARKET/LIMIT buys pay quantity × price and receive the quantity
    // net of commission.
    const amount = isQuote
      ? new Decimal(quantity).mul(price).plus(Number(o.commission) || 0).toNumber()
      : new Decimal(quantity).mul(price).toNumber();
    const assetAmount = isQuote
      ? quantity
      : new Decimal(quantity).mul(new Decimal(1).minus(new Decimal(buyRate).div(100))).toNumber();

    return {
      quantity,
      price,
      amount,
      assetSymbolId: pair?.baseId || pair?.baseSymbol?.id || null,
      assetSymbolSlug: pair?.baseSymbol?.slug || "",
      assetAmount,
      orderCode: o.orderCode,
      pairKey: pair ? `${pair.baseSymbol?.slug}/${pair.quoteSymbol?.slug}` : "?",
    };
  }

  /** Collateral not already reserved by an open credit trade. */
  private async availableCollateral(manager: any, credit: CreditEntity): Promise<number> {
    const locks = await manager.find(CollateralLockEntity, { where: { creditId: credit.id } });
    let locked = new Decimal(0);
    for (const lock of locks) {
      if (
        lock.status === CollateralLockStatusEnum.ACTIVE ||
        lock.status === CollateralLockStatusEnum.RELEASE_PENDING ||
        lock.status === CollateralLockStatusEnum.CREATED
      ) {
        locked = locked.plus(Number(lock.amount) || 0);
      }
    }
    const wallet = await manager.findOne(WalletEntity, {
      where: {
        userId: credit.userId,
        symbolId: credit.collateralSymbolId,
        walletType: WalletTypeEnum.COLLATERAL,
      },
    });
    const held = Decimal.min(
      new Decimal(credit.collateralAmount || 0),
      new Decimal(Number(wallet?.freeBalance) || 0),
    );
    return Decimal.max(0, held.minus(locked)).toNumber();
  }

  /** Why the collateral source is unavailable right now, if it is. */
  private collateralSourceBlockedReason(credit: CreditEntity, markPrice: number): string | null {
    if (!(markPrice > 0)) return "CREDIT_NO_MARK_PRICE";
    if (credit.isInDefault) return "CASHOUT_COLLATERAL_BLOCKED_DEFAULT";
    if (credit.riskState === RiskStateEnum.MARGIN_CALL) {
      return "CASHOUT_COLLATERAL_BLOCKED_MARGIN_CALL";
    }
    return null;
  }

  /** The collateral ↔ credit-currency pair (null when they are the same symbol). */
  private async resolveCollateralPair(credit: CreditEntity): Promise<PricePairEntity | null> {
    if (!credit.collateralSymbolId || !credit.creditBaseSymbolId) return null;
    if (credit.collateralSymbolId === credit.creditBaseSymbolId) return null;
    return this.pricePairRepo.findOne({
      where: {
        baseId: credit.collateralSymbolId,
        quoteId: credit.creditBaseSymbolId,
        isValid: true,
      },
    });
  }

  /** Collateral mark price — the price the user's collateral converts at. */
  private markPriceOf(credit: CreditEntity, pair: PricePairEntity | null): number {
    if (!credit.collateralSymbolId || !credit.creditBaseSymbolId) return 0;
    if (credit.collateralSymbolId === credit.creditBaseSymbolId) return 1;
    const price = pair ? Number(pair.bestSellGramPrice) || Number(pair.bestSellPrice) || 0 : 0;
    return price > 0 ? price : 0;
  }

  /** Free the per-trade collateral lock of a trade that left the facility. */
  private async releaseTradeCollateralLocks(
    manager: any,
    creditOrderId: string,
    now: Date,
  ): Promise<void> {
    const locks = await manager.find(CollateralLockEntity, { where: { creditOrderId } });
    for (const lock of locks) {
      if (
        lock.status !== CollateralLockStatusEnum.ACTIVE &&
        lock.status !== CollateralLockStatusEnum.RELEASE_PENDING &&
        lock.status !== CollateralLockStatusEnum.CREATED
      ) {
        continue;
      }
      lock.status = CollateralLockStatusEnum.RELEASED;
      lock.releasedAt = now;
      lock.metadata = { ...(lock.metadata || {}), releasedBy: "CASHOUT" };
      await manager.save(lock);
    }
  }

  /** Used credit of the facility, excluding cashed-out trades. */
  private async recomputeUsedCredit(manager: any, creditId: string): Promise<number> {
    const rows = await manager.find(CreditOrderEntity, {
      where: { creditId },
      relations: { order: true },
    });
    let total = new Decimal(0);
    for (const row of rows) {
      const o = row.order;
      if (!o || String(o.status) !== "COMPLETED") continue;
      if (row.status === CreditOrderStatusEnum.CASHED_OUT) continue;
      const price = Number(o.price) || Number(row.priceAtOrderTime) || 0;
      const qty = Number(o.executedQuantity) > 0 ? Number(o.executedQuantity) : Number(o.quantity || 0);
      total = total.plus(new Decimal(qty).mul(price));
    }
    return total.toNumber();
  }

  private async saveWalletTxn(
    manager: any,
    wallet: WalletEntity,
    params: { amount: number; description: string; fee?: number; metadata?: any },
  ): Promise<void> {
    await manager.save(
      manager.create(TransactionEntity, {
        walletId: wallet.id,
        transactionId: `TXN-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
        transactionType: TransactionTypeEnum.CREDIT_SETTLEMENT,
        status: TransactionStatusEnum.COMPLETED,
        amount: params.amount,
        fee: params.fee || 0,
        description: params.description,
        metadata: params.metadata,
        completedAt: new Date(),
      }),
    );
  }
}
