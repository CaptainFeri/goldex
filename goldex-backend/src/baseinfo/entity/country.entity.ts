import { Column, Entity } from 'typeorm';
import { MyLocalBaseEntity } from '../../shared/entity/base.local.entity';

@Entity('country')
export class CountryEntity extends MyLocalBaseEntity {
  @Column({
    name: 'primary_name',
    nullable: true,
  })
  primaryName?: string;

  @Column({
    name: 'secondary_name',
    nullable: true,
  })
  secondaryName?: string;

  @Column({
    name: 'iso_code',
    nullable: true,
  })
  isoCode?: string;

  @Column({
    name: 'iso_code_2',
    nullable: true,
  })
  isoCode2?: string;

  @Column({
    name: 'region',
    nullable: true,
  })
  region?: string;

  @Column({
    name: 'svg_flag',
    nullable: true,
  })
  svgFlag?: string;

  @Column({
    name: 'png_flag',
    nullable: true,
  })
  pngFlag?: string;

  @Column({
    name: 'google_maps',
    nullable: true,
  })
  googleMaps?: string;

  @Column({
    name: 'open_street_maps',
    nullable: true,
  })
  openStreetMaps?: string;

  @Column({
    name: 'timezone',
    nullable: true,
  })
  timezone?: string;

  @Column({
    name: 'lat',
    nullable: true,
  })
  lat?: string;

  @Column({
    name: 'long',
    nullable: true,
  })
  long?: string;
}
