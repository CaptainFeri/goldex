import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * `has_enclosure` (دارای لف) on the withdraw request.
 *
 * The EM screen shows this column and nothing in `src/p2p` corresponds to it,
 * so it is stored explicitly and set by an operator. Display only — no
 * settlement logic reads it, which is why it defaults to false rather than
 * being backfilled from anything.
 */
export class EmEnclosureMig1000000000101 implements MigrationInterface {
  name = "EmEnclosureMig1000000000101";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "p2p_withdraw_request"
        ADD COLUMN IF NOT EXISTS "has_enclosure" boolean NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "p2p_withdraw_request" DROP COLUMN IF EXISTS "has_enclosure"`);
  }
}
