import { MigrationInterface, QueryRunner } from "typeorm";

export class CreditModuleMig1000000000057 implements MigrationInterface {
  name = "CreditModuleMig1000000000057";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create credit_status_enum
    await queryRunner.query(
      `CREATE TYPE "public"."credit_status_enum" AS ENUM('PENDING', 'ACTIVE', 'SETTLED', 'EXPIRED', 'CANCELLED')`
    );

    // 2. Create credit_order_status_enum
    await queryRunner.query(
      `CREATE TYPE "public"."credit_order_status_enum" AS ENUM('ACTIVE', 'MARGIN_CALLED', 'COMPLETED', 'CANCELLED')`
    );

    // 3. Create credit_notification_type_enum
    await queryRunner.query(
      `CREATE TYPE "public"."credit_notification_type_enum" AS ENUM('REMINDER', 'MARGIN_CALL', 'EXPIRY_WARNING', 'SETTLEMENT', 'EXPIRED')`
    );

    // 4. Create credit_action_enum for finance_log
    await queryRunner.query(
      `CREATE TYPE "public"."finance_log_action_type_enum" AS ENUM(${[
        "CREDIT_CREATED",
        "CREDIT_ACTIVATED",
        "CREDIT_SETTLED",
        "CREDIT_EXPIRED",
        "CREDIT_CANCELLED",
        "WALLET_FROZEN",
        "WALLET_UNFROZEN",
        "BALANCE_INCREASED",
        "BALANCE_FROZEN_FOR_CREDIT",
        "BALANCE_UNFROZEN_FOR_CREDIT",
        "MATERIAL_FREEZE",
        "LIQUIDATION",
        "ORDER_CANCELLED_MARGIN",
        "EXPIRY_FREEZE_ALL",
        "USER_STATUS_CHANGED",
        "ALL_WALLETS_FROZEN",
        "REMINDER_SENT",
      ]
        .map((v) => `'${v}'`)
        .join(", ")})`
    );

    // 5. Add credit transaction types to transaction_type_enum
    await queryRunner.query(
      `ALTER TYPE "public"."transaction_transaction_type_enum" ADD VALUE IF NOT EXISTS 'CREDIT_DEPOSIT'`
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transaction_transaction_type_enum" ADD VALUE IF NOT EXISTS 'CREDIT_WITHDRAWAL'`
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transaction_transaction_type_enum" ADD VALUE IF NOT EXISTS 'CREDIT_LIQUIDATION'`
    );
    await queryRunner.query(
      `ALTER TYPE "public"."transaction_transaction_type_enum" ADD VALUE IF NOT EXISTS 'CREDIT_SETTLEMENT'`
    );

    await queryRunner.query(
      `ALTER TYPE "public"."transaction_transaction_type_enum" ADD VALUE IF NOT EXISTS 'CREDIT_SETTLEMENT'`
    );

    // 6. Create credit table
    await queryRunner.query(
      `CREATE TABLE "credit" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now(),
        "deleted_at" timestamptz,
        "user_id" uuid NOT NULL,
        "admin_id" uuid NOT NULL,
        "credit_code" varchar(50) NOT NULL,
        "amount" decimal(20,8) NOT NULL,
        "status" "public"."credit_status_enum" NOT NULL DEFAULT 'PENDING',
        "has_call_margin" boolean NOT NULL DEFAULT false,
        "call_margin_percent" decimal(5,2),
        "reminder_timer_hours" integer NOT NULL DEFAULT 24,
        "reminder_last_sent_at" timestamptz,
        "expire_at" timestamptz NOT NULL,
        "activated_at" timestamptz,
        "settled_at" timestamptz,
        "notes" text,
        "settle_image_path" varchar(255),
        "settled_by_admin_id" varchar(50),
        "metadata" jsonb,
        CONSTRAINT "PK_credit_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_credit_code" UNIQUE ("credit_code")
      )`
    );

    // 7. Create credit_order table
    await queryRunner.query(
      `CREATE TABLE "credit_order" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now(),
        "deleted_at" timestamptz,
        "credit_id" uuid NOT NULL,
        "order_id" uuid NOT NULL,
        "price_at_order_time" decimal(20,8) NOT NULL,
        "status" "public"."credit_order_status_enum" NOT NULL DEFAULT 'ACTIVE',
        "drawdown_percent" decimal(5,2),
        "current_price" decimal(20,8),
        "margin_called_at" timestamptz,
        CONSTRAINT "PK_credit_order_id" PRIMARY KEY ("id")
      )`
    );

    // 8. Create credit_notification table
    await queryRunner.query(
      `CREATE TABLE "credit_notification" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now(),
        "deleted_at" timestamptz,
        "user_id" uuid NOT NULL,
        "credit_id" uuid NOT NULL,
        "type" "public"."credit_notification_type_enum" NOT NULL,
        "message" text NOT NULL,
        "is_read" boolean NOT NULL DEFAULT false,
        "read_at" timestamptz,
        "sent_at" timestamptz DEFAULT now(),
        CONSTRAINT "PK_credit_notification_id" PRIMARY KEY ("id")
      )`
    );

    // 9. Create finance_log table
    await queryRunner.query(
      `CREATE TABLE "finance_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now(),
        "deleted_at" timestamptz,
        "admin_id" uuid,
        "user_id" uuid,
        "credit_id" uuid,
        "wallet_id" uuid,
        "order_id" uuid,
        "action_type" "public"."finance_log_action_type_enum" NOT NULL,
        "description" text,
        "metadata" jsonb,
        "action_time" timestamptz DEFAULT now(),
        CONSTRAINT "PK_finance_log_id" PRIMARY KEY ("id")
      )`
    );

    // 10. Create admin_schedule table
    await queryRunner.query(
      `CREATE TABLE "admin_schedule" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now(),
        "deleted_at" timestamptz,
        "admin_id" uuid NOT NULL,
        "day_of_week" integer NOT NULL,
        "day_label" varchar(20) NOT NULL,
        "start_time" varchar(5) NOT NULL,
        "end_time" varchar(5) NOT NULL,
        "is_active" boolean NOT NULL DEFAULT true,
        "timezone" varchar(50) NOT NULL DEFAULT 'Asia/Tehran',
        CONSTRAINT "PK_admin_schedule_id" PRIMARY KEY ("id")
      )`
    );

    // 11. Foreign keys
    await queryRunner.query(
      `ALTER TABLE "credit" ADD CONSTRAINT "FK_credit_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE "credit_order" ADD CONSTRAINT "FK_credit_order_credit" FOREIGN KEY ("credit_id") REFERENCES "credit"("id") ON DELETE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE "credit_order" ADD CONSTRAINT "FK_credit_order_order" FOREIGN KEY ("order_id") REFERENCES "order"("id") ON DELETE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE "credit_notification" ADD CONSTRAINT "FK_credit_notification_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE "credit_notification" ADD CONSTRAINT "FK_credit_notification_credit" FOREIGN KEY ("credit_id") REFERENCES "credit"("id") ON DELETE CASCADE`
    );
    await queryRunner.query(
      `ALTER TABLE "finance_log" ADD CONSTRAINT "FK_finance_log_admin" FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE SET NULL`
    );
    await queryRunner.query(
      `ALTER TABLE "admin_schedule" ADD CONSTRAINT "FK_admin_schedule_admin" FOREIGN KEY ("admin_id") REFERENCES "admin"("id") ON DELETE CASCADE`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admin_schedule" DROP CONSTRAINT "FK_admin_schedule_admin"`);
    await queryRunner.query(`ALTER TABLE "finance_log" DROP CONSTRAINT "FK_finance_log_admin"`);
    await queryRunner.query(`ALTER TABLE "credit_notification" DROP CONSTRAINT "FK_credit_notification_credit"`);
    await queryRunner.query(`ALTER TABLE "credit_notification" DROP CONSTRAINT "FK_credit_notification_user"`);
    await queryRunner.query(`ALTER TABLE "credit_order" DROP CONSTRAINT "FK_credit_order_order"`);
    await queryRunner.query(`ALTER TABLE "credit_order" DROP CONSTRAINT "FK_credit_order_credit"`);
    await queryRunner.query(`ALTER TABLE "credit" DROP CONSTRAINT "FK_credit_user"`);

    await queryRunner.query(`DROP TABLE "admin_schedule"`);
    await queryRunner.query(`DROP TABLE "finance_log"`);
    await queryRunner.query(`DROP TABLE "credit_notification"`);
    await queryRunner.query(`DROP TABLE "credit_order"`);
    await queryRunner.query(`DROP TABLE "credit"`);

    await queryRunner.query(`DROP TYPE "public"."finance_log_action_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."credit_notification_type_enum"`);
    await queryRunner.query(`DROP TYPE "public"."credit_order_status_enum"`);
    await queryRunner.query(`DROP TYPE "public"."credit_status_enum"`);
  }
}
