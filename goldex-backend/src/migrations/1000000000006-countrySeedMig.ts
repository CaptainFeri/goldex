import { countries } from '../baseinfo/info/country.info';
import { MigrationInterface, QueryRunner } from 'typeorm';

export class countrySeedMig1000000000006 implements MigrationInterface {
  name?: 'countrySeedMig1000000000006';
  transaction?: true;

  public async up(queryRunner: QueryRunner): Promise<any> {
    const countriesInfo = countries;
    for (let i = 0; i < countriesInfo.length; i++) {
      const { name, region, maps, flags, cca3, ccn3, latlng, timezones } =
        countriesInfo[i];
      await queryRunner.query(`INSERT INTO "country" 
        ("primary_name", "secondary_name", "iso_code", "iso_code_2", "region", "svg_flag", "png_flag", "google_maps", "open_street_maps", "timezone", "lat", "long", "created_at", "updated_at", "deleted_at")
        VALUES 
        ('${name.official.replace("'", '"')}', '${name.common.replace(
        "'",
        '"',
      )}', '${cca3.replace("'", '"')}', '${ccn3.replace(
        "'",
        '"',
      )}', '${region.replace("'", '"')}', '${flags.svg.replace(
        "'",
        '"',
      )}', '${flags.png.replace("'", '"')}', '${maps.googleMaps.replace(
        "'",
        '"',
      )}', '${maps.openStreetMaps.replace("'", '"')}', '${timezones[0].replace(
        "'",
        '"',
      )}', '${latlng[0]}', '${latlng[1]}', now(), now(), null);
        `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<any> {}
}
