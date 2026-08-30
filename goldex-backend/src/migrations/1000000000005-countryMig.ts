import { MigrationInterface, QueryRunner } from 'typeorm';

export class countryMig1000000000005 implements MigrationInterface {
  name?: 'countryMig1000000000005';
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(
      `CREATE TABLE "country" 
          ("id" SERIAL NOT NULL,
          "primary_name" character varying, 
          "secondary_name" character varying, 
          "iso_code" character varying, 
          "iso_code_2" character varying, 
          "region" character varying, 
          "svg_flag" character varying, 
          "png_flag" character varying, 
          "google_maps" character varying, 
          "open_street_maps" character varying, 
          "timezone" character varying, 
          "lat" character varying, 
          "long" character varying, 
          "created_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
          "updated_at" TIMESTAMP WITH TIME ZONE DEFAULT now(), 
          "deleted_at" TIMESTAMP WITH TIME ZONE DEFAULT null,
          CONSTRAINT "PK_COUNTRY" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<any> {
    await queryRunner.query(`DROP TABLE "country"`);
  }
}
