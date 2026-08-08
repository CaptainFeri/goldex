import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Links deposit/withdraw records (type=warehouse) to their warehouse_request
 * so the packet flow becomes the single source of truth for material
 * deposits/withdrawals.
 */
export class WarehouseLinkMig1000000000067 implements MigrationInterface {
  name = "WarehouseLinkMig1000000000067";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "deposit" ADD "warehouse_request_id" uuid`);
    await queryRunner.query(`ALTER TABLE "withdraw" ADD "warehouse_request_id" uuid`);

    await queryRunner.query(`CREATE INDEX "IDX_DEPOSIT_WAREHOUSE_REQUEST_ID" ON "deposit" ("warehouse_request_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_WITHDRAW_WAREHOUSE_REQUEST_ID" ON "withdraw" ("warehouse_request_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_WITHDRAW_WAREHOUSE_REQUEST_ID"`);
    await queryRunner.query(`DROP INDEX "IDX_DEPOSIT_WAREHOUSE_REQUEST_ID"`);

    await queryRunner.query(`ALTER TABLE "withdraw" DROP COLUMN "warehouse_request_id"`);
    await queryRunner.query(`ALTER TABLE "deposit" DROP COLUMN "warehouse_request_id"`);
  }
}
