import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

/**
 * A deadline for credit requests held for admin sign-off.
 *
 * A request created on a level with `credit_require_admin_approval_for_creation`
 * freezes the user's collateral immediately and issues nothing, so without a
 * deadline an undecided request holds that collateral indefinitely. The level
 * sets how many hours it may wait; the cron declines anything older and returns
 * the collateral.
 *
 * Nullable, so existing levels keep today's behaviour (no deadline) until an
 * admin sets one.
 */
export class CreditRequestTtlMig1000000000107 implements MigrationInterface {
  name = "CreditRequestTtlMig1000000000107";

  private static readonly LEVEL_COLUMNS: TableColumn[] = [
    new TableColumn({
      name: "credit_request_approval_ttl_hours",
      type: "int",
      isNullable: true,
    }),
  ];

  public async up(queryRunner: QueryRunner): Promise<void> {
    await this.addMissing(
      queryRunner,
      "user_level",
      CreditRequestTtlMig1000000000107.LEVEL_COLUMNS,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await this.dropExisting(
      queryRunner,
      "user_level",
      CreditRequestTtlMig1000000000107.LEVEL_COLUMNS,
    );
  }

  private async addMissing(
    queryRunner: QueryRunner,
    tableName: string,
    columns: TableColumn[],
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    if (!table) return;
    const missing = columns.filter((c) => !table.findColumnByName(c.name));
    if (missing.length) await queryRunner.addColumns(tableName, missing);
  }

  private async dropExisting(
    queryRunner: QueryRunner,
    tableName: string,
    columns: TableColumn[],
  ): Promise<void> {
    const table = await queryRunner.getTable(tableName);
    if (!table) return;
    const present = columns.filter((c) => table.findColumnByName(c.name));
    if (present.length) await queryRunner.dropColumns(tableName, present);
  }
}
