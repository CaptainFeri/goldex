import { MigrationInterface, QueryRunner } from "typeorm";

export class NotificationAndCrmMig1000000000064 implements MigrationInterface {
  name = "NotificationAndCrmMig1000000000064";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Notification Module Tables
    await queryRunner.query(`
      CREATE TYPE "public"."notification_type_enum" AS ENUM ('INFO', 'SUCCESS', 'WARNING', 'ERROR', 'PROMOTION', 'SYSTEM')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."notification_category_enum" AS ENUM ('TRADE', 'CREDIT', 'KYC', 'SECURITY', 'PROMOTION', 'SYSTEM')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."notification_channel_enum" AS ENUM ('IN_APP', 'EMAIL', 'SMS', 'TELEGRAM', 'PUSH')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."notification_status_enum" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED')
    `);
    await queryRunner.query(`
      CREATE TABLE "notifications" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz,
        "updated_at" timestamptz,
        "deleted_at" timestamptz,
        "user_id" uuid NOT NULL,
        "type" "public"."notification_type_enum" NOT NULL,
        "category" "public"."notification_category_enum" NOT NULL DEFAULT 'SYSTEM',
        "channel" "public"."notification_channel_enum" NOT NULL,
        "title" character varying(255) NOT NULL,
        "body" text NOT NULL,
        "metadata" jsonb,
        "status" "public"."notification_status_enum" NOT NULL DEFAULT 'PENDING',
        "read_at" timestamptz,
        "sent_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "delivered_at" timestamptz,
        "failed_at" timestamptz,
        "error_message" text,
        CONSTRAINT "PK_notifications" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "notifications" ADD CONSTRAINT "FK_notifications_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_user_id" ON "notifications" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "IDX_notifications_status" ON "notifications" ("status")`);

    await queryRunner.query(`
      CREATE TABLE "notification_templates" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "slug" character varying(100) NOT NULL,
        "title" character varying(255) NOT NULL,
        "channels_config" jsonb NOT NULL,
        "created_at" timestamptz,
        "updated_at" timestamptz,
        CONSTRAINT "PK_notification_templates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_templates_slug" UNIQUE ("slug")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "notification_preferences" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz,
        "updated_at" timestamptz,
        "deleted_at" timestamptz,
        "user_id" uuid NOT NULL,
        "channel" "public"."notification_channel_enum" NOT NULL,
        "category" "public"."notification_category_enum" NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        CONSTRAINT "PK_notification_preferences" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_notification_preferences_user_channel_category" UNIQUE ("user_id", "channel", "category")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "notification_preferences" ADD CONSTRAINT "FK_notification_preferences_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
    `);

    // CRM Module Tables
    await queryRunner.query(`
      CREATE TYPE "public"."note_category_enum" AS ENUM ('GENERAL', 'SUPPORT', 'COMPLIANCE', 'SALES', 'COMPLAINT')
    `);
    await queryRunner.query(`
      CREATE TABLE "customer_notes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz,
        "updated_at" timestamptz,
        "deleted_at" timestamptz,
        "user_id" uuid NOT NULL,
        "admin_id" uuid NOT NULL,
        "content" text NOT NULL,
        "category" "public"."note_category_enum" NOT NULL DEFAULT 'GENERAL',
        "is_pinned" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_customer_notes" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_notes" ADD CONSTRAINT "FK_customer_notes_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_notes" ADD CONSTRAINT "FK_customer_notes_admin" FOREIGN KEY ("admin_id") REFERENCES "admin"("id")
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."ticket_priority_enum" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."ticket_status_enum" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."ticket_category_enum" AS ENUM ('TRADING', 'KYC', 'WITHDRAWAL', 'DEPOSIT', 'ACCOUNT', 'TECHNICAL', 'OTHER')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."ticket_source_enum" AS ENUM ('USER_PANEL', 'TELEGRAM', 'ADMIN', 'EMAIL', 'PHONE')
    `);
    await queryRunner.query(`
      CREATE TABLE "support_tickets" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz,
        "updated_at" timestamptz,
        "deleted_at" timestamptz,
        "user_id" uuid NOT NULL,
        "subject" character varying(255) NOT NULL,
        "description" text NOT NULL,
        "priority" "public"."ticket_priority_enum" NOT NULL DEFAULT 'MEDIUM',
        "status" "public"."ticket_status_enum" NOT NULL DEFAULT 'OPEN',
        "category" "public"."ticket_category_enum" NOT NULL DEFAULT 'OTHER',
        "assigned_to" uuid,
        "source" "public"."ticket_source_enum" NOT NULL DEFAULT 'USER_PANEL',
        "resolved_at" timestamptz,
        "closed_at" timestamptz,
        "first_response_at" timestamptz,
        "satisfaction_score" integer,
        CONSTRAINT "PK_support_tickets" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_support_tickets_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "support_tickets" ADD CONSTRAINT "FK_support_tickets_assigned_to" FOREIGN KEY ("assigned_to") REFERENCES "admin"("id")
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."sender_type_enum" AS ENUM ('USER', 'ADMIN')
    `);
    await queryRunner.query(`
      CREATE TABLE "ticket_messages" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz,
        "updated_at" timestamptz,
        "deleted_at" timestamptz,
        "ticket_id" uuid NOT NULL,
        "sender_id" uuid NOT NULL,
        "sender_type" "public"."sender_type_enum" NOT NULL,
        "message" text NOT NULL,
        "attachments" jsonb,
        "is_internal" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_ticket_messages" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "ticket_messages" ADD CONSTRAINT "FK_ticket_messages_ticket" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE TABLE "customer_tags" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(100) NOT NULL,
        "color" character varying(7) NOT NULL,
        "created_at" timestamptz,
        CONSTRAINT "PK_customer_tags" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customer_tags_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "customer_tag_assignments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz,
        "updated_at" timestamptz,
        "deleted_at" timestamptz,
        "user_id" uuid NOT NULL,
        "tag_id" uuid NOT NULL,
        "assigned_by" uuid NOT NULL,
        "assigned_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_customer_tag_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_customer_tag_assignments_user_tag" UNIQUE ("user_id", "tag_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_tag_assignments" ADD CONSTRAINT "FK_customer_tag_assignments_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_tag_assignments" ADD CONSTRAINT "FK_customer_tag_assignments_tag" FOREIGN KEY ("tag_id") REFERENCES "customer_tags"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_tag_assignments" ADD CONSTRAINT "FK_customer_tag_assignments_admin" FOREIGN KEY ("assigned_by") REFERENCES "admin"("id")
    `);

    await queryRunner.query(`
      CREATE TABLE "customer_segments" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying(255) NOT NULL,
        "description" text,
        "criteria" jsonb NOT NULL,
        "is_dynamic" boolean NOT NULL DEFAULT false,
        "created_by" uuid NOT NULL,
        "created_at" timestamptz,
        "updated_at" timestamptz,
        CONSTRAINT "PK_customer_segments" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_segments" ADD CONSTRAINT "FK_customer_segments_admin" FOREIGN KEY ("created_by") REFERENCES "admin"("id")
    `);

    await queryRunner.query(`
      CREATE TABLE "customer_segment_assignments" (
        "segment_id" uuid NOT NULL,
        "user_id" uuid NOT NULL,
        "assigned_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_customer_segment_assignments" PRIMARY KEY ("segment_id", "user_id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_segment_assignments" ADD CONSTRAINT "FK_customer_segment_assignments_segment" FOREIGN KEY ("segment_id") REFERENCES "customer_segments"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "customer_segment_assignments" ADD CONSTRAINT "FK_customer_segment_assignments_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."communication_channel_enum" AS ENUM ('EMAIL', 'SMS', 'TELEGRAM', 'IN_APP', 'PHONE')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."communication_direction_enum" AS ENUM ('OUTBOUND', 'INBOUND')
    `);
    await queryRunner.query(`
      CREATE TYPE "public"."communication_status_enum" AS ENUM ('SENT', 'DELIVERED', 'FAILED', 'BOUNCED')
    `);
    await queryRunner.query(`
      CREATE TABLE "communication_logs" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" timestamptz,
        "updated_at" timestamptz,
        "deleted_at" timestamptz,
        "user_id" uuid NOT NULL,
        "channel" "public"."communication_channel_enum" NOT NULL,
        "direction" "public"."communication_direction_enum" NOT NULL,
        "subject" character varying(255),
        "body" text,
        "template_slug" character varying(100),
        "status" "public"."communication_status_enum" NOT NULL DEFAULT 'SENT',
        "external_id" character varying(255),
        "admin_id" uuid,
        "sent_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "PK_communication_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      ALTER TABLE "communication_logs" ADD CONSTRAINT "FK_communication_logs_user" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE
    `);
    await queryRunner.query(`
      ALTER TABLE "communication_logs" ADD CONSTRAINT "FK_communication_logs_admin" FOREIGN KEY ("admin_id") REFERENCES "admin"("id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "communication_logs"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_segment_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_segments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_tag_assignments"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_tags"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "ticket_messages"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "support_tickets"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "customer_notes"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_preferences"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notification_templates"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "notifications"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."communication_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."communication_direction_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."communication_channel_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."ticket_source_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."ticket_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."ticket_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."ticket_priority_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."note_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."sender_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."notification_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."notification_channel_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."notification_category_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."notification_type_enum"`);
  }
}
