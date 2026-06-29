import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Re-points the seeded mock providers (1700000000006) at the host given by
 * MOCK_HOST / MOCK_PORT. The original seed may have been applied with `localhost`
 * before the mock moved into the compose network (`mock:5000`), and migrations
 * don't re-run — so this one-shot UPDATE fixes existing rows. On a fresh DB
 * (where 006 already used the right host) it's a harmless no-op. Leaves `active`
 * and `auth` untouched.
 */
export class RepointMockProviders1700000000007 implements MigrationInterface {
  name = 'RepointMockProviders1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const host = `${process.env.MOCK_HOST ?? 'localhost'}:${process.env.MOCK_PORT ?? '5000'}`;

    const updates = [
      {
        key: 'mock-zaryar-a',
        baseUrl: `http://${host}/zaryar/shopA/signalr`,
        apiBaseUrl: `http://${host}/zaryar/shopA`,
        sendOtpUrl: `http://${host}/zaryar/shopA/api/User/SendConfirmCode`,
        verifyCodeUrl: `http://${host}/zaryar/shopA/auth/verifyCode`,
      },
      {
        key: 'mock-zaryar-b',
        baseUrl: `http://${host}/zaryar/shopB/signalr`,
        apiBaseUrl: `http://${host}/zaryar/shopB`,
        sendOtpUrl: `http://${host}/zaryar/shopB/api/User/SendConfirmCode`,
        verifyCodeUrl: `http://${host}/zaryar/shopB/auth/verifyCode`,
      },
      {
        key: 'mock-talaab-a',
        baseUrl: `ws://${host}/talaab/afrogh/app/app-key?protocol=7&client=js&version=8.4.0&flash=false`,
        apiBaseUrl: `http://${host}/talaab/afrogh/homepage`,
        sendOtpUrl: `http://${host}/talaab/afrogh/auth/check-mobile-exists`,
        verifyCodeUrl: `http://${host}/talaab/afrogh/auth/login`,
      },
    ];

    for (const u of updates) {
      await queryRunner.query(
        `UPDATE "providers"
         SET "baseUrl" = $2, "apiBaseUrl" = $3, "sendOtpUrl" = $4, "verifyCodeUrl" = $5, "updatedAt" = NOW()
         WHERE "key" = $1`,
        [u.key, u.baseUrl, u.apiBaseUrl, u.sendOtpUrl, u.verifyCodeUrl],
      );
    }
  }

  public async down(): Promise<void> {
    // No-op: there is no meaningful prior host to revert to.
  }
}
