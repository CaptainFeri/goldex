import { MigrationInterface, QueryRunner } from 'typeorm';
import { langs } from '../baseinfo/info/lang.info';

export class langSeedMig1000000000008 implements MigrationInterface {
  name?: 'langSeedMig1000000000008';
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    for (let i = 0; i < langs.length; i++)
      queryRunner.query(`
        INSERT INTO "language" 
        ("locale", "name", "native_name", "is_active", "created_at", "updated_at", "deleted_at")
        VALUES
        ('${langs[i].locale}', '${langs[i].name}', '${langs[i].nativeName}', ${langs[i].isActive}, now(), now(), null);
        `);
  }

  public async down(queryRunner: QueryRunner): Promise<any> {}
}
