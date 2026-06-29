import { TypeOrmModule } from '@nestjs/typeorm';
import { Module } from '@nestjs/common';
import { BaseInfoService } from './baseinfo.service';
import { CountryEntity } from './entity/country.entity';
import { LanguageEntity } from './entity/language.entity';
import { BaseinfoController } from './baseinfo.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CountryEntity, LanguageEntity])],
  providers: [BaseInfoService],
  exports: [BaseInfoService],
  controllers: [BaseinfoController],
})
export class BaseinfoModule {}
