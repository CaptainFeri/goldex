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

    // Dynamic date: start of current month
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

    const segments = [
      { name: 'Verified Users', desc: 'Users who completed KYC', criteria: '{"kycStatus": 1}' },
      { name: 'Blocked Users', desc: 'Users with blocked accounts', criteria: '{"hasBlocked": true}' },
      { name: 'New Registrations', desc: 'Users registered this month', criteria: `{"createdAfter": "${monthStart}"}` },
      { name: 'High Value Traders', desc: 'Premium users', criteria: '{"roles": [0]}' },
    ];

    for (const s of segments) {
      await queryRunner.query(`
        INSERT INTO customer_segments (id, name, description, criteria, is_dynamic, created_by)
        SELECT uuid_generate_v4(), '${s.name}', '${s.desc}', '${s.criteria}'::jsonb, true, a.id
        FROM admin a
        WHERE NOT EXISTS (SELECT 1 FROM customer_segments WHERE name = '${s.name}')
        LIMIT 1
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM customer_tags WHERE name IN ('VIP', 'High Risk', 'Blocked', 'Verified', 'Whale', 'New User', 'Inactive', 'Valuable')`);
    await queryRunner.query(`DELETE FROM customer_segments WHERE name IN ('Verified Users', 'Blocked Users', 'New Registrations', 'High Value Traders')`);
  }
}