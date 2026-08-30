import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository, In, IsNull } from "typeorm";
import Decimal from "decimal.js";
import { CreditEntity } from "../entity/credit.entity";
import { CreditOrderEntity } from "../entity/credit-order.entity";
import { CreditSettlementEntity } from "../entity/credit-settlement.entity";
import {
  SettlementWorkflowStatusEnum,
  SettlementMethodEnum,
  SettlementValuationStateEnum,
} from "../enum/settlement-workflow-status.enum";
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
 * Delivery-based settlement workflow (handoff §6.6, §7, §13).
 *
 * Revised lifecycle:
 *   SETTLEMENT_REQUESTED → PENDING_ADMIN_REVIEW (if approval policy ON)
 *   → APPROVED → VALUATED → METHOD_SELECTED → FUNDING_REQUIRED/READY
 *   → ASSET_RECEIVED → ASSET_VERIFIED → LIABILITY_CLEARED → ASSET_SETTLED
 *   → COLLATERAL_RELEASED → CLOSED | REJECTED | FAILED
 *
 * - Admin approval policy (requireAdminApprovalForSettlement): when ON, no
 *   transfer or collateral release happens before the admin approves.
 * - Valuation compares Credit Exposure Value vs Current Collateral Value in a
 *   single value unit (IRR) and derives three states + the shortfall.
 * - The user selects one of the admin-enabled settlement methods (FULL/NET/TOPUP).
 * - The value transfer is executed by the settlement engine at LIABILITY_CLEARED
 *   (single valuation source); per-trade collateral locks are released/consumed
 *   there too. All steps are idempotent.
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
   * when no trade is given). When the facility's approval policy is ON the
   * workflow stops at PENDING_ADMIN_REVIEW; otherwise it is auto-approved.
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
          creditOrderId: opts.creditOrderId ? opts.creditOrderId : IsNull(),
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
      const requireApproval = !!credit.requireAdminApprovalForSettlement;
      const entity = manager.create(CreditSettlementEntity, {
        creditId: credit.id,
        creditOrderId: creditOrder?.id ?? null,
        requiredAssetSymbolId,
        requiredAmount,
        receivedAmount: 0,
        status: requireApproval
          ? SettlementWorkflowStatusEnum.PENDING_ADMIN_REVIEW
          : SettlementWorkflowStatusEnum.APPROVED,
        requestedBy: opts.requestedBy ?? null,
        requestedAt: now,
        approvedAt: requireApproval ? null : now,
        notes: opts.notes,
        metadata: {
          requestedBy: opts.requestedBy ?? opts.adminId ?? "system",
          requireAdminApproval: requireApproval,
        },
      });
      const saved = await manager.save(entity);

      this.logger.log(
        `Settlement workflow ${saved.id} requested for credit ${credit.creditCode} ` +
          `(required ${requiredAmount} of ${requiredAssetSymbolId}, approval=${requireApproval})`,
      );
      return saved;
    });
  }

  /** Admin approves a pending settlement (PENDING_ADMIN_REVIEW → APPROVED). */
  async approve(
    settlementId: string,
    adminId: string,
    reason?: string,
  ): Promise<CreditSettlementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const s = await manager.findOne(CreditSettlementEntity, {
        where: { id: settlementId },
        lock: { mode: "pessimistic_write" },
      });
      if (!s) throw new NotFoundException("Settlement not found");
      if (s.status !== SettlementWorkflowStatusEnum.PENDING_ADMIN_REVIEW) {
        throw new BadRequestException(
          `Only a pending settlement can be approved (current: ${s.status})`,
        );
      }
      s.status = SettlementWorkflowStatusEnum.APPROVED;
      s.approvedBy = adminId;
      s.approvedAt = new Date();
      s.approvalReason = reason ?? null;
      const saved = await manager.save(s);
      this.logger.log(`Settlement ${s.id} approved by admin ${adminId}`);
      return saved;
    });
  }

  /** Admin rejects a pending settlement (PENDING_ADMIN_REVIEW → REJECTED). */
  async reject(
    settlementId: string,
    adminId: string,
    reason: string,
  ): Promise<CreditSettlementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const s = await manager.findOne(CreditSettlementEntity, {
        where: { id: settlementId },
        lock: { mode: "pessimistic_write" },
      });
      if (!s) throw new NotFoundException("Settlement not found");
      if (s.status !== SettlementWorkflowStatusEnum.PENDING_ADMIN_REVIEW) {
        throw new BadRequestException(
          `Only a pending settlement can be rejected (current: ${s.status})`,
        );
      }
      s.status = SettlementWorkflowStatusEnum.REJECTED;
      s.rejectedBy = adminId;
      s.rejectedAt = new Date();
      s.rejectionReason = reason;
      const saved = await manager.save(s);
      this.logger.log(`Settlement ${s.id} rejected by admin ${adminId}: ${reason}`);
      return saved;
    });
  }

  /**
   * Valuate the settlement: mark-to-market the facility and compare Credit
   * Exposure Value vs Current Collateral Value (single IRR unit, handoff §6.4).
   * Also computes the shortfall when exposure exceeds collateral.
   */
  async valuate(settlementId: string): Promise<CreditSettlementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const s = await manager.findOne(CreditSettlementEntity, {
        where: { id: settlementId },
        lock: { mode: "pessimistic_write" },
      });
      if (!s) throw new NotFoundException("Settlement not found");
      if (!this.canValuate(s.status)) {
        throw new BadRequestException(
          `Valuation is not allowed in state ${s.status}`,
        );
      }

      const credit = await manager.findOne(CreditEntity, {
        where: { id: s.creditId },
        lock: { mode: "pessimistic_write" },
      });
      if (!credit) throw new NotFoundException("Credit not found");

      const state = await this.settlementEngine.computeState(credit, manager);
      const collateralValue = new Decimal(state.collateralValue);
      const exposureValue = new Decimal(state.exposure);
      let valuationState: SettlementValuationStateEnum;
      let shortfall = 0;
      if (exposureValue.lessThan(collateralValue)) {
        valuationState = SettlementValuationStateEnum.EXPOSURE_LT_COLLATERAL;
      } else if (exposureValue.greaterThan(collateralValue)) {
        valuationState = SettlementValuationStateEnum.EXPOSURE_GT_COLLATERAL;
        shortfall = exposureValue.minus(collateralValue).toNumber();
      } else {
        valuationState = SettlementValuationStateEnum.EXPOSURE_EQ_COLLATERAL;
      }

      s.valuationState = valuationState;
      s.collateralValue = collateralValue.toNumber();
      s.exposureValue = exposureValue.toNumber();
      s.shortfall = shortfall;
      s.requiredTopUp = shortfall;
      s.metadata = {
        ...(s.metadata || {}),
        valuation: {
          markPrice: state.markPrice,
          netEquity: state.netEquity,
          equity: state.equity,
          borrowedIr: state.borrowedIr,
        },
      };
      if (s.status === SettlementWorkflowStatusEnum.APPROVED) {
        s.status = SettlementWorkflowStatusEnum.VALUATED;
      }
      const saved = await manager.save(s);
      this.logger.log(
        `Settlement ${s.id} valuated: exposure ${exposureValue} vs collateral ${collateralValue} (${valuationState}, shortfall ${shortfall})`,
      );
      return saved;
    });
  }

  /**
   * User/admin selects one of the admin-enabled settlement methods
   * (handoff §6.5). NET requires the facility's netting policy to be enabled.
   */
  async selectMethod(
    settlementId: string,
    method: SettlementMethodEnum,
    actor?: string,
  ): Promise<CreditSettlementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const s = await manager.findOne(CreditSettlementEntity, {
        where: { id: settlementId },
        lock: { mode: "pessimistic_write" },
      });
      if (!s) throw new NotFoundException("Settlement not found");
      if (!this.canSelectMethod(s.status)) {
        throw new BadRequestException(
          `Method selection is not allowed in state ${s.status}`,
        );
      }
      const credit = await manager.findOne(CreditEntity, { where: { id: s.creditId } });
      if (!credit) throw new NotFoundException("Credit not found");

      const enabled = (credit.settlementMethods || ["FULL", "NET", "TOPUP"]) as string[];
      if (!enabled.includes(method)) {
        throw new BadRequestException(
          `Settlement method ${method} is not enabled for this facility (enabled: ${enabled.join(", ")})`,
        );
      }
      if (method === SettlementMethodEnum.NET && !credit.nettingEnabled) {
        throw new BadRequestException(
          "Net settlement (Method B) requires the facility's netting policy to be enabled",
        );
      }

      s.settlementMethod = method;
      if (s.status !== SettlementWorkflowStatusEnum.FUNDING_REQUIRED) {
        s.status = SettlementWorkflowStatusEnum.METHOD_SELECTED;
      }

      // TOPUP is cash-only: the user doesn't deliver the borrowed asset at
      // all, they just top up the IRR shortfall and the engine consumes
      // collateral for the rest at clearLiability. Void the delivery
      // obligation so this settlement can skip straight past the
      // receive/verify-asset steps (FULL/NET still require physical
      // delivery of the full required amount).
      const isTopup = method === SettlementMethodEnum.TOPUP;
      if (isTopup) {
        s.requiredAssetSymbolId = null;
        s.requiredAmount = 0;
      }

      // If there is a shortfall, funding is required before delivery/clearing.
      if (new Decimal(s.shortfall || 0).greaterThan(0)) {
        s.status = SettlementWorkflowStatusEnum.FUNDING_REQUIRED;
        s.requiredTopUp = s.shortfall;
      } else if (isTopup) {
        // Nothing to fund and nothing to deliver — already clear to settle.
        s.status = SettlementWorkflowStatusEnum.ASSET_VERIFIED;
        s.verifiedAt = s.verifiedAt || new Date();
      } else {
        s.status = SettlementWorkflowStatusEnum.READY;
      }
      s.metadata = {
        ...(s.metadata || {}),
        settlementMethod: method,
        methodSelectedBy: actor ?? "system",
      };
      const saved = await manager.save(s);
      this.logger.log(`Settlement ${s.id} method selected: ${method}`);
      return saved;
    });
  }

  /**
   * Record funding toward the settlement shortfall (handoff §6.5). When the
   * accumulated funding covers the shortfall, the workflow becomes READY
   * (FULL/NET, still awaiting asset delivery) or ASSET_VERIFIED (TOPUP,
   * which has no delivery step — see selectMethod); otherwise it stays
   * FUNDING_REQUIRED (partial funding is allowed).
   */
  async fund(
    settlementId: string,
    amount: number,
    opts: { fundedBy?: string; notes?: string } = {},
  ): Promise<CreditSettlementEntity> {
    return this.dataSource.transaction(async (manager) => {
      const s = await manager.findOne(CreditSettlementEntity, {
        where: { id: settlementId },
        lock: { mode: "pessimistic_write" },
      });
      if (!s) throw new NotFoundException("Settlement not found");
      if (!this.canFund(s.status)) {
        throw new BadRequestException(`Funding is not allowed in state ${s.status}`);
      }
      if (!(Number(amount) > 0)) {
        throw new BadRequestException("Funding amount must be greater than zero");
      }
      if (new Decimal(s.shortfall || 0).lessThanOrEqualTo(0)) {
        throw new BadRequestException("This settlement has no shortfall to fund");
      }

      const funded = new Decimal(s.fundedAmount || 0).plus(amount);
      s.fundedAmount = funded.toNumber();
      s.requiredTopUp = Decimal.max(0, new Decimal(s.shortfall || 0).minus(funded)).toNumber();
      if (funded.greaterThanOrEqualTo(s.shortfall || 0)) {
        // TOPUP has no asset to deliver (see selectMethod) — once the
        // shortfall is fully funded it's already clear to settle.
        if (s.settlementMethod === SettlementMethodEnum.TOPUP) {
          s.status = SettlementWorkflowStatusEnum.ASSET_VERIFIED;
          s.verifiedAt = s.verifiedAt || new Date();
        } else {
          s.status = SettlementWorkflowStatusEnum.READY;
        }
      } else {
        s.status = SettlementWorkflowStatusEnum.FUNDING_REQUIRED;
      }
      s.metadata = {
        ...(s.metadata || {}),
        funding: [...(s.metadata?.funding || []), { amount, by: opts.fundedBy ?? "system", at: new Date().toISOString(), notes: opts.notes }],
      };
      const saved = await manager.save(s);
      this.logger.log(
        `Settlement ${s.id} funded +${amount} (total ${funded}/${s.shortfall})`,
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
      if (s.settlementMethod === SettlementMethodEnum.TOPUP) {
        throw new BadRequestException(
          "TOPUP is a cash-only settlement — fund the shortfall instead of delivering an asset",
        );
      }
      if (!this.canReceive(s.status)) {
        throw new BadRequestException(
          `Asset delivery is not allowed in state ${s.status} — approve, valuate, select a method and fund the shortfall first`,
        );
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
      if (s.status !== SettlementWorkflowStatusEnum.ASSET_RECEIVED) {
        throw new BadRequestException(
          `Asset must be received before verification (current: ${s.status})`,
        );
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
   * deficit, closes the open credit trades and releases per-trade collateral
   * locks. It only proceeds once the asset has been received and verified
   * (delivery-first rule) and, for exposure > collateral, the shortfall has been
   * funded. For a TOPUP settlement there is no asset to deliver — ASSET_VERIFIED
   * is reached directly once the shortfall is funded (see selectMethod/fund).
   */
  async clearLiability(
    settlementId: string,
    opts: { adminId?: string; mode?: "USER_SELF" | "ADMIN"; force?: boolean } = {},
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
      // Handoff §6.4 State 2: never allow full collateral release while a
      // shortfall remains unfunded.
      if (
        new Decimal(s.shortfall || 0).greaterThan(0) &&
        new Decimal(s.fundedAmount || 0).lessThan(s.shortfall || 0)
      ) {
        throw new BadRequestException(
          `Exposure exceeds collateral by ${s.shortfall} and the shortfall is not fully funded ` +
            `(funded ${s.fundedAmount}). Fund the shortfall before settlement.`,
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
      const settled = await this.settlementEngine.settleCreditInTransaction(manager, credit, {
        mode: opts.mode === "ADMIN" ? "ADMIN" : "USER_SELF",
        adminId: opts.adminId ?? null,
        reason: `SETTLEMENT_WORKFLOW:${s.id}`,
        allowDepositTopUp: s.settlementMethod === SettlementMethodEnum.TOPUP ? true : opts.mode !== "ADMIN",
        force: opts.mode === "ADMIN" ? opts.force : false,
      });

      const report = settled.metadata?.settlement || {};
      s.status = SettlementWorkflowStatusEnum.LIABILITY_CLEARED;
      s.liabilityClearedAt = new Date();
      s.releaseAmount = Number(report.releaseIr || 0);
      s.realizedPnL = Number(report.netEquity || 0);
      s.finalCollateralState = {
        released: Number(report.releaseIr || 0),
        consumed: Number(report.consumedCollateral || 0),
        shortfall: Number(report.shortfall || 0),
      };
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

  /**
   * Admin-wide approval queue: every settlement currently awaiting admin
   * review (PENDING_ADMIN_REVIEW), across all credit facilities, oldest
   * first. Used by the admin panel's pending-approvals panel so an admin
   * doesn't have to open each credit individually to find what needs action.
   */
  async findPendingReview(): Promise<CreditSettlementEntity[]> {
    return this.settlementRepo.find({
      where: { status: SettlementWorkflowStatusEnum.PENDING_ADMIN_REVIEW },
      relations: { credit: { user: true } },
      order: { requestedAt: "ASC" },
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
    return (
      status !== SettlementWorkflowStatusEnum.CLOSED &&
      status !== SettlementWorkflowStatusEnum.REJECTED &&
      status !== SettlementWorkflowStatusEnum.FAILED
    );
  }

  private activeSettlementStatuses(): SettlementWorkflowStatusEnum[] {
    return [
      SettlementWorkflowStatusEnum.SETTLEMENT_REQUESTED,
      SettlementWorkflowStatusEnum.PENDING_ADMIN_REVIEW,
      SettlementWorkflowStatusEnum.APPROVED,
      SettlementWorkflowStatusEnum.VALUATED,
      SettlementWorkflowStatusEnum.METHOD_SELECTED,
      SettlementWorkflowStatusEnum.FUNDING_REQUIRED,
      SettlementWorkflowStatusEnum.READY,
      SettlementWorkflowStatusEnum.ASSET_RECEIVED,
      SettlementWorkflowStatusEnum.ASSET_VERIFIED,
      SettlementWorkflowStatusEnum.LIABILITY_CLEARED,
      SettlementWorkflowStatusEnum.ASSET_SETTLED,
      SettlementWorkflowStatusEnum.COLLATERAL_RELEASED,
    ];
  }

  private canValuate(status: SettlementWorkflowStatusEnum): boolean {
    return (
      status === SettlementWorkflowStatusEnum.APPROVED ||
      status === SettlementWorkflowStatusEnum.VALUATED
    );
  }

  private canSelectMethod(status: SettlementWorkflowStatusEnum): boolean {
    return (
      status === SettlementWorkflowStatusEnum.APPROVED ||
      status === SettlementWorkflowStatusEnum.VALUATED ||
      status === SettlementWorkflowStatusEnum.METHOD_SELECTED ||
      status === SettlementWorkflowStatusEnum.FUNDING_REQUIRED
    );
  }

  private canFund(status: SettlementWorkflowStatusEnum): boolean {
    return (
      status === SettlementWorkflowStatusEnum.METHOD_SELECTED ||
      status === SettlementWorkflowStatusEnum.FUNDING_REQUIRED ||
      status === SettlementWorkflowStatusEnum.READY
    );
  }

  private canReceive(status: SettlementWorkflowStatusEnum): boolean {
    return (
      status === SettlementWorkflowStatusEnum.APPROVED ||
      status === SettlementWorkflowStatusEnum.VALUATED ||
      status === SettlementWorkflowStatusEnum.METHOD_SELECTED ||
      status === SettlementWorkflowStatusEnum.FUNDING_REQUIRED ||
      status === SettlementWorkflowStatusEnum.READY ||
      status === SettlementWorkflowStatusEnum.ASSET_RECEIVED ||
      status === SettlementWorkflowStatusEnum.ASSET_VERIFIED
    );
  }
}