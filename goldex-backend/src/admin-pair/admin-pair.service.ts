import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { PricePairEntity } from "./entity/price.pair.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { InjectRepository as InjectSymbolRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreatePricePairDto } from "./dto/create-pair.dto";
import { UpdatePricePairDto } from "./dto/update-price-paird.dto";
import { OrderEntity } from "../order/order.entity";
import { QuoteRequestEntity } from "../quote-request/quote-request.entity";
import { PendDeadlineStateEnum } from "../credit/enum/pend-deadline-state.enum";

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

    if (baseSymbol.marketType !== quoteSymbol.marketType) {
      throw new BadRequestException(
        `Cannot create pair: base symbol (${baseSymbol.slug}) is ${baseSymbol.marketType} but quote symbol (${quoteSymbol.slug}) is ${quoteSymbol.marketType}. Both must have the same market type.`
      );
    }

    const pricePair = this.pricePairRepository.create({
      ...createPricePairDto,
      baseSymbol: baseSymbol,
      quoteSymbol: quoteSymbol,
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

  async getRequestsOverview(pairId: string): Promise<{
    orders: OrderEntity[];
    quoteRequests: QuoteRequestEntity[];
    summary: { buy: number; sell: number; byState: Record<string, number> };
  }> {
    const pair = await this.pricePairRepository.findOne({ where: { id: pairId } });
    if (!pair) throw new NotFoundException("Price pair not found");

    const orders = await this.pricePairRepository.manager.find(OrderEntity, {
      where: { pricePairId: pairId, isCreditLinked: true },
      order: { createAt: "DESC" },
      take: 100,
    });

    const quoteRequests = await this.pricePairRepository.manager.find(QuoteRequestEntity, {
      where: { pricePairId: pairId, isCreditLinked: true },
      order: { createAt: "DESC" },
      take: 100,
    });

    const now = new Date();
    const computeState = (item: { pendDeadlineWarnAt?: Date; pendDeadlineExpireAt?: Date; pendDeadlineGraceEndAt?: Date }): PendDeadlineStateEnum => {
      if (item.pendDeadlineGraceEndAt && now > new Date(item.pendDeadlineGraceEndAt)) return PendDeadlineStateEnum.CLOSED;
      if (item.pendDeadlineExpireAt && now > new Date(item.pendDeadlineExpireAt)) return PendDeadlineStateEnum.GRACE;
      if (item.pendDeadlineWarnAt && now > new Date(item.pendDeadlineWarnAt)) return PendDeadlineStateEnum.RED;
      return PendDeadlineStateEnum.GREEN;
    };

    const byState: Record<string, number> = {};
    let buyCount = 0;
    let sellCount = 0;

    for (const o of orders) {
      const state = computeState(o);
      byState[state] = (byState[state] || 0) + 1;
      if (o.side === "BUY") buyCount++;
      else sellCount++;
    }
    for (const q of quoteRequests) {
      const state = computeState(q);
      byState[state] = (byState[state] || 0) + 1;
      if (q.side === "BUY") buyCount++;
      else sellCount++;
    }

    return { orders, quoteRequests, summary: { buy: buyCount, sell: sellCount, byState } };
  }
}
