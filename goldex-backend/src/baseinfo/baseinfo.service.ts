import { InjectRepository } from "@nestjs/typeorm";
import { Injectable } from "@nestjs/common";
import { ILike, Repository } from "typeorm";
import { CountryEntity } from "./entity/country.entity";
import { LanguageEntity } from "./entity/language.entity";

@Injectable()
export class BaseInfoService {
  constructor(
    @InjectRepository(CountryEntity)
    private readonly countryRepo: Repository<CountryEntity>,
    @InjectRepository(LanguageEntity)
    private readonly langRepo: Repository<LanguageEntity>
  ) {}

  async getCountries(take: number, skip: number, searchKey?: string) {
    const [countryList, totalItems] = await this.countryRepo.findAndCount({
      take,
      skip,
      where: searchKey ? [{ primaryName: ILike(`%${searchKey}%`) }, { secondaryName: ILike(`%${searchKey}%`) }] : null,
      order: {
        createAt: "desc",
      },
    });
    return {
      countryList,
      totalItems,
    };
  }

  async getCountryById(countryId: number): Promise<CountryEntity> {
    return await this.countryRepo.findOne({ where: { id: countryId } });
  }

  async getLanguages(take: number, skip: number, searchkey?: string) {
    const [languageList, totalItems] = await this.langRepo.findAndCount({
      take,
      skip,
      where: searchkey
        ? [
            { name: ILike(`%${searchkey}%`), isActive: true },
            { nativeName: ILike(`%${searchkey}%`), isActive: true },
            { locale: ILike(`%${searchkey}`), isActive: true },
          ]
        : [{ isActive: true }],
      select: { id: true, name: true, nativeName: true, locale: true },
      order: {
        createAt: "desc",
      },
    });
    return { languageList, totalItems };
  }

  async getLanguageById(langId: number) {
    return this.langRepo.findOne({ where: { id: langId } });
  }
}
