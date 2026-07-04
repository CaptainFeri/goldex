import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

// Time-limited activation window for users (partners especially).
export class UserActiveUntilMig1000000000043 implements MigrationInterface {
  name = "UserActiveUntilMig1000000000043";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("user");
    if (table && !table.findColumnByName("active_until")) {
      await queryRunner.addColumn(
        "user",
        new TableColumn({ name: "active_until", type: "timestamp", isNullable: true })
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("user");
    if (table && table.findColumnByName("active_until")) {
      await queryRunner.dropColumn("user", "active_until");
    }
  }
}
