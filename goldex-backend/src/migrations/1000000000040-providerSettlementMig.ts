import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

// Admin-recorded settlements with providers (offset the trading position).
export class ProviderSettlementMig1000000000040 implements MigrationInterface {
  name = "ProviderSettlementMig1000000000040";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'provider_settlements_direction_enum') THEN
          CREATE TYPE "provider_settlements_direction_enum" AS ENUM ('RECEIVE', 'PAY');
        END IF;
      END $$;`
    );
    await queryRunner.createTable(
      new Table({
        name: "provider_settlements",
        columns: [
          { name: "id", type: "uuid", isPrimary: true, generationStrategy: "uuid", default: "gen_random_uuid()" },
          { name: "provider_key", type: "varchar" },
          { name: "symbol", type: "varchar" },
          { name: "direction", type: "provider_settlements_direction_enum" },
          { name: "amount", type: "decimal", precision: 24, scale: 8 },
          { name: "note", type: "varchar", isNullable: true },
          { name: "admin_id", type: "uuid", isNullable: true },
          { name: "created_at", type: "timestamptz", default: "now()" },
        ],
      }),
      true
    );
    await queryRunner.createIndex(
      "provider_settlements",
      new TableIndex({ name: "IDX_provider_settlements_provider_symbol", columnNames: ["provider_key", "symbol"] })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("provider_settlements");
    await queryRunner.query(`DROP TYPE IF EXISTS "provider_settlements_direction_enum"`);
  }
}
