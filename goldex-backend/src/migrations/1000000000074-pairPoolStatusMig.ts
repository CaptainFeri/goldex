import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from "typeorm";

export class PairPoolStatusMig1000000000074 implements MigrationInterface {
  name = "PairPoolStatusMig1000000000074";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "pair_pool_status",
        columns: [
          {
            name: "pair_id",
            type: "uuid",
            isPrimary: true,
            isNullable: false,
          },
          {
            name: "pool_type",
            type: "varchar",
            length: "20",
            isPrimary: true,
            isNullable: false,
          },
          {
            name: "derived_status",
            type: "varchar",
            length: "20",
            isNullable: false,
          },
          {
            name: "admin_override",
            type: "varchar",
            length: "20",
            isNullable: true,
          },
          {
            name: "effective_status",
            type: "varchar",
            length: "20",
            isNullable: false,
          },
          {
            name: "reason",
            type: "text",
            isNullable: true,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updated_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            onUpdate: "CURRENT_TIMESTAMP",
          },
        ],
      }),
      true,
    );

    await queryRunner.createForeignKey(
      "pair_pool_status",
      new TableForeignKey({
        columnNames: ["pair_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "price_pairs",
        onDelete: "CASCADE",
      }),
    );

    await queryRunner.createIndex(
      "pair_pool_status",
      new TableIndex({
        name: "IDX_pair_pool_status_effective",
        columnNames: ["effective_status"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("pair_pool_status");
    if (table) {
      const fk = table.foreignKeys.find((f) => f.columnNames.indexOf("pair_id") !== -1);
      if (fk) await queryRunner.dropForeignKey("pair_pool_status", fk.name);
      await queryRunner.dropTable("pair_pool_status");
    }
  }
}
