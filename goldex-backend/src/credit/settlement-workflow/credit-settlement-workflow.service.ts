import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository, In } from "typeorm";
import Decimal from "decimal.js";
import { CreditEntity } from "../entity/credit.entity";
import { CreditOrderEntity } from "../entity/credit-order.entity";
import { CreditSettlementEntity } from "../entity/credit-settlement.entity";
import { SettlementWorkflowStatusEnum } from "../enum/settlement-workflow-status.enum";
import { CreditOrderStatusEnum } from "../enum/credit-order-status.enum";
import { CreditStatusEnum } from "../enum/credit-status.enum";
import { CreditSettlementService } from "../settlement/credit-settlement.service";

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export interface RequestSettlementOptions {
  creditOrderId?: string;
  requestedBy?: string;
  notes?: string;
  adminId?: string;
}

/**
 * Delivery-based settlement workflow (handoff §7).
 *
 * The workflow enforces an explicit, auditable settlement lifecycle per credit
 * trade:
 *   SETTLEMENT_REQUESTED → ASSET_RECEIVED → ASSET_VERIFIED → LIABILITY_CLEARED
 *   → ASSET_SETTLED → COLLATERAL_RELEASED → CLOSED | FAILED
 *
 * The value transfer (covering the negative credit leg, releasing surplus,
 * consuming collateral and releasing per-trade collateral locks) is executed by
 * the settlement engine at the LIABILITY_CLEARED step, so there is a single
 * valuation source. All steps are idempotent.
 */
@Injectable()
export class CreditSettlementWorkflowService {
  private readonly logger = new Logger(CreditSettlementWorkflowService.name);

  constructor(
    @InjectRepository(CreditEntity)
    private readonly creditRepo: Repository<CreditEntity>,
    @InjectRepository(CreditOrderEntity)
    private readonly creditOrderRepo: Repository<CreditOrderEntity>,
    @InjectRepository(CreditSettlementEntity)
    private readonly settlementRepo: Repository<CreditSettlementEntity>,
    private readonly dataSource: DataSource,
    private readonly settlementEngine: CreditSettlementService,
  ) {}

  /**
   * Start a delivery-based settlement for a credit trade (or the whole facility
   * when no trade is given). The required asset/amount is derived from the
   * trade's executed obligation:
   *   SELL → deliver the borrowed base asset (qty).
   *   BUY  → repay the borrowed credit currency (qty × customer price).
   */
  async requestSettlement(
    creditId: string,
    opts: RequestSettlementOptions = {},
  ): Promise<CreditSettlementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const credit = await manager.findOne(CreditEntity, {
        where: { id: creditId },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new NotFoundException("Credit not found");
      if (credit.status !== CreditStatusEnum.ACTIVE) {
        throw new BadRequestException(`Cannot settle credit with status ${credit.status}`);
      }

      let creditOrder: CreditOrderEntity | null = null;
      if (opts.creditOrderId) {
        creditOrder = await manager.findOne(CreditOrderEntity, {
          where: { id: opts.creditOrderId, creditId: credit.id },
          relations: { order: { pricePair: { baseSymbol: true, quoteSymbol: true } } },
        });
        if (!creditOrder) throw new NotFoundException("Credit trade not found for this facility");
      }

      const existing = await manager.findOne(CreditSettlementEntity, {
        where: {
          creditId: credit.id,
          creditOrderId: opts.creditOrderId || null,
          status: In(this.activeSettlementStatuses()),
        },
      });
      if (existing) {
        throw new BadRequestException(
          "An active settlement workflow already exists for this trade",
        );
      }

      const { requiredAssetSymbolId, requiredAmount } =
        creditOrder && creditOrder.order
          ? this.requiredForTrade(creditOrder)
          : await this.requiredForFacility(manager, credit);

      const now = new Date();
      const entity = manager.create(CreditSettlementEntity, {
        creditId: credit.id,
        creditOrderId: creditOrder?.id ?? null,
        requiredAssetSymbolId,
        requiredAmount,
        receivedAmount: 0,
        status: SettlementWorkflowStatusEnum.REQUESTED,
        requestedBy: opts.requestedBy ?? null,
        requestedAt: now,
        notes: opts.notes,
        metadata: {
          requestedBy: opts.requestedBy ?? opts.adminId ?? "system",
        },
      });
      const saved = await manager.save(entity);

      this.logger.log(
        `Settlement workflow ${saved.id} requested for credit ${credit.creditCode} ` +
          `(required ${requiredAmount} of ${requiredAssetSymbolId})`,
      );
      return saved;
    });
  }

  /** Record that the required asset was delivered to the settlement inventory. */
  async receiveAsset(settlementId: string, amount: number, notes?: string): Promise<CreditSettlementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const s = await manager.findOne(CreditSettlementEntity, {
        where: { id: settlementId },
        lock: { mode: "pessimistic_write" },
      });
      if (!s) throw new NotFoundException("Settlement not found");
      if (!this.isActive(s.status)) {
        throw new BadRequestException(`Settlement is already ${s.status}`);
      }
      if (!(Number(amount) > 0)) {
        throw new BadRequestException("Received amount must be greater than zero");
      }

      const received = new Decimal(s.receivedAmount || 0).plus(amount);
      s.receivedAmount = received.toNumber();
      s.receivedAt = s.receivedAt || new Date();
      if (notes) s.notes = notes;

      // Partial deliveries are allowed (handoff §18): keep ASSET_RECEIVED until
      // the required amount is covered, then move to ASSET_VERIFIED.
      if (received.greaterThanOrEqualTo(s.requiredAmount || 0)) {
        s.status = SettlementWorkflowStatusEnum.ASSET_VERIFIED;
        s.verifiedAt = new Date();
      } else {
        s.status = SettlementWorkflowStatusEnum.ASSET_RECEIVED;
      }
      return manager.save(s);
    });
  }

  /** Explicitly verify asset sufficiency (idempotent). */
  async verifyAsset(settlementId: string): Promise<CreditSettlementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const s = await manager.findOne(CreditSettlementEntity, {
        where: { id: settlementId },
        lock: { mode: "pessimistic_write" },
      });
      if (!s) throw new NotFoundException("Settlement not found");
      if (!this.isActive(s.status)) {
        throw new BadRequestException(`Settlement is already ${s.status}`);
      }
      if (new Decimal(s.receivedAmount || 0).lessThan(s.requiredAmount || 0)) {
        throw new BadRequestException(
          `Insufficient delivered asset: received ${s.receivedAmount}, required ${s.requiredAmount}`,
        );
      }
      s.status = SettlementWorkflowStatusEnum.ASSET_VERIFIED;
      s.verifiedAt = new Date();
      return manager.save(s);
    });
  }

  /**
   * Clear the negative credit liability. This is the economic step — it runs the
   * settlement engine on the facility (USER_SELF/ADMIN mode) which zeroes the
   * credit wallets, releases surplus to cash, consumes collateral for any
   * deficit and releases per-trade collateral locks. The workflow only proceeds
   * once the asset has been received and verified (delivery-first rule).
   */
  async clearLiability(
    settlementId: string,
    opts: { adminId?: string; mode?: "USER_SELF" | "ADMIN" } = {},
  ): Promise<CreditSettlementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const s = await manager.findOne(CreditSettlementEntity, {
        where: { id: settlementId },
        lock: { mode: "pessimistic_write" },
      });
      if (!s) throw new NotFoundException("Settlement not found");
      if (s.status !== SettlementWorkflowStatusEnum.ASSET_VERIFIED) {
        throw new BadRequestException(
          `Liability can only be cleared after the asset is verified (current: ${s.status})`,
        );
      }

      const credit = await manager.findOne(CreditEntity, {
        where: { id: s.creditId },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new NotFoundException("Credit not found");

      // Delegate the value transfer to the settlement engine inside the same
      // transaction. The engine releases the collateral locks and marks the
      // facility settled.
      await this.settlementEngine.settleCreditInTransaction(manager, credit, {
        mode: opts.mode === "ADMIN" ? "ADMIN" : "USER_SELF",
        adminId: opts.adminId ?? null,
        reason: `SETTLEMENT_WORKFLOW:${s.id}`,
        allowDepositTopUp: opts.mode !== "ADMIN",
      });

      s.status = SettlementWorkflowStatusEnum.LIABILITY_CLEARED;
      s.liabilityClearedAt = new Date();
      const saved = await manager.save(s);
      this.logger.log(`Settlement ${s.id} liability cleared`);
      return saved;
    });
  }

  /** Mark the credit asset transferred to the cash wallet (idempotent). */
  async settleAsset(settlementId: string): Promise<CreditSettlementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const s = await manager.findOne(CreditSettlementEntity, {
        where: { id: settlementId },
        lock: { mode: "pessimistic_write" },
      });
      if (!s) throw new NotFoundException("Settlement not found");
      if (s.status === SettlementWorkflowStatusEnum.ASSET_SETTLED) return s;
      if (s.status !== SettlementWorkflowStatusEnum.LIABILITY_CLEARED) {
        throw new BadRequestException(
          `Asset transfer requires LIABILITY_CLEARED (current: ${s.status})`,
        );
      }
      s.status = SettlementWorkflowStatusEnum.ASSET_SETTLED;
      s.assetSettledAt = new Date();
      return manager.save(s);
    });
  }

  /** Confirm the collateral lock(s) for the trade were released (idempotent). */
  async releaseCollateral(settlementId: string): Promise<CreditSettlementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const s = await manager.findOne(CreditSettlementEntity, {
        where: { id: settlementId },
        lock: { mode: "pessimistic_write" },
      });
      if (!s) throw new NotFoundException("Settlement not found");
      if (s.status === SettlementWorkflowStatusEnum.COLLATERAL_RELEASED) return s;
      if (s.status !== SettlementWorkflowStatusEnum.ASSET_SETTLED) {
        throw new BadRequestException(
          `Collateral release requires ASSET_SETTLED (current: ${s.status})`,
        );
      }
      s.status = SettlementWorkflowStatusEnum.COLLATERAL_RELEASED;
      s.collateralReleasedAt = new Date();
      return manager.save(s);
    });
  }

  /** Close the settlement workflow and its trade (idempotent). */
  async close(settlementId: string): Promise<CreditSettlementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const s = await manager.findOne(CreditSettlementEntity, {
        where: { id: settlementId },
        lock: { mode: "pessimistic_write" },
      });
      if (!s) throw new NotFoundException("Settlement not found");
      if (s.status === SettlementWorkflowStatusEnum.CLOSED) return s;
      if (s.status !== SettlementWorkflowStatusEnum.COLLATERAL_RELEASED) {
        throw new BadRequestException(
          `Closing requires COLLATERAL_RELEASED (current: ${s.status})`,
        );
      }
      s.status = SettlementWorkflowStatusEnum.CLOSED;
      s.closedAt = new Date();

      if (s.creditOrderId) {
        const co = await manager.findOne(CreditOrderEntity, { where: { id: s.creditOrderId } });
        if (
          co &&
          co.status !== CreditOrderStatusEnum.CANCELLED &&
          co.status !== CreditOrderStatusEnum.CLOSED
        ) {
          co.status = CreditOrderStatusEnum.CLOSED;
          await manager.save(co);
        }
      }
      return manager.save(s);
    });
  }

  /** Mark the workflow failed (e.g. delivery insufficient, retry later). */
  async fail(settlementId: string, reason: string): Promise<CreditSettlementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const s = await manager.findOne(CreditSettlementEntity, {
        where: { id: settlementId },
        lock: { mode: "pessimistic_write" },
      });
      if (!s) throw new NotFoundException("Settlement not found");
      if (!this.isActive(s.status)) {
        throw new BadRequestException(`Settlement is already ${s.status}`);
      }
      s.status = SettlementWorkflowStatusEnum.FAILED;
      s.notes = reason;
      return manager.save(s);
    });
  }

  async findByCredit(creditId: string): Promise<CreditSettlementEntity[]> {
    return this.settlementRepo.find({
      where: { creditId },
      order: { createAt: "ASC" },
    });
  }

  // ── helpers ──────────────────────────────────────────────────────────────

  private requiredForTrade(co: CreditOrderEntity): {
    requiredAssetSymbolId: string | null;
    requiredAmount: number;
  } {
    const o = co.order;
    const qty = new Decimal(Number(o.executedQuantity) || 0).greaterThan(0)
      ? Number(o.executedQuantity)
      : Number(o.quantity) || 0;
    if (o.side === "SELL") {
      // Borrowed base asset — user must deliver the sold quantity.
      return {
        requiredAssetSymbolId: o.pricePair?.baseSymbol?.id ?? o.pricePair?.baseId ?? null,
        requiredAmount: qty,
      };
    }
    // Borrowed credit currency — user must repay qty × customer price.
    const price = Number(o.price) || Number(co.priceAtOrderTime) || 0;
    return {
      requiredAssetSymbolId: o.pricePair?.quoteSymbol?.id ?? o.pricePair?.quoteId ?? null,
      requiredAmount: new Decimal(qty).mul(price).toNumber(),
    };
  }

  private async requiredForFacility(
    manager: any,
    credit: CreditEntity,
  ): Promise<{ requiredAssetSymbolId: string | null; requiredAmount: number }> {
    const orders = await manager.find(CreditOrderEntity, {
      where: { creditId: credit.id },
      relations: { order: { pricePair: { baseSymbol: true, quoteSymbol: true } } },
    });
    let borrowedBase = new Decimal(0);
    let borrowedIr = new Decimal(0);
    let baseSymbolId: string | null = null;
    for (const co of orders) {
      const o = co.order;
      if (!o || !(Number(o.executedQuantity) > 0)) continue;
      const qty = Number(o.executedQuantity);
      if (o.side === "SELL") {
        borrowedBase = borrowedBase.plus(qty);
        baseSymbolId = o.pricePair?.baseSymbol?.id ?? o.pricePair?.baseId ?? null;
      } else {
        borrowedIr = borrowedIr.plus(new Decimal(qty).mul(Number(o.price) || 0));
      }
    }
    // If a base-asset (short) obligation exists, prefer delivering that asset;
    // otherwise the outstanding IRR loan.
    if (borrowedBase.greaterThan(0)) {
      return { requiredAssetSymbolId: baseSymbolId, requiredAmount: borrowedBase.toNumber() };
    }
    return { requiredAssetSymbolId: credit.creditBaseSymbolId, requiredAmount: borrowedIr.toNumber() };
  }

  private isActive(status: SettlementWorkflowStatusEnum): boolean {
    return status !== SettlementWorkflowStatusEnum.CLOSED && status !== SettlementWorkflowStatusEnum.FAILED;
  }

  private activeSettlementStatuses(): SettlementWorkflowStatusEnum[] {
    return [
      SettlementWorkflowStatusEnum.REQUESTED,
      SettlementWorkflowStatusEnum.ASSET_RECEIVED,
      SettlementWorkflowStatusEnum.ASSET_VERIFIED,
      SettlementWorkflowStatusEnum.LIABILITY_CLEARED,
      SettlementWorkflowStatusEnum.ASSET_SETTLED,
      SettlementWorkflowStatusEnum.COLLATERAL_RELEASED,
    ];
  }
}