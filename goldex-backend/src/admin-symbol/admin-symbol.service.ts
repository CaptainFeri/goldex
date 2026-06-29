// symbol.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateSymbolDto } from "./dto/create-symbol.dto";
import { UpdateSymbolDto } from "./dto/update-symbol.dto";
import { SymbolEntity } from "./entity/symbol.entity";
import { SymbolTypeEnum } from "./enum/symbol.type.enum";

@Injectable()
export class AdminSymbolService {
  constructor(
    @InjectRepository(SymbolEntity)
    private symbolRepository: Repository<SymbolEntity>
  ) {}

  async create(createSymbolDto: CreateSymbolDto): Promise<SymbolEntity> {
    const symbol = this.symbolRepository.create(createSymbolDto);
    return await this.symbolRepository.save(symbol);
  }

  async findAll(): Promise<SymbolEntity[]> {
    return await this.symbolRepository.find();
  }

  async findOne(id: string): Promise<SymbolEntity> {
    const symbol = await this.symbolRepository.findOne({
      where: { id },
    });

    if (!symbol) {
      throw new NotFoundException(`Symbol with ID ${id} not found`);
    }

    return symbol;
  }

  async findBySlug(slug: string): Promise<SymbolEntity> {
    const symbol = await this.symbolRepository.findOne({
      where: { slug },
    });

    if (!symbol) {
      throw new NotFoundException(`Symbol with slug ${slug} not found`);
    }

    return symbol;
  }

  async update(id: string, updateSymbolDto: UpdateSymbolDto): Promise<SymbolEntity> {
    const symbol = await this.findOne(id);

    Object.assign(symbol, updateSymbolDto);
    return await this.symbolRepository.save(symbol);
  }

  async remove(id: string): Promise<void> {
    const result = await this.symbolRepository.delete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Symbol with ID ${id} not found`);
    }
  }

  async findByType(symbolType: SymbolTypeEnum): Promise<SymbolEntity[]> {
    return await this.symbolRepository.find({
      where: { symbolType },
    });
  }

  async findActive(): Promise<SymbolEntity[]> {
    return await this.symbolRepository.find({
      where: { isActive: true },
    });
  }

  async updateStatus(id: string, isActive: boolean): Promise<SymbolEntity> {
    const symbol = await this.findOne(id);
    symbol.isActive = isActive;
    return await this.symbolRepository.save(symbol);
  }
}
