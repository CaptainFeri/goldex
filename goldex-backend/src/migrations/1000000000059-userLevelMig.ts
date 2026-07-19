import { MigrationInterface, QueryRunner } from "typeorm";

export class UserLevelMig1000000000059 implements MigrationInterface {
  name = "UserLevelMig1000000000059";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Create user_level table (idempotent)
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "user_level" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz DEFAULT now(),
        "updated_at" timestamptz DEFAULT now(),
        "deleted_at" timestamptz,
        "name" varchar(100) NOT NULL,
        "slug" varchar(100) NOT NULL,
        "description" text,
        "priority" integer NOT NULL DEFAULT 0,
        "is_default" boolean NOT NULL DEFAULT false,
        "features" jsonb NOT NULL DEFAULT '{}',
        CONSTRAINT "PK_user_level_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_user_level_name" UNIQUE ("name"),
        CONSTRAINT "UQ_user_level_slug" UNIQUE ("slug")
      )`
    );

    // 2. Add level columns to user table (idempotent via DO block)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user' AND column_name='level_id') THEN
          ALTER TABLE "user" ADD COLUMN "level_id" uuid;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user' AND column_name='level_assigned_at') THEN
          ALTER TABLE "user" ADD COLUMN "level_assigned_at" timestamptz;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user' AND column_name='level_expires_at') THEN
          ALTER TABLE "user" ADD COLUMN "level_expires_at" timestamptz;
        END IF;
      END $$;
    `);

    // FK constraint (idempotent)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name='FK_user_level' AND table_name='user') THEN
          ALTER TABLE "user" ADD CONSTRAINT "FK_user_level" FOREIGN KEY ("level_id") REFERENCES "user_level"("id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    // 3. Seed default levels

    // --- Bronze (default) ---
    await queryRunner.query(
      `INSERT INTO "user_level" (id, name, slug, description, priority, is_default, features) VALUES (
        uuid_generate_v4(),
        'برنز',
        'bronze',
        'Basic level for new users',
        1,
        true,
        '{
          "TRADING_DAILY_LIMIT": {"amount": 500000000, "currency": "IRR"},
          "TRADING_MAX_ORDER_VALUE": {"amount": 100000000, "currency": "IRR"},
          "TRADING_MAX_OPEN_ORDERS": 10,
          "WALLET_WITHDRAWAL_DAILY_LIMIT": {"amount": 200000000, "currency": "IRR"},
          "WALLET_WITHDRAWAL_PER_TX_LIMIT": {"amount": 50000000, "currency": "IRR"},
          "CREDIT_MAX_AMOUNT": {"amount": 500000000, "currency": "IRR"},
          "CREDIT_MAX_DURATION_DAYS": 30,
          "TELEGRAM_BOT_ENABLED": {"enabled": true},
          "API_ACCESS_ENABLED": {"enabled": false},
          "ELITE_TRADE_ENABLED": {"enabled": false},
          "PRIORITY_SUPPORT": {"enabled": false},
          "MAX_MARKET_TYPES": 1
        }'::jsonb
      )`
    );

    // --- Silver ---
    await queryRunner.query(
      `INSERT INTO "user_level" (id, name, slug, description, priority, is_default, features) VALUES (
        uuid_generate_v4(),
        'نقره',
        'silver',
        'Silver level for more active users',
        2,
        false,
        '{
          "TRADING_DAILY_LIMIT": {"amount": 2000000000, "currency": "IRR"},
          "TRADING_MAX_ORDER_VALUE": {"amount": 500000000, "currency": "IRR"},
          "TRADING_MAX_OPEN_ORDERS": 25,
          "WALLET_WITHDRAWAL_DAILY_LIMIT": {"amount": 500000000, "currency": "IRR"},
          "WALLET_WITHDRAWAL_PER_TX_LIMIT": {"amount": 200000000, "currency": "IRR"},
          "CREDIT_MAX_AMOUNT": {"amount": 2000000000, "currency": "IRR"},
          "CREDIT_MAX_DURATION_DAYS": 60,
          "TELEGRAM_BOT_ENABLED": {"enabled": true},
          "API_ACCESS_ENABLED": {"enabled": true},
          "ELITE_TRADE_ENABLED": {"enabled": false},
          "PRIORITY_SUPPORT": {"enabled": false},
          "MAX_MARKET_TYPES": 1
        }'::jsonb
      )`
    );

    // --- Gold ---
    await queryRunner.query(
      `INSERT INTO "user_level" (id, name, slug, description, priority, is_default, features) VALUES (
        uuid_generate_v4(),
        'طلا',
        'gold',
        'Gold level for premium users',
        3,
        false,
        '{
          "TRADING_DAILY_LIMIT": {"amount": 10000000000, "currency": "IRR"},
          "TRADING_MAX_ORDER_VALUE": {"amount": 2000000000, "currency": "IRR"},
          "TRADING_MAX_OPEN_ORDERS": 50,
          "WALLET_WITHDRAWAL_DAILY_LIMIT": {"amount": 2000000000, "currency": "IRR"},
          "WALLET_WITHDRAWAL_PER_TX_LIMIT": {"amount": 500000000, "currency": "IRR"},
          "CREDIT_MAX_AMOUNT": {"amount": 5000000000, "currency": "IRR"},
          "CREDIT_MAX_DURATION_DAYS": 90,
          "TELEGRAM_BOT_ENABLED": {"enabled": true},
          "API_ACCESS_ENABLED": {"enabled": true},
          "ELITE_TRADE_ENABLED": {"enabled": true},
          "PRIORITY_SUPPORT": {"enabled": false},
          "MAX_MARKET_TYPES": 2
        }'::jsonb
      )`
    );

    // --- Platinum ---
    await queryRunner.query(
      `INSERT INTO "user_level" (id, name, slug, description, priority, is_default, features) VALUES (
        uuid_generate_v4(),
        'پلاتین',
        'platinum',
        'VIP level for elite users',
        4,
        false,
        '{
          "TRADING_DAILY_LIMIT": {"amount": 0, "currency": "IRR"},
          "TRADING_MAX_ORDER_VALUE": {"amount": 0, "currency": "IRR"},
          "TRADING_MAX_OPEN_ORDERS": 999,
          "WALLET_WITHDRAWAL_DAILY_LIMIT": {"amount": 0, "currency": "IRR"},
          "WALLET_WITHDRAWAL_PER_TX_LIMIT": {"amount": 0, "currency": "IRR"},
          "CREDIT_MAX_AMOUNT": {"amount": 0, "currency": "IRR"},
          "CREDIT_MAX_DURATION_DAYS": 365,
          "TELEGRAM_BOT_ENABLED": {"enabled": true},
          "API_ACCESS_ENABLED": {"enabled": true},
          "ELITE_TRADE_ENABLED": {"enabled": true},
          "PRIORITY_SUPPORT": {"enabled": true},
          "MAX_MARKET_TYPES": 999
        }'::jsonb
      )`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user" DROP CONSTRAINT "FK_user_level"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "level_expires_at"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "level_assigned_at"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "level_id"`);
    await queryRunner.query(`DROP TABLE "user_level"`);
  }
}
