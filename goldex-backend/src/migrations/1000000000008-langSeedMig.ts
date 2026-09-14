import { MigrationInterface, QueryRunner } from 'typeorm';
import { langs } from '../baseinfo/info/lang.info';

/**
 * Seeds the language table.
 *
 * The inserts are awaited, one at a time. They were not: the loop fired every
 * `queryRunner.query()` without awaiting it, so each statement started on the
 * migration's single client while the previous was still running — which is
 * what pg reports as "Calling client.query() when the client is already
 * executing a query", and what it will refuse outright in pg 9.
 *
 * The warning was the mild half. `up()` also resolved before any insert had
 * finished, so TypeORM could record the migration as applied and close the
 * query runner out from under statements still in flight, and a failing insert
 * had nobody to reject to.
 *
 * Values are bound as parameters rather than interpolated, so a name
 * containing an apostrophe is data instead of syntax.
 */
export class langSeedMig1000000000008 implements MigrationInterface {
  name?: 'langSeedMig1000000000008';
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    for (const lang of langs) {
      await queryRunner.query(
        `
        INSERT INTO "language"
        ("locale", "name", "native_name", "is_active", "created_at", "updated_at", "deleted_at")
        VALUES ($1, $2, $3, $4, now(), now(), null)
        `,
        [lang.locale, lang.name, lang.nativeName, lang.isActive],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<any> {}
}
