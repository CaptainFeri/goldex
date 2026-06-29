import { MigrationInterface, QueryRunner, Table } from "typeorm";

// Per-provider aggregate of completed deals, fed from the pricing-engine over RabbitMQ.
export class ProviderDealSnapshotMig1000000000038 implements MigrationInterface {
  name = "ProviderDealSnapshotMig1000000000038";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "provider_deal_snapshots",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "gen_random_uuid()",
          },
          { name: "provider_key", type: "varchar", isUnique: true },
          { name: "deal_count", type: "int", default: 0 },
          { name: "total_volume", type: "decimal", precision: 24, scale: 8, default: 0 },
          { name: "total_value", type: "decimal", precision: 24, scale: 2, default: 0 },
          { name: "buy_volume", type: "decimal", precision: 24, scale: 8, default: 0 },
          { name: "sell_volume", type: "decimal", precision: 24, scale: 8, default: 0 },
          { name: "net_volume", type: "decimal", precision: 24, scale: 8, default: 0 },
          { name: "last_deal_at", type: "timestamptz", isNullable: true },
          { name: "updated_at", type: "timestamptz", default: "now()" },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("provider_deal_snapshots");
  }
}
