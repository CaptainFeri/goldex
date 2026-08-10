import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProviderPairMappingEntity } from './entity/provider-pair-mapping.entity';
import { PricePairEntity } from '../admin-pair/entity/price.pair.entity';
import { CreateProviderPairMappingDto } from './dto/create-provider-pair-mapping.dto';

@Injectable()
export class ProviderPairMappingService {
  private readonly logger = new Logger(ProviderPairMappingService.name);

  constructor(
    @InjectRepository(ProviderPairMappingEntity)
    private readonly mappingRepo: Repository<ProviderPairMappingEntity>,
    @InjectRepository(PricePairEntity)
    private readonly pairRepo: Repository<PricePairEntity>,
  ) {}

  async create(
    dto: CreateProviderPairMappingDto,
  ): Promise<ProviderPairMappingEntity> {
    const pair = await this.pairRepo.findOne({ where: { id: dto.pairId } });
    if (!pair) {
      throw new NotFoundException(`Price pair with ID "${dto.pairId}" not found`);
    }

    const existing = await this.mappingRepo.findOne({
      where: {
        pairId: dto.pairId,
        providerKey: dto.providerKey,
        providerItemId: dto.providerItemId,
      },
    });

    if (existing) {
      throw new ConflictException(
        `Mapping already exists for pair "${dto.pairId}", provider "${dto.providerKey}", item "${dto.providerItemId}"`,
      );
    }

    const mapping = this.mappingRepo.create({
      pairId: dto.pairId,
      providerKey: dto.providerKey,
      providerItemId: dto.providerItemId,
      useBuyPrice: dto.useBuyPrice ?? true,
      useSellPrice: dto.useSellPrice ?? true,
    });

    return this.mappingRepo.save(mapping);
  }

  async findAll(): Promise<ProviderPairMappingEntity[]> {
    return this.mappingRepo.find({
      relations: { pair: true },
      order: { createAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<ProviderPairMappingEntity> {
    const mapping = await this.mappingRepo.findOne({
      where: { id },
      relations: { pair: true },
    });
    if (!mapping) {
      throw new NotFoundException(`Mapping with ID "${id}" not found`);
    }
    return mapping;
  }

  async findByProvider(
    providerKey: string,
  ): Promise<ProviderPairMappingEntity[]> {
    return this.mappingRepo.find({
      where: { providerKey },
      relations: { pair: true },
    });
  }

  async findByPair(pairId: string): Promise<ProviderPairMappingEntity[]> {
    return this.mappingRepo.find({
      where: { pairId },
      relations: { pair: true },
    });
  }

  async findMappingsForPriceUpdate(
    providerKey: string,
    providerItemId: number,
  ): Promise<ProviderPairMappingEntity[]> {
    return this.mappingRepo.find({
      where: { providerKey, providerItemId },
      relations: { pair: true },
    });
  }

  /**
   * Resolve a provider item to its mapped price pair, including the pair's
   * base/quote symbols. Used to attribute provider deals to the real pair.
   */
  async findPairForProviderItem(
    providerKey: string,
    providerItemId: number,
  ): Promise<PricePairEntity | null> {
    const mapping = await this.mappingRepo.findOne({
      where: { providerKey, providerItemId },
      relations: { pair: { baseSymbol: true, quoteSymbol: true } },
    });
    return mapping?.pair ?? null;
  }

  async update(
    id: string,
    dto: Partial<CreateProviderPairMappingDto>,
  ): Promise<ProviderPairMappingEntity> {
    const mapping = await this.findOne(id);

    if (dto.pairId) {
      const pair = await this.pairRepo.findOne({ where: { id: dto.pairId } });
      if (!pair) {
        throw new NotFoundException(`Price pair with ID "${dto.pairId}" not found`);
      }
    }

    Object.assign(mapping, dto);
    return this.mappingRepo.save(mapping);
  }

  async remove(id: string): Promise<void> {
    const result = await this.mappingRepo.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Mapping with ID "${id}" not found`);
    }
  }
}
