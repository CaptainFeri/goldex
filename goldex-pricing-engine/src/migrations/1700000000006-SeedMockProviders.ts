import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Seeds the sandbox providers that point at the local mock server
 * (see `mock-server/`). URLs are built from `MOCK_PORT` (default 5000) so they
 * match the running mock. Idempotent via ON CONFLICT — runs once per key.
 *
 * Env overrides:
 *   MOCK_HOST         host of the mock server (default localhost; "mock" in compose)
 *   MOCK_PORT         host port of the mock server (default 5000)
 *   MOCK_SEED_ACTIVE  set to "false" to seed them inactive (default active)
 */
export class SeedMockProviders1700000000006 implements MigrationInterface {
  name = 'SeedMockProviders1700000000006';

  private static readonly KEYS = ['mock-zaryar-a', 'mock-zaryar-b', 'mock-talaab-a'];

  public async up(queryRunner: QueryRunner): Promise<void> {
    const host = `${process.env.MOCK_HOST ?? 'localhost'}:${process.env.MOCK_PORT ?? '5000'}`;
    const active = (process.env.MOCK_SEED_ACTIVE ?? 'true') !== 'false';
    const now = new Date();

    const zaryarAuth = (shop: string) => ({
      token: `mock-token-${shop}`,
      sessionId: `mock-session-${shop}`,
      shopkeeperId: shop,
      uId: `mock-uid-${shop}`,
      roleType: '0',
    });

    const providers = [
      {
        id: 'a1111111-1111-4111-8111-111111111111',
        key: 'mock-zaryar-a',
        category: 'zaryar',
        baseUrl: `http://${host}/zaryar/shopA/signalr`,
        apiBaseUrl: `http://${host}/zaryar/shopA`,
        sendOtpUrl: `http://${host}/zaryar/shopA/api/User/SendConfirmCode`,
        verifyCodeUrl: `http://${host}/zaryar/shopA/auth/verifyCode`,
        auth: zaryarAuth('shopA'),
      },
      {
        id: 'a2222222-2222-4222-8222-222222222222',
        key: 'mock-zaryar-b',
        category: 'zaryar',
        baseUrl: `http://${host}/zaryar/shopB/signalr`,
        apiBaseUrl: `http://${host}/zaryar/shopB`,
        sendOtpUrl: `http://${host}/zaryar/shopB/api/User/SendConfirmCode`,
        verifyCodeUrl: `http://${host}/zaryar/shopB/auth/verifyCode`,
        auth: zaryarAuth('shopB'),
      },
      {
        id: 'a3333333-3333-4333-8333-333333333333',
        key: 'mock-talaab-a',
        category: 'talaab',
        baseUrl: `ws://${host}/talaab/afrogh/app/app-key?protocol=7&client=js&version=8.4.0&flash=false`,
        apiBaseUrl: `http://${host}/talaab/afrogh/homepage`,
        sendOtpUrl: `http://${host}/talaab/afrogh/auth/check-mobile-exists`,
        verifyCodeUrl: `http://${host}/talaab/afrogh/auth/login`,
        auth: {
          token: 'mock-token-afrogh',
          apiBaseUrl: `http://${host}/talaab/afrogh/homepage`,
        },
      },
    ];

    for (const p of providers) {
      await queryRunner.query(
        `INSERT INTO "providers" ("id", "key", "category", "baseUrl", "apiBaseUrl", "phone", "sendOtpUrl", "verifyCodeUrl", "auth", "config", "active", "metadataRefreshIntervalMs", "createdAt", "updatedAt")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14)
         ON CONFLICT ("key") DO NOTHING`,
        [
          p.id,
          p.key,
          p.category,
          p.baseUrl,
          p.apiBaseUrl,
          '09120000000',
          p.sendOtpUrl,
          p.verifyCodeUrl,
          JSON.stringify(p.auth),
          '{}',
          active,
          60000,
          now,
          now,
        ],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "providers" WHERE "key" IN ($1, $2, $3)`, [
      ...SeedMockProviders1700000000006.KEYS,
    ]);
  }
}
