// symbol.service.ts
import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateSymbolDto } from "./dto/create-symbol.dto";
import { UpdateSymbolDto } from "./dto/update-symbol.dto";
import { SymbolEntity } from "./entity/symbol.entity";
import { SymbolTypeEnum } from "./enum/symbol.type.enum";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";
import { UserEntity } from "../user/entity/user.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { WalletTypeEnum } from "../wallet/enum/wallet-type.enum";
import {
  getDefaultDepositTypes,
  getDefaultWithdrawTypes,
  validateDepositTypes,
  validateWithdrawTypes,
  getDefaultDepositGateways,
  getDefaultWithdrawGateways,
  getEligibleGatewayCategories,
  requiresGateway,
} from "./constants/symbol-type-type-map";
import { PaymentBusService } from "../payment-bus/payment-bus.service";
import { SymbolCapabilitiesService } from "./symbol-capabilities.service";

@Injectable()
export class AdminSymbolService {
  private readonly logger = new Logger(AdminSymbolService.name);

  constructor(
    @InjectRepository(SymbolEntity)
    private symbolRepository: Repository<SymbolEntity>,
    @InjectRepository(UserMarketTypeEntity)
    private readonly userMarketTypeRepo: Repository<UserMarketTypeEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    private readonly paymentBus: PaymentBusService,
    private readonly capabilities: SymbolCapabilitiesService,
  ) {}

  private resolveTypes(dto: CreateSymbolDto | UpdateSymbolDto): Partial<SymbolEntity> {
    const updates: Partial<SymbolEntity> = {};

    if (dto.symbolType) {
      if (dto.depositTypes) {
        const err = validateDepositTypes(dto.symbolType, dto.depositTypes);
        if (err) throw new BadRequestException(err);
        updates.depositTypes = dto.depositTypes;
      } else {
        updates.depositTypes = getDefaultDepositTypes(dto.symbolType);
      }

      if (dto.withdrawTypes) {
        const err = validateWithdrawTypes(dto.symbolType, dto.withdrawTypes);
        if (err) throw new BadRequestException(err);
        updates.withdrawTypes = dto.withdrawTypes;
      } else {
        updates.withdrawTypes = getDefaultWithdrawTypes(dto.symbolType);
      }
    }

    return updates;
  }

  private resolveGateways(dto: CreateSymbolDto | UpdateSymbolDto): Partial<SymbolEntity> {
    const updates: Partial<SymbolEntity> = {};
    const symbolType = dto.symbolType;

    if (!symbolType) return updates;

    if (dto.hasPaymentGateway !== false) {
      if (dto.depositGateways === undefined) {
        updates.depositGateways = getDefaultDepositGateways(symbolType);
      }
      if (dto.withdrawGateways === undefined) {
        updates.withdrawGateways = getDefaultWithdrawGateways(symbolType);
      }
    }

    return updates;
  }

  async create(createSymbolDto: CreateSymbolDto): Promise<SymbolEntity> {
    await this.validateGateways(createSymbolDto);
    const types = this.resolveTypes(createSymbolDto);
    const gateways = this.resolveGateways(createSymbolDto);
    const symbol = this.symbolRepository.create({ ...createSymbolDto, ...types, ...gateways });
    const saved = await this.symbolRepository.save(symbol);

    // Auto-create wallets for users whose market type matches this symbol's market type
    try {
      const userMarketTypes = await this.userMarketTypeRepo.find({
        where: { marketType: saved.marketType },
        relations: { user: true },
      });

      const uniqueUsers = new Map<string, UserEntity>();
      for (const umt of userMarketTypes) {
        if (umt.user && !uniqueUsers.has(umt.user.id)) {
          uniqueUsers.set(umt.user.id, umt.user);
        }
      }

      for (const user of uniqueUsers.values()) {
        const existing = await this.walletRepo.findOne({
          where: { userId: user.id, symbolId: saved.id, walletType: WalletTypeEnum.DEPOSIT },
        });
        if (!existing) {
          const wallet = new WalletEntity();
          wallet.symbol = saved;
          wallet.user = user;
          wallet.walletType = WalletTypeEnum.DEPOSIT;
          wallet.freeBalance = 0;
          wallet.lockedBalance = 0;
          await this.walletRepo.save(wallet);
        }
      }

      if (uniqueUsers.size > 0) {
        this.logger.log(`Created wallets for ${uniqueUsers.size} users for new symbol ${saved.slug}`);
      }
    } catch (err) {
      this.logger.error(`Failed to auto-create wallets for symbol ${saved.slug}: ${(err as Error).message}`);
    }

    this.paymentBus.syncSymbol(saved);
    return saved;
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

    const nextType = updateSymbolDto.symbolType ?? symbol.symbolType;
    const typeChanged = updateSymbolDto.symbolType !== undefined && updateSymbolDto.symbolType !== symbol.symbolType;

    // If the symbol type changed but deposit/withdraw types were not sent,
    // re-apply the defaults for the new type so stale/invalid types are not kept.
    if (typeChanged) {
      if (updateSymbolDto.depositTypes === undefined) {
        updateSymbolDto.depositTypes = getDefaultDepositTypes(nextType) as UpdateSymbolDto["depositTypes"];
      }
      if (updateSymbolDto.withdrawTypes === undefined) {
        updateSymbolDto.withdrawTypes = getDefaultWithdrawTypes(nextType) as UpdateSymbolDto["withdrawTypes"];
      }
      if (updateSymbolDto.depositGateways === undefined) {
        updateSymbolDto.depositGateways = getDefaultDepositGateways(nextType);
      }
      if (updateSymbolDto.withdrawGateways === undefined) {
        updateSymbolDto.withdrawGateways = getDefaultWithdrawGateways(nextType);
      }
    }

    if (updateSymbolDto.depositTypes !== undefined) {
      const err = validateDepositTypes(nextType, updateSymbolDto.depositTypes as string[]);
      if (err) throw new BadRequestException(err);
    }
    if (updateSymbolDto.withdrawTypes !== undefined) {
      const err = validateWithdrawTypes(nextType, updateSymbolDto.withdrawTypes as string[]);
      if (err) throw new BadRequestException(err);
    }

    await this.validateGateways(updateSymbolDto, symbol);

    Object.assign(symbol, updateSymbolDto);
    const saved = await this.symbolRepository.save(symbol);
    this.paymentBus.syncSymbol(saved);
    return saved;
  }

  /**
   * Validate the gateway side of a symbol write against the *effective* symbol,
   * not the partial DTO: on a PATCH an omitted field means "unchanged", so the
   * stored value has to stand in or the checks silently pass.
   */
  private async validateGateways(
    dto: CreateSymbolDto | UpdateSymbolDto,
    existing?: SymbolEntity,
  ): Promise<void> {
    const pick = <K extends keyof SymbolEntity>(
      value: unknown,
      key: K,
    ): SymbolEntity[K] | undefined =>
      value !== undefined ? (value as SymbolEntity[K]) : existing?.[key];

    const symbolType = pick(dto.symbolType, "symbolType") as SymbolTypeEnum | undefined;
    const hasGateway = pick(dto.hasPaymentGateway, "hasPaymentGateway") as boolean | undefined;
    const depositGateways = (pick(dto.depositGateways, "depositGateways") as string[]) ?? [];
    const withdrawGateways = (pick(dto.withdrawGateways, "withdrawGateways") as string[]) ?? [];
    const depositTypes = (pick(dto.depositTypes, "depositTypes") as string[]) ?? [];
    const withdrawTypes = (pick(dto.withdrawTypes, "withdrawTypes") as string[]) ?? [];
    const defaultDepositGateway = pick(dto.defaultDepositGateway, "defaultDepositGateway") as
      | string
      | undefined;
    const defaultWithdrawGateway = pick(dto.defaultWithdrawGateway, "defaultWithdrawGateway") as
      | string
      | undefined;

    if (hasGateway === false) {
      if (depositGateways.length > 0 || withdrawGateways.length > 0) {
        throw new BadRequestException("Gateways require hasPaymentGateway=true");
      }
      if (requiresGateway(depositTypes) || requiresGateway(withdrawTypes)) {
        throw new BadRequestException(
          "A gateway-bound deposit/withdraw type requires hasPaymentGateway=true",
        );
      }
    }

    // A gateway-bound type with nothing to route through would only fail later,
    // at the customer's first deposit or withdrawal.
    if (requiresGateway(depositTypes) && depositGateways.length === 0) {
      throw new BadRequestException(
        "Deposit type \"payment-gateway\" requires at least one deposit gateway",
      );
    }
    if (requiresGateway(withdrawTypes) && withdrawGateways.length === 0) {
      throw new BadRequestException(
        "Withdraw type \"auto\" requires at least one withdraw gateway",
      );
    }

    await this.assertGatewaysUsable("Deposit", depositGateways, symbolType);
    await this.assertGatewaysUsable("Withdraw", withdrawGateways, symbolType);

    const validateDefault = (field: string, def: string | undefined, list: string[]) => {
      if (def && list.length > 0 && !list.includes(def)) {
        throw new BadRequestException(
          `${field} "${def}" is not in the selectable list: ${list.join(", ")}`,
        );
      }
    };

    validateDefault("defaultDepositGateway", defaultDepositGateway, depositGateways);
    validateDefault("defaultWithdrawGateway", defaultWithdrawGateway, withdrawGateways);
  }

  /**
   * Every selected gateway must be registered in goldex-cbp and serve a
   * category this symbol type can use. When cbp is unreachable the codes cannot
   * be checked — the write is allowed through rather than blocking symbol
   * administration on a payment-service outage.
   */
  private async assertGatewaysUsable(
    label: string,
    codes: string[],
    symbolType?: SymbolTypeEnum,
  ): Promise<void> {
    if (codes.length === 0) return;

    const registered = await this.capabilities.getRegisteredCodes();
    if (!registered) {
      this.logger.warn(
        `goldex-cbp is unreachable; accepting ${label.toLowerCase()} gateways [${codes.join(", ")}] unverified`,
      );
      return;
    }

    const categories = symbolType ? getEligibleGatewayCategories(symbolType) : null;

    for (const code of codes) {
      if (!registered.has(code)) {
        throw new BadRequestException(
          `${label} gateway "${code}" is not registered in goldex-cbp. Available: ${[...registered].join(", ") || "none"}`,
        );
      }
      if (!categories) continue;
      const gateway = await this.capabilities.getGateway(code);
      if (gateway && !categories.includes(gateway.category)) {
        throw new BadRequestException(
          `${label} gateway "${code}" serves "${gateway.category}" payments, which a "${symbolType}" symbol cannot use. Allowed categories: ${categories.join(", ") || "none"}`,
        );
      }
    }
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
    const saved = await this.symbolRepository.save(symbol);
    this.paymentBus.syncSymbol(saved);
    return saved;
  }
}
