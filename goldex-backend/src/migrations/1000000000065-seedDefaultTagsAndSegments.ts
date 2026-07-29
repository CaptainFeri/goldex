import { MigrationInterface, QueryRunner } from "typeorm";

export class SeedDefaultTagsAndSegments1000000000065 implements MigrationInterface {
  name = "SeedDefaultTagsAndSegments1000000000065";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Default Tags
    await queryRunner.query(`
      INSERT INTO customer_tags (id, name, color) VALUES
        (uuid_generate_v4(), 'VIP', '#f59e0b'),
        (uuid_generate_v4(), 'High Risk', '#ef4444'),
        (uuid_generate_v4(), 'Blocked', '#dc2626'),
        (uuid_generate_v4(), 'Verified', '#22c55e'),
        (uuid_generate_v4(), 'Whale', '#8b5cf6'),
        (uuid_generate_v4(), 'New User', '#3b82f6'),
        (uuid_generate_v4(), 'Inactive', '#6b7280'),
        (uuid_generate_v4(), 'Valuable', '#ec4899')
      ON CONFLICT (name) DO NOTHING
    `);

    // Default Segments (uses first admin as creator)
    await queryRunner.query(`
      INSERT INTO customer_segments (id, name, description, criteria, is_dynamic, created_by)
      SELECT
        uuid_generate_v4(), 'Verified Users', 'Users who completed KYC', '{"kycStatus": 1}'::jsonb, true, a.id
      FROM admin a LIMIT 1
      WHERE NOT EXISTS (SELECT 1 FROM customer_segments WHERE name = 'Verified Users')
    `);

    await queryRunner.query(`
      INSERT INTO customer_segments (id, name, description, criteria, is_dynamic, created_by)
      SELECT
        uuid_generate_v4(), 'Blocked Users', 'Users with blocked accounts', '{"hasBlocked": true}'::jsonb, true, a.id
      FROM admin a LIMIT 1
      WHERE NOT EXISTS (SELECT 1 FROM customer_segments WHERE name = 'Blocked Users')
    `);

    await queryRunner.query(`
      INSERT INTO customer_segments (id, name, description, criteria, is_dynamic, created_by)
      SELECT
        uuid_generate_v4(), 'New Registrations', 'Users registered this month', '{"createdAfter": "'${new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()}'"}'::jsonb, true, a.id
      FROM admin a LIMIT 1
      WHERE NOT EXISTS (SELECT 1 FROM customer_segments WHERE name = 'New Registrations')
    `);

    await queryRunner.query(`
      INSERT INTO customer_segments (id, name, description, criteria, is_dynamic, created_by)
      SELECT
        uuid_generate_v4(), 'High Value Traders', 'Premium users', '{"roles": [0]}'::jsonb, true, a.id
      FROM admin a LIMIT 1
      WHERE NOT EXISTS (SELECT 1 FROM customer_segments WHERE name = 'High Value Traders')
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM customer_tags WHERE name IN ('VIP', 'High Risk', 'Blocked', 'Verified', 'Whale', 'New User', 'Inactive', 'Valuable')`);
    await queryRunner.query(`DELETE FROM customer_segments WHERE name IN ('Verified Users', 'Blocked Users', 'New Registrations', 'High Value Traders')`);
  }
}