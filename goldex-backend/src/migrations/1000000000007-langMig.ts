import { MigrationInterface, QueryRunner } from 'typeorm';

export class langMig1000000000007 implements MigrationInterface {
  name?: 'langMig1000000000007';
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "language" 
          ("id"  SERIAL NOT NULL,
          "locale" character varying, 
          "name" character varying, 
          "native_name" character varying, 
          "is_active" boolean DEFAULT false,
          "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
          "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
          "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
          CONSTRAINT "PK_LANGUAGE" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "language"`);
  }
}
