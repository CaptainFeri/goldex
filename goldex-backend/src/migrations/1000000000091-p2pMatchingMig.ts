import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Rial peer-to-peer matching and settlement.
 *
 * A withdrawer's request is filled by depositors who transfer real rial to the
 * withdrawer's bank account; the platform then moves the internal balance from
 * withdrawer to depositor. Platform-wide rial is conserved on every confirmed
 * part, which is what the reconciliation worker checks.
 *
 * The p2p detail hangs off the existing `withdraw` / `deposit` rows rather than
 * replacing them, so KYC gating, level limits, admin lists and notifications
 * keep working unchanged for every symbol type.
 */
export class P2pMatchingMig1000000000091 implements MigrationInterface {
  name = "P2pMatchingMig1000000000091";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. Enums ────────────────────────────────────────────────────────
    const enums: Array<[string, string[]]> = [
      ["p2p_withdraw_state_enum", [
        "DRAFT", "PENDING_MATCHING", "PARTIALLY_MATCHED", "ADMIN_SETTLEMENT",
        "COMPLETED", "EXPIRED", "CANCELLED",
      ]],
      ["p2p_intent_state_enum", [
        "CREATED", "MATCHING", "NO_MATCH", "RESERVED", "AWAITING_PAYMENT",
        "PAYMENT_PROOF_SUBMITTED", "WAITING_WITHDRAWER_CONFIRMATION",
        "REJECTED_BY_WITHDRAWER", "WITHDRAWER_RESPONSE_TIMEOUT", "ESCALATED_TO_ADMIN",
        "CONFIRMED", "REJECTED", "REFUNDED", "MORE_INFO_REQUESTED", "EXPIRED", "CANCELLED",
      ]],
      ["p2p_part_status_enum", ["OPEN", "RESERVED", "PAID_PENDING", "CONFIRMED", "CANCELLED", "EXPIRED"]],
      ["p2p_match_status_enum", [
        "RESERVED", "AWAITING_PAYMENT", "PROOF_SUBMITTED", "WAITING_CONFIRMATION",
        "CONFIRMED", "REJECTED_BY_WITHDRAWER", "RESPONSE_TIMEOUT", "ESCALATED",
        "RESERVATION_EXPIRED", "CANCELLED",
      ]],
      ["p2p_split_policy_enum", ["EXACT", "MAXIMUM", "RANGE"]],
      ["p2p_match_source_enum", ["CUSTOMER", "ADMIN"]],
      ["p2p_escalation_reason_enum", [
        "WITHDRAWER_REJECT", "WITHDRAWER_NO_RESPONSE", "SETTLEMENT_TIMEOUT",
        "RECEIPT_MISMATCH", "DUPLICATE_PAYMENT", "ADMIN_ACCOUNT_UNAVAILABLE",
      ]],
      ["p2p_escalation_status_enum", ["OPEN", "ASSIGNED", "RESOLVED", "VOID"]],
      ["p2p_resolution_type_enum", [
        "CONFIRM_PAYMENT", "REJECT_PAYMENT", "REQUEST_MORE_EVIDENCE",
        "SETTLE_FROM_ADMIN", "REOPEN_MATCHING", "CANCEL_REQUEST",
      ]],
      ["p2p_audit_actor_enum", ["USER", "ADMIN", "SYSTEM"]],
    ];
    for (const [name, values] of enums) {
      const list = values.map((v) => `'${v}'`).join(", ");
      await queryRunner.query(`
        DO $$ BEGIN CREATE TYPE "${name}" AS ENUM (${list});
        EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      `);
    }

    // The ledger gains the four p2p movement types.
    for (const value of [
      "P2P_WITHDRAW_LOCK", "P2P_WITHDRAW_SETTLE", "P2P_WITHDRAW_RELEASE",
      "P2P_DEPOSIT_SETTLE", "P2P_ADMIN_SETTLE",
    ]) {
      await queryRunner.query(`
        DO $$
        DECLARE enum_name text;
        BEGIN
          SELECT t.typname INTO enum_name
            FROM pg_type t
            JOIN pg_attribute a ON a.atttypid = t.oid
            JOIN pg_class c ON c.oid = a.attrelid
           WHERE c.relname = 'transaction' AND a.attname = 'transaction_type';
          IF enum_name IS NOT NULL THEN
            EXECUTE format('ALTER TYPE %I ADD VALUE IF NOT EXISTS %L', enum_name, '${value}');
          END IF;
        END $$;
      `);
    }

    // ── 2. Withdrawal side ──────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "p2p_withdraw_request" (
        "id"                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"        timestamptz DEFAULT now(),
        "updated_at"        timestamptz DEFAULT now(),
        "deleted_at"        timestamptz,
        "withdraw_id"       uuid NOT NULL UNIQUE REFERENCES "withdraw"("id") ON DELETE CASCADE,
        "user_id"           uuid NOT NULL,
        "symbol_id"         uuid NOT NULL,
        "total_amount"      numeric(20,8) NOT NULL,
        "completed_amount"  numeric(20,8) NOT NULL DEFAULT 0,
        "remaining_amount"  numeric(20,8) NOT NULL,
        "locked_amount"     numeric(20,8) NOT NULL DEFAULT 0,
        "split_policy"      "p2p_split_policy_enum" NOT NULL,
        "required_parts"    integer,
        "min_parts"         integer,
        "max_parts"         integer,
        "min_part_amount"   numeric(20,8),
        "max_part_amount"   numeric(20,8),
        "preferred_bank"    varchar,
        "allowed_from"      timestamptz,
        "allowed_until"     timestamptz,
        "free_conditions"   text,
        "destination_bank_account_id" uuid,
        "destination_snapshot_json"   jsonb,
        "state"             "p2p_withdraw_state_enum" NOT NULL DEFAULT 'PENDING_MATCHING',
        "expires_at"        timestamptz,
        "version"           integer NOT NULL DEFAULT 1
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_p2p_withdraw_request_state"
        ON "p2p_withdraw_request" ("state", "symbol_id");
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "p2p_withdraw_part" (
        "id"                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"            timestamptz DEFAULT now(),
        "updated_at"            timestamptz DEFAULT now(),
        "deleted_at"            timestamptz,
        "withdraw_request_id"   uuid NOT NULL REFERENCES "p2p_withdraw_request"("id") ON DELETE CASCADE,
        "sequence_no"           integer NOT NULL,
        "target_amount"         numeric(20,8) NOT NULL,
        "confirmed_amount"      numeric(20,8) NOT NULL DEFAULT 0,
        "status"                "p2p_part_status_enum" NOT NULL DEFAULT 'OPEN',
        "active_reservation_id" uuid,
        "reserved_until"        timestamptz,
        "version"               integer NOT NULL DEFAULT 1
      );
    `);
    // The matching hot path: open parts ordered by amount.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_p2p_part_open"
        ON "p2p_withdraw_part" ("target_amount")
        WHERE "status" = 'OPEN' AND "deleted_at" IS NULL;
    `);
    // At most one live reservation per part.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "idx_p2p_part_active_reservation"
        ON "p2p_withdraw_part" ("active_reservation_id")
        WHERE "active_reservation_id" IS NOT NULL;
    `);

    // ── 3. Deposit side ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "p2p_deposit_intent" (
        "id"               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"       timestamptz DEFAULT now(),
        "updated_at"       timestamptz DEFAULT now(),
        "deleted_at"       timestamptz,
        "deposit_id"       uuid NOT NULL UNIQUE REFERENCES "deposit"("id") ON DELETE CASCADE,
        "user_id"          uuid NOT NULL,
        "symbol_id"        uuid NOT NULL,
        "requested_amount" numeric(20,8) NOT NULL,
        "constraints_json" jsonb,
        "state"            "p2p_intent_state_enum" NOT NULL DEFAULT 'CREATED',
        "retry_count"      integer NOT NULL DEFAULT 0,
        "expires_at"       timestamptz
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_p2p_intent_state"
        ON "p2p_deposit_intent" ("state", "symbol_id");
    `);

    // ── 4. Match, proof, escalation ─────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "p2p_match" (
        "id"                        uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"                timestamptz DEFAULT now(),
        "updated_at"                timestamptz DEFAULT now(),
        "deleted_at"                timestamptz,
        "deposit_intent_id"         uuid NOT NULL REFERENCES "p2p_deposit_intent"("id") ON DELETE CASCADE,
        "withdraw_part_id"          uuid REFERENCES "p2p_withdraw_part"("id") ON DELETE SET NULL,
        "amount"                    numeric(20,8) NOT NULL,
        "score"                     numeric(12,4),
        "score_breakdown_json"      jsonb,
        "source"                    "p2p_match_source_enum" NOT NULL DEFAULT 'CUSTOMER',
        "admin_account_id"          uuid REFERENCES "admin_bank_account"("id") ON DELETE SET NULL,
        "destination_snapshot_json" jsonb,
        "status"                    "p2p_match_status_enum" NOT NULL DEFAULT 'RESERVED',
        "reserved_at"               timestamptz,
        "reservation_expires_at"    timestamptz,
        "response_deadline_at"      timestamptz,
        "settlement_deadline_at"    timestamptz,
        "settled_at"                timestamptz
      );
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_p2p_match_status" ON "p2p_match" ("status")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_p2p_match_response_deadline" ON "p2p_match" ("response_deadline_at")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_p2p_match_reservation_expires" ON "p2p_match" ("reservation_expires_at")`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "p2p_payment_proof" (
        "id"                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"          timestamptz DEFAULT now(),
        "updated_at"          timestamptz DEFAULT now(),
        "deleted_at"          timestamptz,
        "match_id"            uuid NOT NULL UNIQUE REFERENCES "p2p_match"("id") ON DELETE CASCADE,
        "amount"              numeric(20,8) NOT NULL,
        "source_account"      varchar,
        "destination_account" varchar,
        "tracking_code"       varchar,
        "paid_at"             timestamptz,
        "receipt_object_name" varchar,
        "ocr_result_json"     jsonb,
        "ocr_mismatch"        boolean NOT NULL DEFAULT false,
        "idempotency_key"     varchar UNIQUE,
        "submitted_at"        timestamptz
      );
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "p2p_escalation" (
        "id"                      uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "created_at"              timestamptz DEFAULT now(),
        "updated_at"              timestamptz DEFAULT now(),
        "deleted_at"              timestamptz,
        "match_id"                uuid NOT NULL REFERENCES "p2p_match"("id") ON DELETE CASCADE,
        "reason"                  "p2p_escalation_reason_enum" NOT NULL,
        "priority"                smallint NOT NULL DEFAULT 5,
        "status"                  "p2p_escalation_status_enum" NOT NULL DEFAULT 'OPEN',
        "deadline_at"             timestamptz,
        "assigned_admin_id"       uuid,
        "resolution_type"         "p2p_resolution_type_enum",
        "resolution_note"         text,
        "resolved_by_admin_id"    uuid,
        "resolved_at"             timestamptz,
        "checker_admin_id"        uuid,
        "checked_at"              timestamptz,
        "pending_resolution_json" jsonb
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_p2p_escalation_queue"
        ON "p2p_escalation" ("status", "priority");
    `);

    // ── 5. Settings and audit ───────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "p2p_setting" (
        "key"                 varchar PRIMARY KEY,
        "value_json"          jsonb NOT NULL,
        "updated_by_admin_id" uuid,
        "updated_at"          timestamptz DEFAULT now()
      );
    `);

    // Insert-only by design: no deleted_at, and no update path is exposed.
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "p2p_audit_log" (
        "id"          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "actor_type"  "p2p_audit_actor_enum" NOT NULL,
        "actor_id"    uuid,
        "action"      varchar NOT NULL,
        "entity_type" varchar NOT NULL,
        "entity_id"   uuid NOT NULL,
        "before_json" jsonb,
        "after_json"  jsonb,
        "ip"          varchar,
        "user_agent"  text,
        "created_at"  timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_p2p_audit_entity"
        ON "p2p_audit_log" ("entity_type", "entity_id");
    `);

    // ── 6. Seed policy (Appendix A of the spec) ─────────────────────────
    await queryRunner.query(`
      INSERT INTO "p2p_setting" ("key", "value_json") VALUES ('p2p', $1::jsonb)
      ON CONFLICT ("key") DO NOTHING;
    `, [JSON.stringify({
      settlementTimeoutMinutes: 180,
      withdrawerResponseTimeoutMinutes: 30,
      reservationTtlMinutes: 15,
      requestExpiryHours: 48,
      sourcePriority: { deposit: "CUSTOMER_FIRST", withdrawal: "CUSTOMER_FIRST" },
      matchingWeights: { amountFit: 40, partsFit: 20, constraints: 20, age: 10, priority: 10, risk: 0 },
      matchingMaxRetry: 3,
      escalation: {
        notifyAdminOnReject: true,
        notifyAdminOnNoResponse: true,
        requireAdminResolution: true,
      },
      twoPersonApprovalThreshold: 5000000000,
      allowOverUnderSplit: false,
    })]);

    // ── 7. Offer p2p on existing rial symbols ───────────────────────────
    await queryRunner.query(`
      UPDATE "symbol"
         SET "deposit_types" = COALESCE("deposit_types", '[]'::jsonb) || '["p2p"]'::jsonb
       WHERE "symbol_type" = 'rial'
         AND NOT (COALESCE("deposit_types", '[]'::jsonb) @> '["p2p"]'::jsonb);
    `);
    await queryRunner.query(`
      UPDATE "symbol"
         SET "withdraw_types" = COALESCE("withdraw_types", '[]'::jsonb) || '["p2p"]'::jsonb
       WHERE "symbol_type" = 'rial'
         AND NOT (COALESCE("withdraw_types", '[]'::jsonb) @> '["p2p"]'::jsonb);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "symbol" SET "deposit_types" = "deposit_types" - 'p2p' WHERE "symbol_type" = 'rial';
    `);
    await queryRunner.query(`
      UPDATE "symbol" SET "withdraw_types" = "withdraw_types" - 'p2p' WHERE "symbol_type" = 'rial';
    `);

    for (const table of [
      "p2p_audit_log", "p2p_setting", "p2p_escalation", "p2p_payment_proof",
      "p2p_match", "p2p_deposit_intent", "p2p_withdraw_part", "p2p_withdraw_request",
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }

    for (const type of [
      "p2p_audit_actor_enum", "p2p_resolution_type_enum", "p2p_escalation_status_enum",
      "p2p_escalation_reason_enum", "p2p_match_source_enum", "p2p_split_policy_enum",
      "p2p_match_status_enum", "p2p_part_status_enum", "p2p_intent_state_enum",
      "p2p_withdraw_state_enum",
    ]) {
      await queryRunner.query(`DROP TYPE IF EXISTS "${type}"`);
    }
    // The added transaction_type enum values are intentionally left in place:
    // Postgres cannot drop an enum value, and ledger rows may reference them.
  }
}
