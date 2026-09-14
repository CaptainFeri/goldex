import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * A ledger of metal physically crossing the warehouse door.
 *
 * Until now this happened as a side effect of three service methods and left
 * nothing queryable behind. `warehouse_history` records what an operator did,
 * in prose — it has no direction, no signed weight and no counterparty column —
 * so "what entered warehouse 1 today, and from whom" could not be answered
 * without reading descriptions.
 *
 * Backfilled from the history rows that recorded the same events, so the ledger
 * does not start empty on an existing database. Only the two actions that mark
 * a completed crossing are taken, and only where the history row names the
 * warehouse and the weight can be recovered from the linked packages.
 */
export class WarehouseMovementMig1000000000111 implements MigrationInterface {
  name = "WarehouseMovementMig1000000000111";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'warehouse_movement_direction_enum') THEN
          CREATE TYPE "warehouse_movement_direction_enum" AS ENUM ('IN', 'OUT');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'warehouse_movement_party_type_enum') THEN
          CREATE TYPE "warehouse_movement_party_type_enum" AS ENUM ('USER', 'PROVIDER', 'SYSTEM');
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'warehouse_movement_source_enum') THEN
          CREATE TYPE "warehouse_movement_source_enum" AS ENUM
            ('DEPOSIT_REQUEST', 'WITHDRAW_REQUEST', 'SETTLEMENT', 'MANUAL', 'WASTAGE');
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "warehouse_movement" (
        "id"            uuid NOT NULL DEFAULT gen_random_uuid(),
        "created_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at"    TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "deleted_at"    TIMESTAMP WITH TIME ZONE,
        "warehouse_id"  uuid NOT NULL,
        "direction"     "warehouse_movement_direction_enum" NOT NULL,
        "source"        "warehouse_movement_source_enum" NOT NULL,
        "net_weight"    decimal(20,8) NOT NULL,
        "symbol_id"     uuid,
        "party_type"    "warehouse_movement_party_type_enum" NOT NULL,
        "party_user_id" uuid,
        "provider_key"  varchar(100),
        "packet_ids"    jsonb,
        "request_id"    uuid,
        "settlement_id" uuid,
        "voucher_id"    uuid,
        "admin_id"      uuid,
        "notes"         text,
        "metadata"      jsonb,
        CONSTRAINT "PK_WAREHOUSE_MOVEMENT" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_MOVEMENT_WAREHOUSE_CREATED"
         ON "warehouse_movement" ("warehouse_id", "created_at" DESC)`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_MOVEMENT_DIRECTION_CREATED"
         ON "warehouse_movement" ("direction", "created_at" DESC)`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_MOVEMENT_PARTY_USER" ON "warehouse_movement" ("party_user_id")`
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_MOVEMENT_PROVIDER_KEY" ON "warehouse_movement" ("provider_key")`
    );

    // Intake: the history row written when an admin confirmed material, priced
    // from the packages that intake produced.
    await queryRunner.query(`
      INSERT INTO "warehouse_movement"
        ("created_at", "warehouse_id", "direction", "source", "net_weight", "symbol_id",
         "party_type", "party_user_id", "packet_ids", "request_id", "admin_id", "metadata")
      SELECT h."created_at",
             h."warehouse_id",
             'IN',
             'DEPOSIT_REQUEST',
             COALESCE(p."total", 0),
             r."symbol_id",
             'USER',
             r."user_id",
             p."ids",
             r."id",
             r."admin_id",
             jsonb_build_object('backfilledFrom', 'warehouse_history')
        FROM "warehouse_history" h
        JOIN "warehouse_request" r ON r."id" = h."request_id"
        LEFT JOIN LATERAL (
              SELECT COALESCE(SUM(pk."pure_weight"), 0) AS "total",
                     jsonb_agg(pk."id") AS "ids"
                FROM "packet" pk
               WHERE pk."source_request_id" = r."id"
             ) p ON true
       WHERE h."action" = 'DEPOSIT_MATERIAL_CONFIRMED'
         AND h."warehouse_id" IS NOT NULL
         AND COALESCE(p."total", 0) > 0
    `);

    // Release: the history row written when packages were handed over.
    await queryRunner.query(`
      INSERT INTO "warehouse_movement"
        ("created_at", "warehouse_id", "direction", "source", "net_weight", "symbol_id",
         "party_type", "party_user_id", "request_id", "admin_id", "metadata")
      SELECT h."created_at",
             h."warehouse_id",
             'OUT',
             'WITHDRAW_REQUEST',
             COALESCE((h."metadata" ->> 'exitedWeight')::decimal, 0),
             r."symbol_id",
             'USER',
             r."user_id",
             r."id",
             r."admin_id",
             jsonb_build_object('backfilledFrom', 'warehouse_history')
        FROM "warehouse_history" h
        JOIN "warehouse_request" r ON r."id" = h."request_id"
       WHERE h."action" = 'WITHDRAW_DELIVERED'
         AND h."warehouse_id" IS NOT NULL
         AND COALESCE((h."metadata" ->> 'exitedWeight')::decimal, 0) > 0
    `);

    // Packing out of provider settlement material.
    await queryRunner.query(`
      INSERT INTO "warehouse_movement"
        ("created_at", "warehouse_id", "direction", "source", "net_weight", "symbol_id",
         "party_type", "provider_key", "packet_ids", "settlement_id", "metadata")
      SELECT pk."created_at",
             pk."warehouse_id",
             'IN',
             'SETTLEMENT',
             pk."pure_weight" + COALESCE(pk."wastage", 0),
             pk."symbol_id",
             'PROVIDER',
             pk."provider_key",
             jsonb_build_array(pk."id"),
             pk."settlement_id",
             jsonb_build_object('backfilledFrom', 'packet')
        FROM "packet" pk
       WHERE pk."provider_key" IS NOT NULL
         AND pk."warehouse_id" IS NOT NULL
         AND pk."deleted_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "warehouse_movement"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "warehouse_movement_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "warehouse_movement_party_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "warehouse_movement_direction_enum"`);
  }
}
