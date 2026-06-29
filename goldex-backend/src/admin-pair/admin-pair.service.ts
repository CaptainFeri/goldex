import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { PricePairEntity } from "./entity/price.pair.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { InjectRepository as InjectSymbolRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreatePricePairDto } from "./dto/create-pair.dto";
import { UpdatePricePairDto } from "./dto/update-price-paird.dto";

@Injectable()
export class AdminPairService {
  constructor(
    @InjectSymbolRepository(SymbolEntity)
    private symbolRepository: Repository<SymbolEntity>,
    @InjectRepository(PricePairEntity)
    private pricePairRepository: Repository<PricePairEntity>
  ) {}

  async create(createPricePairDto: CreatePricePairDto): Promise<PricePairEntity> {
    const existingPair = await this.pricePairRepository.findOne({
      where: {
        quoteSymbol: { name: createPricePairDto.quoteCode },
        baseSymbol: { name: createPricePairDto.baseCode },
      },
    });

    if (existingPair) {
      throw new ConflictException(
        `Price pair with baseCode "${createPricePairDto.baseCode}" and quoteCode "${createPricePairDto.quoteCode}" already exists`
      );
    }

    const baseSymbol = await this.symbolRepository.findOne({
      where: { slug: createPricePairDto.baseCode },
    });
    const quoteSymbol = await this.symbolRepository.findOne({
      where: { slug: createPricePairDto.quoteCode },
    });

    if (!baseSymbol || !quoteSymbol) {
      throw new NotFoundException("Base or Quote symbol not found");
    }

    const pricePair = this.pricePairRepository.create({
      ...createPricePairDto,
      baseSymbol: { name: baseSymbol.name },
      quoteSymbol: { name: quoteSymbol.name },
      lastUpdated: new Date(),
    });

    return this.pricePairRepository.save(pricePair);
  }

  async findAll(): Promise<PricePairEntity[]> {
    return this.pricePairRepository.find({
      relations: { baseSymbol: true, quoteSymbol: true },
      order: { createAt: "DESC" },
    });
  }

  async findOne(id: string): Promise<PricePairEntity> {
    return await this.pricePairRepository.findOne({ where: { id } });
  }

  async update(id: string, updatePricePairDto: UpdatePricePairDto): Promise<PricePairEntity> {
    const pricePair = await this.pricePairRepository.findOne({ where: { id } });
    if (updatePricePairDto.baseCode || updatePricePairDto.quoteCode) {
      if (updatePricePairDto.baseCode) {
        const baseSymbol = await this.symbolRepository.findOne({
          where: { slug: updatePricePairDto.baseCode },
        });
        if (baseSymbol) pricePair.baseSymbol = baseSymbol;
      }

      if (updatePricePairDto.quoteCode) {
        const quoteSymbol = await this.symbolRepository.findOne({
          where: { slug: updatePricePairDto.quoteCode },
        });
        if (quoteSymbol) pricePair.quoteSymbol = quoteSymbol;
      }
      delete updatePricePairDto.baseCode;
      delete updatePricePairDto.quoteCode;
    }

    if (updatePricePairDto.price !== undefined) {
      pricePair.lastUpdated = new Date();
    }

    Object.assign(pricePair, updatePricePairDto);

    return this.pricePairRepository.save(pricePair);
  }

  async remove(id: string): Promise<void> {
    const result = await this.pricePairRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Price pair with ID "${id}" not found`);
    }
  }

  async findByBaseCode(baseCode: string): Promise<PricePairEntity[]> {
    return this.pricePairRepository.find({ where: { baseSymbol: { slug: baseCode } } });
  }

  async findByQuoteCode(quoteCode: string): Promise<PricePairEntity[]> {
    return this.pricePairRepository.find({ where: { quoteSymbol: { slug: quoteCode } } });
  }

  async getValidPairs(): Promise<PricePairEntity[]> {
    return this.pricePairRepository.find({ where: { isValid: true } });
  }

  // User-facing market list: valid pairs with their base/quote symbol info so
  // the client can render names, icons and prices without extra lookups.
  async findValidWithSymbols(): Promise<PricePairEntity[]> {
    return this.pricePairRepository.find({
      where: { isValid: true },
      relations: { baseSymbol: true, quoteSymbol: true },
      order: { lastUpdated: "DESC" },
    });
  }

  async updatePrice(id: string, price: number): Promise<PricePairEntity> {
    const pricePair = await this.pricePairRepository.findOne({ where: { id } });
    pricePair.price = price;
    pricePair.lastUpdated = new Date();
    return this.pricePairRepository.save(pricePair);
  }

  async toggleValidity(id: string): Promise<PricePairEntity> {
    const pricePair = await this.pricePairRepository.findOne({ where: { id } });
    pricePair.isValid = !pricePair.isValid;
    return this.pricePairRepository.save(pricePair);
  }
}
