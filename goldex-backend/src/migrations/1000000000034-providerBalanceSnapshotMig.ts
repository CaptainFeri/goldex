import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class ProviderBalanceSnapshotMig1000000000034 implements MigrationInterface {
  name = "ProviderBalanceSnapshotMig1000000000034";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "provider_balance_snapshots",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "gen_random_uuid()",
          },
          { name: "provider_key", type: "varchar", isUnique: true },
          { name: "gold_balance", type: "decimal", precision: 20, scale: 8, isNullable: true },
          { name: "rial_balance", type: "decimal", precision: 20, scale: 2, isNullable: true },
          { name: "updated_at", type: "timestamptz", default: "now()" },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("provider_balance_snapshots");
  }
}
