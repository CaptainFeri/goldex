import { Injectable, Logger } from "@nestjs/common";
import Decimal from "decimal.js";
import { AdminAccountingService } from "../../admin-accounting/admin-accounting.service";
import {
  CustomerType,
  VoucherCategory,
  VoucherMovement,
  VoucherSource,
} from "../../admin-accounting/accounting.enums";
import { UserEntity } from "../../user/entity/user.entity";
import { WarehouseRequestEntity } from "../entity/warehouse-request.entity";

/**
 * Raises the accounting voucher that records a warehouse movement.
 *
 * Every gram that enters or leaves the vault has to show up in the ledger, and
 * until now none of it did: the warehouse credited and debited wallets without
 * ever writing an accounting entry, so the books and the vault could drift
 * apart with nothing to reconcile against.
 *
 * Two rules hold for everything here:
 *
 *  - The amount is the net weight (750) the admin actually confirmed, never
 *    the weight the user declared. A user may ask to deposit 100g and the
 *    metal weigh 96g net once it is on the scale; 96 is what the wallet is
 *    credited with, so 96 is what the ledger says.
 *  - The voucher is written on the caller's transaction. A deposit that fails
 *    halfway must not leave a booked voucher behind claiming it happened.
 *
 * Failure to raise a voucher fails the movement. That is the point: a movement
 * the books do not know about is exactly what this exists to prevent, so it
 * must not be reachable by swallowing an error here.
 */
@Injectable()
export class WarehouseVoucherService {
  private readonly logger = new Logger(WarehouseVoucherService.name);

  constructor(private readonly accounting: AdminAccountingService) {}

  /**
   * Books the voucher for material taken into the vault.
   *
   * `netWeight` is the sum of the confirmed net weights of the packages that
   * were actually received — one package or several, if the delivery was split
   * at intake.
   */
  async issueForDeposit(
    queryRunner: any,
    request: WarehouseRequestEntity,
    netWeight: Decimal,
    adminId: string
  ): Promise<string | null> {
    return this.issue(queryRunner, request, netWeight, adminId, {
      source: VoucherSource.WAREHOUSE_DEPOSIT,
      category: VoucherCategory.DEPOSIT_ENTRY,
      movement: VoucherMovement.DEPOSIT,
      label: "واریز",
    });
  }

  /** Books the voucher for material released from the vault. */
  async issueForWithdraw(
    queryRunner: any,
    request: WarehouseRequestEntity,
    netWeight: Decimal,
    adminId: string
  ): Promise<string | null> {
    return this.issue(queryRunner, request, netWeight, adminId, {
      source: VoucherSource.WAREHOUSE_WITHDRAW,
      category: VoucherCategory.WITHDRAW_ENTRY,
      movement: VoucherMovement.WITHDRAW,
      label: "برداشت",
    });
  }

  private async issue(
    queryRunner: any,
    request: WarehouseRequestEntity,
    netWeight: Decimal,
    adminId: string,
    kind: { source: VoucherSource; category: VoucherCategory; movement: VoucherMovement; label: string }
  ): Promise<string | null> {
    // A movement that nets to nothing — a withdrawal fully absorbed by the
    // tolerance threshold, say — has nothing to book, and a zero-amount
    // voucher would be refused anyway.
    if (netWeight.lessThanOrEqualTo(0)) {
      this.logger.warn(
        `Skipping ${kind.label} voucher for request ${request.id}: net weight is ${netWeight.toString()}`
      );
      return null;
    }

    // A material symbol is what makes the amount mean anything; without it the
    // entry would be a bare number in no unit.
    if (!request.symbolId) {
      this.logger.warn(`Skipping ${kind.label} voucher for request ${request.id}: request carries no symbol`);
      return null;
    }

    const manager = queryRunner?.manager;
    const customerName = await this.customerName(manager, request.userId);

    const declared = new Decimal(request.declaredWeight ?? request.weight ?? 0);
    const variance = declared.minus(netWeight);

    const voucher = await this.accounting.issueSystemVoucher(
      {
        adminId,
        source: kind.source,
        category: kind.category,
        movement: kind.movement,
        symbolId: request.symbolId,
        amount: netWeight.toString(),
        customerId: request.userId ?? null,
        customerName,
        customerType: CustomerType.INFORMAL,
        description: `${kind.label} انبار — درخواست ${request.id}`,
        // The declared figure is worth carrying only when it disagreed with
        // what was confirmed; otherwise it is noise on every single entry.
        extraDescription: variance.isZero()
          ? null
          : `اعلام کاربر ${declared.toString()} گرم، تایید ادمین ${netWeight.toString()} گرم`,
        referenceId: request.id,
      },
      manager
    );

    this.logger.log(
      `Voucher ${voucher.voucherCode} booked for ${kind.label} request ${request.id} (${netWeight.toString()}g)`
    );

    return voucher.id;
  }

  /**
   * The customer name as it should read on the booked entry.
   *
   * Copied onto the voucher rather than joined at read time, so a voucher
   * still reads correctly after the user renames themselves or is removed —
   * which is the same reason `accounting_vouchers` carries `customer_name`
   * alongside the relation.
   */
  private async customerName(manager: any, userId?: string): Promise<string> {
    if (!userId || !manager) return "کاربر نامشخص";

    const user = await manager.findOne(UserEntity, { where: { id: userId } });
    if (!user) return "کاربر نامشخص";

    const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
    return name || user.phone || userId;
  }
}
