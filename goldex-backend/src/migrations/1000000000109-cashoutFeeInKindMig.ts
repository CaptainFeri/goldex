import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

/**
 * The cash-out fee is charged in the asset being liquidated, not in currency:
 * cashing out 5g of gold at 4% keeps 0.2g of gold and books 0.2g of gold.
 *
 * So `credit_cashout.fee_amount` changes unit, and a row has to say which unit
 * it is in or history becomes unreadable — fees charged before this were real
 * currency amounts and must not be relabelled as grams. Existing rows are
 * backfilled to the facility's credit currency with `fee_value` equal to the fee
 * they already held; new rows name the traded asset.
 *
 * `net_asset_amount` records what the deposit wallet actually received, which
 * now differs from `asset_amount` by the in-kind fee. Older rows had no fee
 * withheld from the asset, so their net equals the gross.
 */
export class CashoutFeeInKindMig1000000000109 implements MigrationInterface {
  name = "CashoutFeeInKindMig1000000000109";

  private static readonly COLUMNS: TableColumn[] = [
    new TableColumn({ name: "fee_symbol_id", type: "uuid", isNullable: true }),
    new TableColumn({
      name: "fee_value",
      type: "decimal",
      precision: 20,
      scale: 8,
      default: 0,
      isNullable: false,
    }),
    new TableColumn({
      name: "net_asset_amount",
      type: "decimal",
      precision: 20,
      scale: 8,
      default: 0,
      isNullable: false,
    }),
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("credit_cashout");
    if (!table) return;

    const missing = CashoutFeeInKindMig1000000000109.COLUMNS.filter(
      (c) => !table.findColumnByName(c.name),
    );
    if (missing.length) await queryRunner.addColumns("credit_cashout", missing);

    // Existing fees were charged in the facility's credit currency and were
    // already that currency's amount, so the value equals the fee.
    await queryRunner.query(`
      UPDATE credit_cashout cc
         SET fee_symbol_id = c.credit_base_symbol_id,
             fee_value = cc.fee_amount
        FROM credit c
       WHERE c.id = cc.credit_id
         AND cc.fee_symbol_id IS NULL
    `);

    // No fee was withheld from the asset before, so the user received all of it.
    await queryRunner.query(`
      UPDATE credit_cashout
         SET net_asset_amount = asset_amount
       WHERE net_asset_amount = 0
         AND asset_amount <> 0
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("credit_cashout");
    if (!table) return;
    const present = CashoutFeeInKindMig1000000000109.COLUMNS.filter((c) =>
      table.findColumnByName(c.name),
    );
    if (present.length) await queryRunner.dropColumns("credit_cashout", present);
  }
}
