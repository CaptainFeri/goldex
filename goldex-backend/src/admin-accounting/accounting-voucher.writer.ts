import { Injectable } from "@nestjs/common";
import { EntityManager } from "typeorm";
import jMoment from "moment-jalaali";
import { AccountingVoucherEntity } from "./entity/accounting-voucher.entity";
import {
  CustomerType,
  VoucherCategory,
  VoucherMovement,
  VoucherSide,
  VoucherStatus,
  WalletSubset,
} from "./accounting.enums";

/** Who the entry is against and what moved. */
export interface OperationVoucherInput {
  customerId: string | null;
  customerName: string;
  customerType: CustomerType;
  category: VoucherCategory;
  movement: VoucherMovement;
  symbolId: string;
  /** In the symbol's own units. Always positive — direction lives in `movement`. */
  amount: string;
  walletType: string;
  walletSubset: WalletSubset;
  description: string;
  extraDescription?: string | null;
  documentDate: Date;
  createdBy: string;
}

/**
 * Writes accounting vouchers, and owns the voucher numbering.
 *
 * Two callers need it: the accounting desk, where a voucher is the operation and
 * starts as a reviewable draft, and a wallet operation an admin performs, where
 * the money has already moved and the voucher is the record of it. Both have to
 * draw from the same number series, so the numbering lives here rather than
 * being duplicated either side.
 */
@Injectable()
export class AccountingVoucherWriter {
  /**
   * A voucher for a balance change the admin is making right now, booked
   * FINALIZED inside the caller's transaction.
   *
   * Finalized because the transfer is happening in this same transaction: a
   * voucher left for review could be refused after the money had already moved,
   * and the books would disagree with the wallet with no way to reconcile them.
   * The reviewed draft flow still applies to vouchers entered on their own.
   */
  async recordOperation(
    manager: EntityManager,
    input: OperationVoucherInput,
  ): Promise<AccountingVoucherEntity> {
    const now = new Date();
    return this.insertWithCode(manager, {
      ...input,
      side: sideFor(input.movement),
      status: VoucherStatus.FINALIZED,
      // The admin who moved the money is the authority for the entry, so it is
      // booked under them rather than waiting for a second pair of eyes.
      reviewedBy: input.createdBy,
      reviewedAt: now,
      reviewNote: "Booked with the wallet operation it records",
    });
  }

  /** A voucher entered on its own, which a second operator reviews. */
  async createDraft(
    manager: EntityManager,
    input: OperationVoucherInput,
  ): Promise<AccountingVoucherEntity> {
    return this.insertWithCode(manager, {
      ...input,
      side: sideFor(input.movement),
      status: VoucherStatus.DRAFT,
    });
  }

  /**
   * Insert under the next free code, retrying if another writer took it first.
   *
   * `voucher_code` is unique and a code is never reused, so two admins booking in
   * the same Jalali month can collide on the number. The loop resolves that
   * rather than failing an operation whose money has already moved.
   */
  private async insertWithCode(
    manager: EntityManager,
    data: Omit<AccountingVoucherEntity, keyof AccountingVoucherEntity> &
      Partial<AccountingVoucherEntity>,
    attempts = 5,
  ): Promise<AccountingVoucherEntity> {
    for (let attempt = 1; ; attempt += 1) {
      const voucherCode = await this.nextVoucherCode(manager);
      try {
        return await manager.save(
          AccountingVoucherEntity,
          manager.create(AccountingVoucherEntity, { ...data, voucherCode }),
        );
      } catch (error) {
        const isDuplicate = (error as { code?: string })?.code === "23505";
        if (!isDuplicate || attempt >= attempts) throw error;
      }
    }
  }

  /**
   * The next code in the current Jalali month's series, e.g. `DOC-14050012`.
   *
   * Taken from the highest number in use rather than from a row count: a count
   * hands the same number out again after *any* voucher in the month is removed,
   * where the highest only repeats if that top row itself is deleted. Vouchers
   * are immutable once booked, so in practice neither happens — this is the
   * safer of the two reads, not a guarantee against deletion.
   */
  private async nextVoucherCode(manager: EntityManager): Promise<string> {
    const now = jMoment();
    const prefix = `DOC-${now.jYear()}${String(now.jMonth() + 1).padStart(2, "0")}`;
    const [{ max }] = await manager.query(
      `SELECT MAX(NULLIF(regexp_replace(voucher_code, '^' || $2, ''), '')::int) AS max
         FROM accounting_vouchers
        WHERE voucher_code LIKE $1`,
      [`${prefix}%`, prefix],
    );
    return `${prefix}${String((Number(max) || 0) + 1).padStart(4, "0")}`;
  }
}

/**
 * The accounting side implied by the movement. A deposit increases what the
 * platform owes the customer, so they stand as creditor; a withdrawal reduces it
 * and they stand as debtor. Never taken from a request.
 */
export function sideFor(movement: VoucherMovement): VoucherSide {
  return movement === VoucherMovement.DEPOSIT ? VoucherSide.CREDITOR : VoucherSide.DEBTOR;
}
