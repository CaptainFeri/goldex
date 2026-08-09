import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds Packing/QC fields to "packet" per warehouse-roadmap.html:
 * - apparent_weight: Precise physical weight read from the scale (وزن ظاهری).
 * - wastage: Physical loss during packing/severing (انگی) in grams.
 * - parent_id: For split children — links back to the parent package
 *   so mass conservation (children + wastage == parent) is verifiable.
 */
export class PacketQcFieldsMig1000000000068 implements MigrationInterface {
  name = "PacketQcFieldsMig1000000000068";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("packet");
    if (!table) return;

    if (!table.findColumnByName("apparent_weight")) {
      await queryRunner.query(
        `ALTER TABLE "packet" ADD "apparent_weight" decimal(20,8)`
      );
    }
    if (!table.findColumnByName("wastage")) {
      await queryRunner.query(
        `ALTER TABLE "packet" ADD "wastage" decimal(20,8)`
      );
    }
    if (!table.findColumnByName("parent_id")) {
      await queryRunner.query(
        `ALTER TABLE "packet" ADD "parent_id" uuid`
      );
      await queryRunner.query(
        `CREATE INDEX "IDX_PACKET_PARENT_ID" ON "packet" ("parent_id")`
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("packet");
    if (!table) return;

    if (table.findColumnByName("parent_id")) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PACKET_PARENT_ID"`);
      await queryRunner.query(`ALTER TABLE "packet" DROP COLUMN "parent_id"`);
    }
    if (table.findColumnByName("wastage")) {
      await queryRunner.query(`ALTER TABLE "packet" DROP COLUMN "wastage"`);
    }
    if (table.findColumnByName("apparent_weight")) {
      await queryRunner.query(`ALTER TABLE "packet" DROP COLUMN "apparent_weight"`);
    }
  }
}