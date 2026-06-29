import { MigrationInterface, QueryRunner } from 'typeorm';

export class SeedProviders1700000000003 implements MigrationInterface {
  name = 'SeedProviders1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "providers" ("id", "key", "category", "baseUrl", "apiBaseUrl", "phone", "sendOtpUrl", "verifyCodeUrl", "auth", "config", "active", "metadataRefreshIntervalMs", "createdAt", "updatedAt")
       VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12, $13, $14),
        ($15, $16, $17, $18, $19, $20, $21, $22, $23::jsonb, $24::jsonb, $25, $26, $27, $28),
        ($29, $30, $31, $32, $33, $34, $35, $36, $37::jsonb, $38::jsonb, $39, $40, $41, $42)
       ON CONFLICT ("key") DO NOTHING`,
      [
        '2b676dad-f0dc-4dd0-82dd-954087fdef6f', 'mirrokni', 'zaryar',
        'https://pnlapi.mirrokni.ir/signalr', 'https://pnlapi.mirrokni.ir',
        '09122650904',
        'https://pnlapi.mirrokni.ir/api/User/SendConfirmCode',
        'https://pnl.mirrokni.ir/auth/verifyCode',
        '{}', '{}', false, 60000, new Date('2026-06-17T08:52:43.897Z'), new Date('2026-06-17T08:52:43.897Z'),

        'd0d600e1-e1e8-45da-8057-7e60d3b0dcf5', 'arianatala', 'zaryar',
        'https://pnlapi.arianatala.com/signalr', 'https://pnlapi.arianatala.com',
        '09122650904',
        'https://pnlapi.arianatala.com/api/User/SendConfirmCode',
        'https://subpnl.arianatala.com/auth/verifyCode',
        '{}', '{}', false, 60000, new Date('2026-06-17T08:54:58.391Z'), new Date('2026-06-17T08:54:58.391Z'),

        '13659105-a954-47bf-8ab5-655cca471bd3', 'afrogh', 'talaab',
        'wss://pusher.goldab.ir/app/app-key?protocol=7&client=js&version=8.4.0&flash=false',
        'https://api.afroghnegaremana.ir/api/v1/profile/homepage',
        '09122650904',
        'https://api.afroghnegaremana.ir/api/v1/auth/check-mobile-exists',
        'https://api.afroghnegaremana.ir/api/v1/auth/login',
        '{}', '{}', false, 60000, new Date('2026-06-17T08:56:49.195Z'), new Date('2026-06-17T08:56:49.195Z'),
      ],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "providers" WHERE "key" IN ($1, $2, $3)`,
      ['mirrokni', 'arianatala', 'afrogh'],
    );
  }
}
