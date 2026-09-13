import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Provenance and symbol columns for `packet`, plus the weight/voucher columns
 * on `warehouse_request`, for the Warehouse V2 rework (WAREHOUSE-V2-PLAN.md).
 *
 * A package in the warehouse is a fungible unit: the one user 1 brought in may
 * be handed to user 2 on their withdrawal, because user 1's holding lives in
 * their digital wallet and not in a particular piece of metal. What must
 * survive that is the audit chain, so who handed a package in and who took it
 * out become recorded facts on the row rather than a claim of ownership:
 *
 *  - sender_user_id / received_by_admin_id  — written once, at intake.
 *  - delivered_to_user_id / delivered_by_admin_id — written once, at release.
 *
 * `user_id` keeps its old meaning (the current holder) and is what a later
 * migration empties when the package joins the system pool; these four never
 * change after they are written.
 *
 * `symbol_id` closes a real hole: allocation matched packages by weight alone,
 * so a request for gold could be served a package of silver. Nothing can
 * enforce that until the packet row says which material it holds.
 *
 * `provider_key` / `settlement_id` replace parsing the provider out of the
 * `batch_number` string (`STL-<provider>-<timestamp>`), which is what the
 * unpacked-material balance would otherwise have to rely on.
 *
 * `declared_weight` / `actual_weight` keep the user's stated figure and the
 * admin's confirmed one apart. The confirmed one is what the wallet is
 * credited with; the declared one is kept only so the variance is auditable.
 */
export class WarehouseProvenanceMig1000000000107 implements MigrationInterface {
  name = "WarehouseProvenanceMig1000000000107";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const packet = await queryRunner.getTable("packet");

    if (packet) {
      const addPacketColumn = async (name: string, definition: string) => {
        if (!packet.findColumnByName(name)) {
          await queryRunner.query(`ALTER TABLE "packet" ADD "${name}" ${definition}`);
        }
      };

      await addPacketColumn("symbol_id", "uuid");
      await addPacketColumn("sender_user_id", "uuid");
      await addPacketColumn("received_by_admin_id", "uuid");
      await addPacketColumn("delivered_to_user_id", "uuid");
      await addPacketColumn("delivered_by_admin_id", "uuid");
      await addPacketColumn("source_request_id", "uuid");
      await addPacketColumn("provider_key", "varchar(100)");
      await addPacketColumn("settlement_id", "uuid");

      // The allocation query filters on all four and orders by weight.
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_PACKET_ALLOCATION"
           ON "packet" ("warehouse_id", "status", "symbol_id", "pure_weight")`
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_PACKET_SENDER_USER_ID" ON "packet" ("sender_user_id")`
      );
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_PACKET_PROVIDER_KEY" ON "packet" ("provider_key")`
      );

      // Backfill: whoever holds a package today is the one who handed it in.
      // Only rows that came from a user deposit — a settlement package has no
      // sender, and claiming one would misreport where that gold came from.
      await queryRunner.query(`
        UPDATE "packet"
           SET "sender_user_id" = "user_id"
         WHERE "user_id" IS NOT NULL
           AND "sender_user_id" IS NULL
           AND COALESCE("is_orphan", false) = false
      `);

      // Backfill: settlement packages carry their provider in the batch number
      // as `STL-<provider>-<timestamp>`. Everything between the first and last
      // dash is the provider key, which may itself contain dashes
      // (e.g. `mock-zaryar-a`).
      await queryRunner.query(`
        UPDATE "packet"
           SET "provider_key" = substring("batch_number" from '^STL-(.*)-[0-9]+$')
         WHERE "batch_number" LIKE 'STL-%'
           AND "provider_key" IS NULL
           AND substring("batch_number" from '^STL-(.*)-[0-9]+$') IS NOT NULL
      `);
    }

    const request = await queryRunner.getTable("warehouse_request");

    if (request) {
      if (!request.findColumnByName("declared_weight")) {
        await queryRunner.query(`ALTER TABLE "warehouse_request" ADD "declared_weight" decimal(20,8)`);
        // Every existing request's `weight` is what the user asked for.
        await queryRunner.query(`UPDATE "warehouse_request" SET "declared_weight" = "weight"`);
      }
      if (!request.findColumnByName("actual_weight")) {
        await queryRunner.query(`ALTER TABLE "warehouse_request" ADD "actual_weight" decimal(20,8)`);
      }
      if (!request.findColumnByName("voucher_id")) {
        await queryRunner.query(`ALTER TABLE "warehouse_request" ADD "voucher_id" uuid`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const request = await queryRunner.getTable("warehouse_request");

    if (request) {
      for (const column of ["voucher_id", "actual_weight", "declared_weight"]) {
        if (request.findColumnByName(column)) {
          await queryRunner.query(`ALTER TABLE "warehouse_request" DROP COLUMN "${column}"`);
        }
      }
    }

    const packet = await queryRunner.getTable("packet");

    if (packet) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PACKET_PROVIDER_KEY"`);
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PACKET_SENDER_USER_ID"`);
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PACKET_ALLOCATION"`);

      for (const column of [
        "settlement_id",
        "provider_key",
        "source_request_id",
        "delivered_by_admin_id",
        "delivered_to_user_id",
        "received_by_admin_id",
        "sender_user_id",
        "symbol_id",
      ]) {
        if (packet.findColumnByName(column)) {
          await queryRunner.query(`ALTER TABLE "packet" DROP COLUMN "${column}"`);
        }
      }
    }
  }
}
