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
import { CreditNotificationEntity } from "../entity/credit-notification.entity";
import { CollateralLockEntity } from "../entity/collateral-lock.entity";
import { CreditStatusEnum } from "../enum/credit-status.enum";
import { CreditOrderStatusEnum } from "../enum/credit-order-status.enum";
import { CollateralLockStatusEnum } from "../enum/collateral-lock-status.enum";
import { CreditNotificationTypeEnum } from "../enum/credit-notification-type.enum";
import { SettlementStateEnum } from "../enum/settlement-state.enum";
import { RiskStateEnum } from "../enum/risk-state.enum";
import { CreditActionEnum } from "../enum/credit-action.enum";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { WalletTypeEnum } from "../../wallet/enum/wallet-type.enum";
import { WalletStatusEnum } from "../../wallet/enum/wallet-status.enum";
import { TransactionEntity } from "../../wallet/entities/transaction.entity";
import { TransactionTypeEnum } from "../../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../../wallet/enum/transaction.status.enum";
import { PricePairEntity } from "../../admin-pair/entity/price.pair.entity";
import { OrderEntity } from "../../order/order.entity";
import { OrderStatusEnum } from "../../order/enum/order.status.enum";
import { OrderSideEnum } from "../../order/enum/order.side.enum";
import { FinanceLogEntity } from "../../finance-log/entity/finance-log.entity";
import { MESQAL_TO_GRAM } from "../../common/constants";
import { CreditEvents } from "../../shared/constants/events.constants";
import { WalletOrderService } from "../../wallet/services/wallet-order.service";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP, toExpNeg: -7, toExpPos: 21 });

export type SettlementMode = "USER_SELF" | "ADMIN" | "DRAWDOWN" | "MARGIN_CALL" | "EXPIRY" | "FORCE";

export interface SettlementOptions {
  mode: SettlementMode;
  adminId?: string | null;
  reason?: string;
  notes?: string;
  imagePath?: string;
  allowDepositTopUp?: boolean;
  /**
   * Bypasses the "no outstanding shortfall" gate on voluntary settlement
   * (USER_SELF/ADMIN). Only meaningful for ADMIN mode — never honoured for
   * USER_SELF, so a user can never self-settle into default. Every use is
   * recorded on the settlement's finance-log entry for audit.
   */
  force?: boolean;
}

export interface SettlementEligibility {
  eligible: boolean;
  legacy: boolean;
  markPrice: number | null;
  positions: BaseSymbolPosition[];
  netEquity: number;
  deficit: number;
  shortfall: number;
  collateralValue: number;
}

export interface BaseSymbolPosition {
  symbolId: string;
  baseSymbolSlug: string;
  netXau: number;
  markPrice: number;
}

export interface SettlementState {
  markPrice: number;
  collateralValue: number;
  borrowedIr: number;
  sellRevenueIr: number;
  netIr: number;
  positions: BaseSymbolPosition[];
  netEquity: number;
  exposure: number;
  equity: number;
  marginRatio: number | null;
  orders: Array<{
    orderId: string;
    orderCode: string;
    side: string;
    executedQuantity: number;
    price: number;
    pairKey: string;
  }>;
}

export interface SettlementResult extends SettlementState {
  releaseIr: number;
  releaseXau: Record<string, number>;
  deficit: number;
  consumedCollateral: number;
  shortfall: number;
}

/**
 * Credit Settlement Engine
 * ------------------------
 * Settles the ACTUAL economic position of a credit facility — what was
 * borrowed (via credit BUY / SELL orders) vs what is held — at the current
 * mark price. Surplus is released to the DEPOSIT wallet; a deficit is covered
 * from collateral (full recourse for any residue).
 *
 * The engine is the single settlement entry point for:
 *   - user self-settlement      (USER_SELF, deposit top-up allowed)
 *   - admin settlement          (ADMIN)
 *   - drawdown enforcement      (DRAWDOWN)
 *   - margin-call liquidation   (MARGIN_CALL)
 *   - expiry                    (EXPIRY)
 *
 * It is idempotent: the facility is locked pessimistically and guarded on
 * status == ACTIVE, so repeated calls are no-ops.
 */
@Injectable()
export class CreditSettlementService {
  private readonly logger = new Logger(CreditSettlementService.name);

  constructor(
    @InjectRepository(CreditEntity)
    private readonly creditRepo: Repository<CreditEntity>,
    @InjectRepository(CreditOrderEntity)
    private readonly creditOrderRepo: Repository<CreditOrderEntity>,
    @InjectRepository(CreditNotificationEntity)
    private readonly creditNotificationRepo: Repository<CreditNotificationEntity>,
    @InjectRepository(CollateralLockEntity)
    private readonly collateralLockRepo: Repository<CollateralLockEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(PricePairEntity)
    private readonly pricePairRepo: Repository<PricePairEntity>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
    private readonly walletOrderService: WalletOrderService,
  ) {}

  /**
   * Compute the settlement state (obligations, positions, equity, margin) for
   * an active facility without mutating anything. Used by the risk engine and
   * admin P&L views.
   */
  async computeState(credit: CreditEntity, manager?: any): Promise<SettlementResult> {
    const em = manager || this.creditRepo.manager;
    const markPrice = await this.resolveMarkPrice(em, credit);
    if (!markPrice || markPrice <= 0) {
      throw new BadRequestException("CREDIT_NO_MARK_PRICE");
    }

    const creditOrders = await em.find(CreditOrderEntity, {
      where: { creditId: credit.id },
      relations: { order: { pricePair: { baseSymbol: true, quoteSymbol: true } } },
    });

    const markPrices = await this.resolveBaseMarkPrices(em, credit, creditOrders, markPrice);
    return this.computeFromOrders(credit, creditOrders, markPrice, markPrices);
  }

  /**
   * Preview whether a facility's voluntary settlement would succeed right now,
   * without mutating anything. Mirrors the shortfall computation used inside
   * settleCreditInternal (the same "credit wallets must net to zero or
   * positive after collateral" rule) so callers/UI can show the gate — and
   * what's still owed per symbol — before the user hits Settle.
   */
  async previewSettlementEligibility(credit: CreditEntity): Promise<SettlementEligibility> {
    if (!credit.collateralSymbolId || !credit.creditBaseSymbolId || !credit.leverage) {
      // Legacy (v1) facilities have no mark-to-market valuation to gate on.
      return {
        eligible: true,
        legacy: true,
        markPrice: null,
        positions: [],
        netEquity: 0,
        deficit: 0,
        shortfall: 0,
        collateralValue: 0,
      };
    }

    const manager = this.creditRepo.manager;
    const markPrice = await this.resolveMarkPrice(manager, credit);
    if (!markPrice || markPrice <= 0) {
      throw new BadRequestException("CREDIT_NO_MARK_PRICE");
    }

    const creditOrders = await manager.find(CreditOrderEntity, {
      where: { creditId: credit.id },
      relations: { order: { pricePair: { baseSymbol: true, quoteSymbol: true } } },
    });
    const markPrices = await this.resolveBaseMarkPrices(manager, credit, creditOrders, markPrice);
    const result = this.computeFromOrders(credit, creditOrders, markPrice, markPrices);

    return {
      eligible: result.shortfall <= 0,
      legacy: false,
      markPrice,
      positions: result.positions,
      netEquity: result.netEquity,
      deficit: result.deficit,
      shortfall: result.shortfall,
      collateralValue: result.collateralValue,
    };
  }

  /**
   * Perform settlement (or force liquidation) of a credit facility.
   */
  async settleCredit(creditId: string, opts: SettlementOptions): Promise<CreditEntity> {
    return this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new NotFoundException("Credit not found");
      return this.settleCreditInternal(manager, credit, opts);
    });
  }

  /**
   * Transaction-scoped settlement. The caller owns the transaction and must
   * pass a pessimistically-locked CreditEntity. Used by the delivery-based
   * settlement workflow so the value transfer stays in the workflow's
   * transaction.
   */
  async settleCreditInTransaction(
    manager: any,
    credit: CreditEntity,
    opts: SettlementOptions,
  ): Promise<CreditEntity> {
    if (!credit) throw new NotFoundException("Credit not found");
    return this.settleCreditInternal(manager, credit, opts);
  }

  private async settleCreditInternal(
    manager: any,
    credit: CreditEntity,
    opts: SettlementOptions,
  ): Promise<CreditEntity> {
    if (
      credit.status !== CreditStatusEnum.ACTIVE &&
      credit.status !== CreditStatusEnum.SUSPENDED &&
      credit.status !== CreditStatusEnum.EXPIRED
    ) {
      throw new BadRequestException(`Cannot settle credit with status ${credit.status}`);
    }

      // Legacy (admin-created) facilities have no collateral/leverage snapshot —
      // settle them by voiding the credit line and returning the frozen
      // collateral, without the mark-to-market valuation used for v2 facilities.
      if (!credit.collateralSymbolId || !credit.creditBaseSymbolId || !credit.leverage) {
        return this.settleLegacyCredit(manager, credit, opts, new Date());
      }

      const markPrice = await this.resolveMarkPrice(manager, credit);
      if (!markPrice || markPrice <= 0) {
        throw new BadRequestException("CREDIT_NO_MARK_PRICE");
      }

      const now = new Date();

      // 1. Cancel open credit orders and release their frozen balances so the
      //    executed portion (already settled into the wallets) is the only part
      //    we value.
      const creditOrders = await manager.find(CreditOrderEntity, {
        where: { creditId: credit.id },
        relations: { order: { pricePair: { baseSymbol: true, quoteSymbol: true } } },
      });
      for (const co of creditOrders) {
        const o = co.order;
        if (!o) continue;
        if (o.status === OrderStatusEnum.PENDING || o.status === OrderStatusEnum.PARTIALLY_COMPLETED) {
          try {
            if (o.pricePair) {
              await this.walletOrderService.unlockOrder(manager, o, o.pricePair, OrderStatusEnum.CANCELLED);
            } else {
              o.status = OrderStatusEnum.CANCELLED as any;
              o.cancelledAt = now;
              await manager.save(o);
            }
          } catch (error) {
            // The settlement zeroes the CREDIT wallets below, so an already
            // frozen wallet does not need its lock released explicitly.
            o.status = OrderStatusEnum.CANCELLED as any;
            o.cancelledAt = now;
            await manager.save(o);
          }
          if (co.status === CreditOrderStatusEnum.ACTIVE) {
            co.status = CreditOrderStatusEnum.CANCELLED;
            await manager.save(co);
          }
        }
      }

      // 2. Compute the economic state from executed orders.
      const markPrices = await this.resolveBaseMarkPrices(manager, credit, creditOrders, markPrice);
      const result = this.computeFromOrders(credit, creditOrders, markPrice, markPrices);
      let deficit = result.deficit;
      let consumedCollateral = result.consumedCollateral;
      let shortfall = result.shortfall;
      const releaseIr = result.releaseIr;
      const releaseXau = result.releaseXau;

      // 3. USER_SELF: allow the user to top-up a deficit from their DEPOSIT IRR
      //    wallet before collateral is consumed.
      if (opts.allowDepositTopUp && deficit > 0 && credit.creditBaseSymbolId) {
        const deposit = await manager.findOne(WalletEntity, {
          where: { userId: credit.userId, symbolId: credit.creditBaseSymbolId, walletType: WalletTypeEnum.DEPOSIT },
          lock: { mode: "pessimistic_write" },
        });
        if (deposit && Number(deposit.freeBalance) >= deficit) {
          deposit.freeBalance = new Decimal(deposit.freeBalance).minus(deficit).toNumber();
          await manager.save(deposit);

          await this.logFinanceAction(manager, {
            adminId: opts.adminId ?? null,
            userId: credit.userId,
            creditId: credit.id,
            actionType: CreditActionEnum.CREDIT_SETTLED,
            description: `Credit ${credit.creditCode} deficit of ${deficit} covered from deposit wallet`,
            metadata: { coveredFromDeposit: deficit },
          });

          deficit = 0;
          consumedCollateral = 0;
          shortfall = 0;
        }
      }

      // 3b. Voluntary settlement (USER_SELF / ADMIN) requires the facility's
      // credit wallets to net to zero or positive — i.e. no shortfall left
      // uncovered even after collateral. FORCE/EXPIRY/MARGIN_CALL/DRAWDOWN
      // liquidations must still be allowed to complete when underwater —
      // that's their entire purpose (closing out a defaulting position), so
      // they are exempt. ADMIN mode may bypass with an explicit, audited
      // `force` flag; USER_SELF can never bypass this.
      const isVoluntary = opts.mode === "USER_SELF" || opts.mode === "ADMIN";
      if (isVoluntary && shortfall > 0 && !(opts.mode === "ADMIN" && opts.force)) {
        throw new BadRequestException(
          `CREDIT_NOT_SETTLEABLE_NEGATIVE_POSITION: outstanding shortfall of ${shortfall.toFixed(2)} ` +
          `remains after collateral. Buy back the sold position or top up your deposit wallet so all ` +
          `credit wallets net to zero or positive before this credit can be settled.`,
        );
      }

      // 4. Zero the CREDIT wallets (the credit line is removed on settlement).
      const creditWallets = await manager.find(WalletEntity, {
        where: { userId: credit.userId, walletType: WalletTypeEnum.CREDIT },
        lock: { mode: "pessimistic_write" },
      });
      for (const cw of creditWallets) {
        if (cw.creditBalance || cw.freeBalance || cw.lockedBalance) {
          cw.creditBalance = 0;
          cw.freeBalance = 0;
          cw.lockedBalance = 0;
          await manager.save(cw);
        }
      }

      // 5. Release the surplus to the DEPOSIT wallets (in-kind + IRR).
      if (releaseIr > 0) {
        const deposit = await this.getDepositWallet(manager, credit.userId, credit.creditBaseSymbolId);
        deposit.freeBalance = new Decimal(deposit.freeBalance).plus(releaseIr).toNumber();
        await manager.save(deposit);
        await this.saveWalletTxn(manager, deposit, {
          amount: releaseIr,
          description: `Credit ${credit.creditCode} settlement surplus (${releaseIr} IRR)`,
          metadata: { creditId: credit.id, mode: opts.mode, type: "SURPLUS_IRR" },
        });
      }
      for (const [symbolId, amount] of Object.entries(releaseXau)) {
        if (!(amount > 0)) continue;
        const deposit = await this.getDepositWallet(manager, credit.userId, symbolId);
        deposit.freeBalance = new Decimal(deposit.freeBalance).plus(amount).toNumber();
        await manager.save(deposit);
        await this.saveWalletTxn(manager, deposit, {
          amount,
          description: `Credit ${credit.creditCode} settlement surplus (${amount} base asset)`,
          metadata: { creditId: credit.id, mode: opts.mode, type: "SURPLUS_XAU", symbolId },
        });
      }

      // 6. Consume collateral for any deficit; return the remainder.
      await this.applyCollateral(
        manager,
        credit,
        consumedCollateral,
        deficit,
        shortfall,
        opts,
        now,
      );

      // 6b. Release/consume per-trade collateral locks (handoff §13). Any lock
      // that is ACTIVE/RELEASE_PENDING is released back to Collateral Available;
      // if the settlement consumed collateral, an equivalent portion of locks is
      // consumed instead of released.
      await this.settleCollateralLocks(manager, credit, consumedCollateral, now);

      // 6c. Close the facility's open credit trades (handoff §13: CLOSED).
      const openCreditOrders = await manager.find(CreditOrderEntity, {
        where: { creditId: credit.id },
      });
      for (const co of openCreditOrders) {
        if (
          co.status !== CreditOrderStatusEnum.CANCELLED &&
          co.status !== CreditOrderStatusEnum.CLOSED
        ) {
          co.status = CreditOrderStatusEnum.CLOSED;
          await manager.save(co);
        }
      }

      // 7. Mark the facility settled.
      credit.status = CreditStatusEnum.SETTLED;
      credit.settledAt = now;
      credit.settlementState = SettlementStateEnum.SETTLED;
      credit.usedCredit = result.borrowedIr;
      credit.notes = opts.notes || credit.notes;
      if (opts.adminId) credit.settledByAdminId = opts.adminId;
      if (opts.imagePath) credit.settleImagePath = opts.imagePath;
      credit.outstandingShortfall = shortfall;
      credit.isInDefault = shortfall > 0;
      if (shortfall > 0) {
        credit.riskState = RiskStateEnum.DEFAULT;
        credit.metadata = {
          ...(credit.metadata || {}),
          defaultReason: "SETTLEMENT_SHORTFALL",
        };
      }
      credit.metadata = {
        ...(credit.metadata || {}),
        settleReason: opts.reason || opts.mode,
        settledAt: now.toISOString(),
        settlement: {
          mode: opts.mode,
          markPrice: result.markPrice,
          borrowedIr: result.borrowedIr,
          sellRevenueIr: result.sellRevenueIr,
          netIr: result.netIr,
          netEquity: result.netEquity,
          exposure: result.exposure,
          collateralValue: result.collateralValue,
          releaseIr,
          releaseXau,
          deficit,
          consumedCollateral,
          shortfall,
          positions: result.positions,
        },
      };
      const saved = await manager.save(credit);

      await this.logFinanceAction(manager, {
        adminId: opts.adminId ?? null,
        userId: credit.userId,
        creditId: credit.id,
        actionType: CreditActionEnum.CREDIT_SETTLED,
        description:
          `Credit ${credit.creditCode} settled (${opts.mode}${opts.force ? ", FORCED past shortfall gate" : ""}). ` +
          `netIr ${result.netIr}, netEquity ${result.netEquity}, surplus ${releaseIr}, deficit ${deficit}, ` +
          `collateral consumed ${consumedCollateral}, shortfall ${shortfall}`,
        metadata: { mode: opts.mode, settlement: result, consumedCollateral, shortfall, force: !!opts.force },
      });

      await manager.save(
        manager.create(CreditNotificationEntity, {
          userId: credit.userId,
          creditId: credit.id,
          type: CreditNotificationTypeEnum.SETTLEMENT,
          message: this.settlementMessage(credit, result, deficit, shortfall),
          sentAt: now,
        }),
      );

      this.eventEmitter.emit(CreditEvents.SETTLED, {
        userId: credit.userId,
        creditId: credit.id,
        reason: opts.reason || opts.mode,
        mode: opts.mode,
        netEquity: result.netEquity,
        shortfall,
      });

      this.logger.log(
        `Credit ${credit.creditCode} settled via ${opts.mode}: netEquity ${result.netEquity}, ` +
        `surplusIr ${releaseIr}, deficit ${deficit}, shortfall ${shortfall}`,
      );

      return saved;
  }

  /**
   * Force-liquidation — an alias over settleCredit used by drawdown/margin/expiry.
   */
  async liquidate(creditId: string, reason: string, opts: Partial<SettlementOptions> = {}): Promise<CreditEntity> {
    return this.settleCredit(creditId, {
      mode: "FORCE",
      reason,
      allowDepositTopUp: false,
      ...opts,
    });
  }

  /**
   * Legacy (v1) settlement: the credit line was issued upfront as a nominal
   * balance and there is no collateral/leverage snapshot to value. Settlement
   * voids the line (credit wallets are zeroed) and returns any frozen material
   * collateral on DEPOSIT wallets. Residual credit-acquired balances are left
   * for admin review (recorded in the settlement report).
   */
  private async settleLegacyCredit(
    manager: any,
    credit: CreditEntity,
    opts: SettlementOptions,
    now: Date,
  ): Promise<CreditEntity> {
    // Void the credit line.
    const creditWallets = await manager.find(WalletEntity, {
      where: { userId: credit.userId, walletType: WalletTypeEnum.CREDIT },
      lock: { mode: "pessimistic_write" },
    });
    let residual = 0;
    for (const cw of creditWallets) {
      residual += Number(cw.freeBalance) + Number(cw.lockedBalance);
      if (cw.creditBalance || cw.freeBalance || cw.lockedBalance) {
        cw.creditBalance = 0;
        cw.freeBalance = 0;
        cw.lockedBalance = 0;
        await manager.save(cw);
      }
    }

    // Return frozen material collateral held on DEPOSIT wallets.
    const depositWallets = await manager.find(WalletEntity, {
      where: { userId: credit.userId, walletType: WalletTypeEnum.DEPOSIT },
      lock: { mode: "pessimistic_write" },
    });
    for (const w of depositWallets) {
      let unfrozen = 0;
      if (Number(w.frozenFreeBalance) > 0) {
        unfrozen += Number(w.frozenFreeBalance);
        w.freeBalance = new Decimal(w.freeBalance || 0).plus(w.frozenFreeBalance).toNumber();
        w.frozenFreeBalance = 0;
      }
      if (Number(w.frozenLockedBalance) > 0) {
        unfrozen += Number(w.frozenLockedBalance);
        w.frozenLockedBalance = 0;
      }
      if (unfrozen > 0) {
        await manager.save(w);
        await this.saveWalletTxn(manager, w, {
          amount: unfrozen,
          description: `Collateral unfrozen after credit ${credit.creditCode} settlement`,
          metadata: { creditId: credit.id, mode: opts.mode, type: "LEGACY_UNFREEZE" },
        });
      }
    }

    credit.status = CreditStatusEnum.SETTLED;
    credit.settledAt = now;
    credit.settlementState = SettlementStateEnum.SETTLED;
    credit.notes = opts.notes || credit.notes;
    if (opts.adminId) credit.settledByAdminId = opts.adminId;
    if (opts.imagePath) credit.settleImagePath = opts.imagePath;
    credit.metadata = {
      ...(credit.metadata || {}),
      settleReason: opts.reason || `${opts.mode}_LEGACY`,
      settledAt: now.toISOString(),
      settlement: { mode: opts.mode, legacy: true, residual },
    };
    const saved = await manager.save(credit);

    await this.logFinanceAction(manager, {
      adminId: opts.adminId ?? null,
      userId: credit.userId,
      creditId: credit.id,
      actionType: CreditActionEnum.CREDIT_SETTLED,
      description: `Credit ${credit.creditCode} settled (legacy, ${opts.mode}). Residual ${residual} left for review.`,
      metadata: { mode: opts.mode, legacy: true, residual },
    });

    await manager.save(
      manager.create(CreditNotificationEntity, {
        userId: credit.userId,
        creditId: credit.id,
        type: CreditNotificationTypeEnum.SETTLEMENT,
        message: `Credit ${credit.creditCode} has been settled.`,
        sentAt: now,
      }),
    );

    this.eventEmitter.emit(CreditEvents.SETTLED, {
      userId: credit.userId,
      creditId: credit.id,
      reason: opts.reason || opts.mode,
      mode: opts.mode,
      legacy: true,
    });
    return saved;
  }

  // ── computation ──────────────────────────────────────────────────────────

  private computeFromOrders(
    credit: CreditEntity,
    creditOrders: CreditOrderEntity[],
    markPrice: number,
    markPrices: Record<string, number>,
  ): SettlementResult {
    let borrowedIr = new Decimal(0);
    let sellRevenueIr = new Decimal(0);
    const netXauByBase = new Map<string, Decimal>();
    const borrowedXauByBase = new Map<string, Decimal>();
    const symbolSlug = new Map<string, string>();
    const orders: SettlementState["orders"] = [];

    for (const co of creditOrders) {
      const o = co.order;
      if (!o || !(Number(o.executedQuantity) > 0)) continue;
      const qty = new Decimal(Number(o.executedQuantity) || 0);
      const pair = o.pricePair;
      const baseId = pair?.baseId || pair?.baseSymbol?.id;
      if (!baseId) continue;
      symbolSlug.set(baseId, pair.baseSymbol?.slug || baseId);

      const buyPrice = Number(o.price) || Number(co.priceAtOrderTime) || 0;
      const purePrice =
        Number(o.mesghalPrice) > 0 ? Number(o.mesghalPrice) / MESQAL_TO_GRAM : buyPrice;

      if (o.side === OrderSideEnum.BUY) {
        borrowedIr = borrowedIr.plus(qty.mul(buyPrice));
        const buyRate = Number(pair?.buyCommission) || 0;
        const netQty = qty.mul(1 - buyRate / 100);
        netXauByBase.set(baseId, (netXauByBase.get(baseId) || new Decimal(0)).plus(netQty));
      } else {
        sellRevenueIr = sellRevenueIr.plus(qty.mul(purePrice));
        borrowedXauByBase.set(baseId, (borrowedXauByBase.get(baseId) || new Decimal(0)).plus(qty));
        netXauByBase.set(baseId, (netXauByBase.get(baseId) || new Decimal(0)).minus(qty));
      }

      orders.push({
        orderId: o.id,
        orderCode: o.orderCode,
        side: o.side,
        executedQuantity: Number(o.executedQuantity),
        price: buyPrice,
        pairKey: pair ? `${pair.baseSymbol?.slug}/${pair.quoteSymbol?.slug}` : "?",
      });
    }

    const netIr = sellRevenueIr.minus(borrowedIr);

    // Mark price per base symbol holding a position (collateral mark price is
    // the fallback for any symbol without a live pair).
    const positions: BaseSymbolPosition[] = [];
    let netEquity = netIr;
    // Exposure = the value the user owes the platform.
    //   - Gross (default): total borrowed IRR + total borrowed base asset at mark.
    //   - Net (nettingEnabled): net negative obligations only — offsetting
    //     BUY/SELL positions in the same base symbol cancel out, matching the
    //     already-netted settlement transfer.
    let exposure = credit.nettingEnabled ? Decimal.max(0, netIr.negated()) : borrowedIr;
    for (const [symbolId, netXau] of netXauByBase) {
      const price = markPrices[symbolId] || markPrice;
      positions.push({
        symbolId,
        baseSymbolSlug: symbolSlug.get(symbolId) || symbolId,
        netXau: netXau.toNumber(),
        markPrice: price,
      });
      netEquity = netEquity.plus(netXau.mul(price));
      if (credit.nettingEnabled) {
        exposure = exposure.plus(Decimal.max(0, netXau.negated()).mul(price));
      } else {
        exposure = exposure.plus((borrowedXauByBase.get(symbolId) || new Decimal(0)).mul(price));
      }
    }
    const collateralValue = new Decimal(credit.collateralAmount || 0).mul(markPrice);
    const equity = collateralValue.plus(netEquity);
    const marginRatio = exposure.greaterThan(0) ? equity.div(exposure) : null;

    return this.resolveResult({
      markPrice,
      collateralValue: collateralValue.toNumber(),
      borrowedIr: borrowedIr.toNumber(),
      sellRevenueIr: sellRevenueIr.toNumber(),
      netIr: netIr.toNumber(),
      positions,
      netEquity: netEquity.toNumber(),
      exposure: exposure.toNumber(),
      equity: equity.toNumber(),
      marginRatio: marginRatio ? marginRatio.toNumber() : null,
      orders,
    });
  }

  /**
   * Turn the raw economic state into a settlement result: how much IRR / base
   * asset is released, and whether a deficit must be covered from collateral.
   */
  private resolveResult(state: SettlementState): SettlementResult {
    let remainingNetIr = new Decimal(state.netIr);
    const releaseXau: Record<string, number> = {};

    // Off-set each base position against the IRR position.
    for (const pos of state.positions) {
      const netXau = new Decimal(pos.netXau);
      const price = new Decimal(pos.markPrice);
      if (netXau.greaterThanOrEqualTo(0)) {
        // Holding base asset: use it to cover any IRR debt first.
        if (remainingNetIr.lessThan(0)) {
          const cover = Decimal.min(netXau, remainingNetIr.negated().div(price));
          remainingNetIr = remainingNetIr.plus(cover.mul(price));
          releaseXau[pos.symbolId] = netXau.minus(cover).toNumber();
        } else {
          releaseXau[pos.symbolId] = netXau.toNumber();
        }
      } else {
        // Owe base asset (short): buy back at mark price.
        remainingNetIr = remainingNetIr.plus(netXau.mul(price));
        releaseXau[pos.symbolId] = 0;
      }
    }

    const releaseIr = remainingNetIr.greaterThan(0) ? remainingNetIr.toNumber() : 0;
    const deficit = new Decimal(state.netEquity).lessThan(0) ? -state.netEquity : 0;

    // Collateral consumption for the deficit.
    let consumedCollateral = 0;
    let shortfall = 0;
    if (deficit > 0) {
      const collateralAmount = new Decimal(state.collateralValue).div(state.markPrice || 1);
      consumedCollateral = Decimal.min(collateralAmount, new Decimal(deficit).div(state.markPrice || 1)).toNumber();
      const consumedValue = new Decimal(consumedCollateral).mul(state.markPrice || 1);
      shortfall = new Decimal(deficit).minus(consumedValue).greaterThan(0)
        ? new Decimal(deficit).minus(consumedValue).toNumber()
        : 0;
    }

    return { ...state, releaseIr, releaseXau, deficit, consumedCollateral, shortfall };
  }

  // ── wallet / collateral application ───────────────────────────────────────

  private async getDepositWallet(manager: any, userId: string, symbolId: string): Promise<WalletEntity> {
    let wallet = await manager.findOne(WalletEntity, {
      where: { userId, symbolId, walletType: WalletTypeEnum.DEPOSIT },
      lock: { mode: "pessimistic_write" },
    });
    if (!wallet) {
      wallet = manager.create(WalletEntity, {
        userId,
        symbolId,
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
    wallet.freeBalance = Number(wallet.freeBalance) || 0;
    return wallet;
  }

  private async applyCollateral(
    manager: any,
    credit: CreditEntity,
    consumedCollateral: number,
    deficit: number,
    shortfall: number,
    opts: SettlementOptions,
    now: Date,
  ): Promise<void> {
    const collateralWalletId = credit.metadata?.collateralWalletId;
    let colw: WalletEntity | null = null;
    if (collateralWalletId) {
      colw = await manager.findOne(WalletEntity, {
        where: { id: collateralWalletId, userId: credit.userId },
        lock: { mode: "pessimistic_write" },
      });
    }
    if (!colw && credit.collateralSymbolId) {
      colw = await manager.findOne(WalletEntity, {
        where: { userId: credit.userId, symbolId: credit.collateralSymbolId, walletType: WalletTypeEnum.COLLATERAL },
        lock: { mode: "pessimistic_write" },
      });
    }
    if (!colw || Number(colw.freeBalance) <= 0) {
      return;
    }

    const collateralBalance = new Decimal(colw.freeBalance || 0);
    if (deficit > 0) {
      const consume = Decimal.min(collateralBalance, new Decimal(consumedCollateral));
      if (consume.greaterThan(0)) {
        colw.freeBalance = collateralBalance.minus(consume).toNumber();
        await manager.save(colw);

        await this.logFinanceAction(manager, {
          adminId: opts.adminId ?? null,
          userId: credit.userId,
          creditId: credit.id,
          actionType: CreditActionEnum.LIQUIDATION,
          description:
            `Credit ${credit.creditCode} collateral of ${consume.toString()} consumed ` +
            `to cover settlement deficit of ${deficit}`,
          metadata: { consumed: consume.toString(), deficit, shortfall },
        });
        await this.saveWalletTxn(manager, colw, {
          amount: -consume.toNumber(),
          description: `Collateral consumed for credit ${credit.creditCode} settlement`,
          metadata: { creditId: credit.id, deficit, type: "COLLATERAL_CONSUMED" },
        });
      }
    }

    // Return the remaining collateral to the DEPOSIT wallet.
    if (Number(colw.freeBalance) > 0) {
      const remaining = new Decimal(colw.freeBalance);
      const deposit = await this.getDepositWallet(manager, credit.userId, colw.symbolId);
      deposit.freeBalance = new Decimal(deposit.freeBalance).plus(remaining).toNumber();
      await manager.save(deposit);
      await this.saveWalletTxn(manager, deposit, {
        amount: remaining.toNumber(),
        description: `Collateral returned after credit ${credit.creditCode} settlement`,
        metadata: { creditId: credit.id, type: "COLLATERAL_RETURNED" },
      });
      colw.freeBalance = 0;
      await manager.save(colw);
    }
  }

  /**
   * Release or consume the facility's active per-trade collateral locks on
   * settlement (handoff §13 Collateral Lock lifecycle). Consumed collateral is
   * backed against locks first; the remaining locks are released back to
   * Collateral Available.
   */
  private async settleCollateralLocks(
    manager: any,
    credit: CreditEntity,
    consumedCollateral: number,
    now: Date,
  ): Promise<void> {
    const locks = await manager.find(CollateralLockEntity, {
      where: { creditId: credit.id },
      lock: { mode: "pessimistic_write" },
    });
    let remainingToConsume = new Decimal(consumedCollateral || 0);
    for (const lock of locks) {
      if (
        lock.status !== CollateralLockStatusEnum.ACTIVE &&
        lock.status !== CollateralLockStatusEnum.RELEASE_PENDING &&
        lock.status !== CollateralLockStatusEnum.CREATED
      ) {
        continue;
      }
      const amount = new Decimal(lock.amount || 0);
      if (remainingToConsume.greaterThan(0) && amount.greaterThan(0)) {
        const consume = Decimal.min(amount, remainingToConsume);
        remainingToConsume = remainingToConsume.minus(consume);
        lock.status = CollateralLockStatusEnum.CONSUMED;
        lock.consumedAt = now;
        lock.metadata = {
          ...(lock.metadata || {}),
          consumed: true,
          consumedAmount: consume.toNumber(),
        };
      } else {
        lock.status = CollateralLockStatusEnum.RELEASED;
        lock.releasedAt = now;
      }
      await manager.save(lock);
    }
  }

  private async resolveMarkPrice(manager: any, credit: CreditEntity): Promise<number | null> {
    if (!credit.collateralSymbolId || !credit.creditBaseSymbolId) return null;
    if (credit.collateralSymbolId === credit.creditBaseSymbolId) return 1;
    const pair = await this.pricePairRepo.findOne({
      where: { baseId: credit.collateralSymbolId, quoteId: credit.creditBaseSymbolId, isValid: true },
    });
    const price = pair ? Number(pair.bestSellGramPrice) || Number(pair.bestSellPrice) || 0 : 0;
    return price > 0 ? price : null;
  }

  /**
   * Resolve the IRR mark price for every base symbol that appears in the
   * facility's executed credit orders. Symbols denominated directly in the
   * credit base symbol map to 1.
   */
  private async resolveBaseMarkPrices(
    manager: any,
    credit: CreditEntity,
    creditOrders: CreditOrderEntity[],
    fallback: number,
  ): Promise<Record<string, number>> {
    const baseIds = new Set<string>();
    for (const co of creditOrders) {
      const baseId = co.order?.pricePair?.baseId || co.order?.pricePair?.baseSymbol?.id;
      if (baseId) baseIds.add(baseId);
    }
    const prices: Record<string, number> = {};
    for (const baseId of baseIds) {
      if (baseId === credit.creditBaseSymbolId) {
        prices[baseId] = 1;
        continue;
      }
      const pair = await this.pricePairRepo.findOne({
        where: { baseId, quoteId: credit.creditBaseSymbolId, isValid: true },
      });
      prices[baseId] = pair
        ? Number(pair.bestSellGramPrice) || Number(pair.bestSellPrice) || fallback
        : fallback;
    }
    return prices;
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  private settlementMessage(
    credit: CreditEntity,
    result: SettlementResult,
    deficit: number,
    shortfall: number,
  ): string {
    if (shortfall > 0) {
      return (
        `Credit ${credit.creditCode} settled with an outstanding shortfall of ` +
        `${shortfall.toFixed(2)}. Please contact support.`
      );
    }
    if (deficit > 0) {
      return (
        `Credit ${credit.creditCode} settled. A loss of ${deficit.toFixed(2)} was ` +
        `covered from your collateral.`
      );
    }
    if (result.netEquity > 0) {
      return (
        `Credit ${credit.creditCode} settled with a surplus of ` +
        `${result.netEquity.toFixed(2)} released to your deposit wallet.`
      );
    }
    return `Credit ${credit.creditCode} has been settled. Your collateral was returned to your deposit wallet.`;
  }

  private async logFinanceAction(
    manager: any,
    data: {
      adminId: string | null;
      userId: string;
      creditId?: string;
      actionType: CreditActionEnum;
      description: string;
      metadata?: any;
    },
  ): Promise<void> {
    await manager.save(
      manager.create(FinanceLogEntity, {
        adminId: data.adminId,
        userId: data.userId,
        creditId: data.creditId,
        actionType: data.actionType,
        description: data.description,
        metadata: data.metadata,
        actionTime: new Date(),
      }),
    );
  }

  private async saveWalletTxn(
    manager: any,
    wallet: WalletEntity,
    params: { amount: number; description: string; metadata?: any },
  ): Promise<void> {
    await manager.save(
      manager.create(TransactionEntity, {
        walletId: wallet.id,
        transactionId: `TXN-${crypto.randomUUID().split('-')[0].toUpperCase()}`,
        transactionType: TransactionTypeEnum.CREDIT_SETTLEMENT,
        status: TransactionStatusEnum.COMPLETED,
        amount: params.amount,
        fee: 0,
        description: params.description,
        metadata: params.metadata,
        completedAt: new Date(),
      }),
    );
  }
}