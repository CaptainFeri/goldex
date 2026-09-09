import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

/**
 * Credit configuration, three layers deep.
 *
 * 1. `price_pairs` gains the credit-deadline convention per side: a mode
 *    (NONE / RELATIVE / DAILY_CUTOFF), the wall-clock cutoff times the
 *    DAILY_CUTOFF mode needs, the timezone those times are read in, and the
 *    dated holiday exceptions on which the pair does not settle.
 * 2. `user_level` gains the credit risk defaults a per-pair config overrides —
 *    the margin-call ladder, the hop cap and the credit trade-size bounds.
 * 3. `user_level` gains the credit facility abilities: whether opening or
 *    settling needs an admin, whether the user may settle at all, and the
 *    cash-out terms.
 *
 * Every column is nullable so existing rows keep their current behaviour: a
 * pair with no mode still reads as RELATIVE against its existing hour columns,
 * and an unset rule is simply not enforced.
 */
export class CreditPairPolicyMig1000000000105 implements MigrationInterface {
  name = "CreditPairPolicyMig1000000000105";

  private static readonly PAIR_COLUMNS: TableColumn[] = [
    new TableColumn({ name: "buy_deadline_mode", type: "varchar", length: "20", isNullable: true }),
    new TableColumn({ name: "sell_deadline_mode", type: "varchar", length: "20", isNullable: true }),
    new TableColumn({ name: "buy_warn_time", type: "varchar", length: "5", isNullable: true }),
    new TableColumn({ name: "buy_expire_time", type: "varchar", length: "5", isNullable: true }),
    new TableColumn({ name: "sell_warn_time", type: "varchar", length: "5", isNullable: true }),
    new TableColumn({ name: "sell_expire_time", type: "varchar", length: "5", isNullable: true }),
    new TableColumn({
      name: "deadline_timezone",
      type: "varchar",
      length: "64",
      isNullable: true,
      default: "'Asia/Tehran'",
    }),
    new TableColumn({
      name: "holiday_dates",
      type: "varchar",
      length: "10",
      isArray: true,
      isNullable: true,
    }),
  ];

  private static readonly LEVEL_COLUMNS: TableColumn[] = [
    // Risk measurement defaults.
    new TableColumn({
      name: "credit_warning_margin_percent",
      type: "decimal",
      precision: 5,
      scale: 2,
      isNullable: true,
    }),
    new TableColumn({
      name: "credit_margin_call_percent",
      type: "decimal",
      precision: 5,
      scale: 2,
      isNullable: true,
    }),
    new TableColumn({
      name: "credit_liquidation_margin_percent",
      type: "decimal",
      precision: 5,
      scale: 2,
      isNullable: true,
    }),
    new TableColumn({ name: "credit_reduce_only_on_warning", type: "boolean", isNullable: true }),
    new TableColumn({ name: "credit_max_execution_level", type: "int", isNullable: true }),
    new TableColumn({
      name: "credit_min_trade_size",
      type: "decimal",
      precision: 20,
      scale: 8,
      isNullable: true,
    }),
    new TableColumn({
      name: "credit_max_trade_size",
      type: "decimal",
      precision: 20,
      scale: 8,
      isNullable: true,
    }),
    // Facility abilities.
    new TableColumn({
      name: "credit_require_admin_approval_for_creation",
      type: "boolean",
      isNullable: true,
      default: false,
    }),
    new TableColumn({
      name: "credit_require_admin_approval_for_settlement",
      type: "boolean",
      isNullable: true,
      default: false,
    }),
    new TableColumn({
      name: "credit_allow_user_settlement",
      type: "boolean",
      isNullable: true,
      default: true,
    }),
    new TableColumn({
      name: "credit_cashout_enabled",
      type: "boolean",
      isNullable: true,
      default: true,
    }),
    new TableColumn({
      name: "credit_cashout_fee_percent",
      type: "decimal",
      precision: 5,
      scale: 2,
      isNullable: true,
    }),
    new TableColumn({ name: "credit_allowed_cashout_sources", type: "jsonb", isNullable: true }),
    new TableColumn({ name: "credit_settlement_methods", type: "jsonb", isNullable: true }),
    new TableColumn({
      name: "credit_netting_enabled",
      type: "boolean",
      isNullable: true,
      default: false,
    }),
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addMissing(queryRunner, "price_pairs", CreditPairPolicyMig1000000000105.PAIR_COLUMNS);
    await this.addMissing(queryRunner, "user_level", CreditPairPolicyMig1000000000105.LEVEL_COLUMNS);

    // Pairs that already carry hour limits keep behaving exactly as before by
    // being stamped with the mode those columns always meant.
    const pairs = await queryRunner.getTable("price_pairs");
    if (pairs) {
      await queryRunner.query(`
        UPDATE price_pairs
           SET buy_deadline_mode = CASE
                 WHEN buy_warn_hours IS NOT NULL OR buy_expire_hours IS NOT NULL THEN 'RELATIVE'
                 ELSE 'NONE' END,
               sell_deadline_mode = CASE
                 WHEN sell_warn_hours IS NOT NULL OR sell_expire_hours IS NOT NULL THEN 'RELATIVE'
                 ELSE 'NONE' END
         WHERE buy_deadline_mode IS NULL AND sell_deadline_mode IS NULL
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropExisting(
      queryRunner,
      "user_level",
      CreditPairPolicyMig1000000000105.LEVEL_COLUMNS,
    );
    await this.dropExisting(
      queryRunner,
      "price_pairs",
      CreditPairPolicyMig1000000000105.PAIR_COLUMNS,
    );
  }

  private async addMissing(
    queryRunner: QueryRunner,
    tableName: string,
    columns: TableColumn[],
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    if (!table) return;
    for (const column of columns) {
      if (!table.findColumnByName(column.name)) {
        await queryRunner.addColumn(tableName, column);
      }
    }
  }

  private async dropExisting(
    queryRunner: QueryRunner,
    tableName: string,
    columns: TableColumn[],
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    if (!table) return;
    for (const column of columns) {
      if (table.findColumnByName(column.name)) {
        await queryRunner.dropColumn(tableName, column.name);
      }
    }
  }
}
