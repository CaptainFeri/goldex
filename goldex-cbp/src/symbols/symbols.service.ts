import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { GatewayRegistry } from "../payments/gateways/gateway.registry";
import {
  validateDepositTypes,
  validateWithdrawTypes,
} from "./constants/symbol-type-type-map";
import { CreateSymbolDto, UpdateSymbolDto } from "./dto/create-symbol.dto";
import { PaymentSymbolEntity } from "./entity/payment-symbol.entity";
import { SymbolTypeEnum } from "./enum/symbol.type.enum";

@Injectable()
export class SymbolsService {
  constructor(
    @InjectRepository(PaymentSymbolEntity)
    private readonly symbolRepo: Repository<PaymentSymbolEntity>,
    private readonly registry: GatewayRegistry,
  ) {}

  async create(dto: CreateSymbolDto): Promise<PaymentSymbolEntity> {
    const symbol = this.symbolRepo.create({
      name: dto.name,
      slug: dto.slug,
      symbolType: dto.symbolType,
      hasPaymentGateway: dto.hasPaymentGateway ?? false,
      isActive: dto.isActive ?? false,
      depositTypes: dto.depositTypes ?? [],
      withdrawTypes: dto.withdrawTypes ?? [],
      depositGateways: dto.depositGateways ?? [],
      withdrawGateways: dto.withdrawGateways ?? [],
      defaultDepositGateway: dto.defaultDepositGateway,
      defaultWithdrawGateway: dto.defaultWithdrawGateway,
    });
    this.validate(symbol);
    return this.symbolRepo.save(symbol);
  }

  async update(
    id: string,
    dto: UpdateSymbolDto,
  ): Promise<PaymentSymbolEntity> {
    const symbol = await this.findById(id);
    const merged = this.symbolRepo.merge(symbol, dto);
    if (dto.depositTypes) merged.depositTypes = dto.depositTypes;
    if (dto.withdrawTypes) merged.withdrawTypes = dto.withdrawTypes;
    if (dto.depositGateways) merged.depositGateways = dto.depositGateways;
    if (dto.withdrawGateways) merged.withdrawGateways = dto.withdrawGateways;
    this.validate(merged);
    return this.symbolRepo.save(merged);
  }

  async remove(id: string): Promise<void> {
    await this.findById(id);
    await this.symbolRepo.softDelete(id);
  }

  async findById(id: string): Promise<PaymentSymbolEntity> {
    const symbol = await this.symbolRepo.findOne({ where: { id } });
    if (!symbol) throw new NotFoundException("Symbol not found");
    return symbol;
  }

  async findAll(): Promise<PaymentSymbolEntity[]> {
    return this.symbolRepo.find({ order: { createAt: "DESC" } });
  }

  async findBySlug(slug: string): Promise<PaymentSymbolEntity> {
    const symbol = await this.symbolRepo.findOne({ where: { slug } });
    if (!symbol) throw new NotFoundException(`Symbol "${slug}" not found`);
    return symbol;
  }

  /**
   * Creates or updates a symbol from a backend `symbol.sync` message.
   * Backend is the source of truth for symbol configuration.
   */
  async upsertFromSync(data: {
    slug: string;
    name: string;
    symbolType: SymbolTypeEnum;
    hasPaymentGateway?: boolean;
    isActive?: boolean;
    depositTypes?: string[];
    withdrawTypes?: string[];
    depositGateways?: string[];
    withdrawGateways?: string[];
    defaultDepositGateway?: string;
    defaultWithdrawGateway?: string;
  }): Promise<PaymentSymbolEntity> {
    let symbol = await this.symbolRepo.findOne({ where: { slug: data.slug } });
    if (!symbol) {
      symbol = this.symbolRepo.create({
        slug: data.slug,
        name: data.name,
        symbolType: data.symbolType,
      });
    }
    symbol.name = data.name;
    symbol.symbolType = data.symbolType;
    symbol.hasPaymentGateway = data.hasPaymentGateway ?? false;
    symbol.isActive = data.isActive ?? false;
    symbol.depositTypes = data.depositTypes ?? [];
    symbol.withdrawTypes = data.withdrawTypes ?? [];
    symbol.depositGateways = data.depositGateways ?? [];
    symbol.withdrawGateways = data.withdrawGateways ?? [];
    symbol.defaultDepositGateway = data.defaultDepositGateway ?? null;
    symbol.defaultWithdrawGateway = data.defaultWithdrawGateway ?? null;
    this.validate(symbol);
    return this.symbolRepo.save(symbol);
  }

  private validate(symbol: PaymentSymbolEntity): void {
    if (symbol.depositTypes.length) {
      const err = validateDepositTypes(symbol.symbolType, symbol.depositTypes);
      if (err) throw new BadRequestException(err);
    }
    if (symbol.withdrawTypes.length) {
      const err = validateWithdrawTypes(symbol.symbolType, symbol.withdrawTypes);
      if (err) throw new BadRequestException(err);
    }
    if (symbol.hasPaymentGateway) {
      const codes = this.registry.availableCodes();
      for (const code of [...symbol.depositGateways, ...symbol.withdrawGateways]) {
        if (!this.registry.isRegistered(code)) {
          throw new BadRequestException(
            `Gateway "${code}" is not a registered provider. Available: ${codes.join(", ")}`,
          );
        }
      }
      if (
        symbol.defaultDepositGateway &&
        !this.registry.isRegistered(symbol.defaultDepositGateway)
      ) {
        throw new BadRequestException(
          `Default deposit gateway "${symbol.defaultDepositGateway}" is not registered`,
        );
      }
      if (
        symbol.defaultWithdrawGateway &&
        !this.registry.isRegistered(symbol.defaultWithdrawGateway)
      ) {
        throw new BadRequestException(
          `Default withdraw gateway "${symbol.defaultWithdrawGateway}" is not registered`,
        );
      }
    }
  }
}
