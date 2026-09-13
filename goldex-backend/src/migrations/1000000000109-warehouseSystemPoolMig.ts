import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Moves the vault to a single pool of fungible packages, and gives a package
 * a way to be held for one request while an admin works on it.
 *
 * A package in the warehouse is a tradable unit with no name on it: the one
 * user 1 handed in may be released to user 2 on their withdrawal, because
 * user 1's holding lives in their wallet and not in a particular piece of
 * metal. Packages already on the shelf were written under the old rule, where
 * a deposit stayed under its depositor, so they are moved across here —
 * leaving them behind would split the vault into two classes of package, half
 * of it unallocatable to anyone but its original depositor.
 *
 * The depositor is not lost in the move: `sender_user_id` was backfilled from
 * `user_id` by migration 107 and is what records who handed each one in. That
 * is also what makes this reversible.
 *
 * `RESERVED` closes a race the old flow had no answer for. Assignment used to
 * mark a package IN_WAREHOUSE under the requesting user, which is
 * indistinguishable from a package simply sitting on the shelf, so two
 * withdrawals could be approved against the same metal. A reserved package is
 * visibly not free, and `reserved_for_request_id` says which request holds it —
 * needed because a combination allocation ties several packages to one request
 * and `warehouse_request.packet_id` can only point at one of them.
 */
export class WarehouseSystemPoolMig1000000000109 implements MigrationInterface {
  name = "WarehouseSystemPoolMig1000000000109";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
           WHERE t.typname = 'packet_status_enum' AND e.enumlabel = 'RESERVED'
        ) THEN
          ALTER TYPE "packet_status_enum" ADD VALUE 'RESERVED';
        END IF;
      END
      $$;
    `);

    const packet = await queryRunner.getTable("packet");
    if (!packet) return;

    if (!packet.findColumnByName("reserved_for_request_id")) {
      await queryRunner.query(`ALTER TABLE "packet" ADD "reserved_for_request_id" uuid`);
      await queryRunner.query(
        `CREATE INDEX IF NOT EXISTS "IDX_PACKET_RESERVED_FOR" ON "packet" ("reserved_for_request_id")`
      );
    }

    // Packages sitting on the shelf under a depositor join the pool. Only
    // IN_WAREHOUSE rows: a PENDING one is a placeholder for a delivery that has
    // not arrived, and WITHDRAWN/RELEASED ones already left.
    await queryRunner.query(`
      UPDATE "packet"
         SET "sender_user_id" = COALESCE("sender_user_id", "user_id"),
             "user_id" = NULL,
             "is_orphan" = true,
             "status" = 'ORPHAN'
       WHERE "status" = 'IN_WAREHOUSE'
         AND "user_id" IS NOT NULL
         AND COALESCE("is_orphan", false) = false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const packet = await queryRunner.getTable("packet");
    if (!packet) return;

    // Hand the shelf back to the depositors it was taken from. Only rows this
    // migration could have moved: an orphan with a sender is one that came
    // from a user deposit, which is exactly what `up` emptied.
    await queryRunner.query(`
      UPDATE "packet"
         SET "user_id" = "sender_user_id",
             "is_orphan" = false,
             "status" = 'IN_WAREHOUSE'
       WHERE "status" = 'ORPHAN'
         AND "user_id" IS NULL
         AND "sender_user_id" IS NOT NULL
    `);

    // Anything held for a request goes back on the shelf; RESERVED is about to
    // stop being a value the enum has.
    await queryRunner.query(`
      UPDATE "packet"
         SET "status" = 'ORPHAN', "reserved_for_request_id" = NULL
       WHERE "status" = 'RESERVED'
    `);

    if (packet.findColumnByName("reserved_for_request_id")) {
      await queryRunner.query(`DROP INDEX IF EXISTS "IDX_PACKET_RESERVED_FOR"`);
      await queryRunner.query(`ALTER TABLE "packet" DROP COLUMN "reserved_for_request_id"`);
    }

    // Postgres cannot drop a single enum label, so the type is rebuilt without
    // it. Safe only because the statement above left no row using it.
    await queryRunner.query(`ALTER TYPE "packet_status_enum" RENAME TO "packet_status_enum_old"`);
    await queryRunner.query(
      `CREATE TYPE "packet_status_enum" AS ENUM ('PENDING', 'IN_WAREHOUSE', 'RELEASED', 'WITHDRAWN', 'ORPHAN')`
    );
    await queryRunner.query(`ALTER TABLE "packet" ALTER COLUMN "status" DROP DEFAULT`);
    await queryRunner.query(
      `ALTER TABLE "packet" ALTER COLUMN "status" TYPE "packet_status_enum" USING "status"::text::"packet_status_enum"`
    );
    await queryRunner.query(`ALTER TABLE "packet" ALTER COLUMN "status" SET DEFAULT 'PENDING'`);
    await queryRunner.query(`DROP TYPE "packet_status_enum_old"`);
  }
}
