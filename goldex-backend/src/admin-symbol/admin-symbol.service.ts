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
import { getDefaultDepositTypes, getDefaultWithdrawTypes, validateDepositTypes, validateWithdrawTypes } from "./constants/symbol-type-type-map";
import { PaymentBusService } from "../payment-bus/payment-bus.service";

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
  ) {}

  private resolveTypes(dto: CreateSymbolDto | UpdateSymbolDto): Partial<SymbolEntity> {
    const updates: Partial<SymbolEntity> = {};

    if (dto.symbolType) {
      if (dto.depositTypes) {
        const err = validateDepositTypes(dto.symbolType, dto.depositTypes as string[]);
        if (err) throw new BadRequestException(err);
        updates.depositTypes = dto.depositTypes as string[];
      } else {
        updates.depositTypes = getDefaultDepositTypes(dto.symbolType);
      }

      if (dto.withdrawTypes) {
        const err = validateWithdrawTypes(dto.symbolType, dto.withdrawTypes as string[]);
        if (err) throw new BadRequestException(err);
        updates.withdrawTypes = dto.withdrawTypes as string[];
      } else {
        updates.withdrawTypes = getDefaultWithdrawTypes(dto.symbolType);
      }
    }

    return updates;
  }

  async create(createSymbolDto: CreateSymbolDto): Promise<SymbolEntity> {
    this.validateGateways(createSymbolDto);
    const types = this.resolveTypes(createSymbolDto);
    const symbol = this.symbolRepository.create({ ...createSymbolDto, ...types });
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
          where: { userId: user.id, symbolId: saved.id },
        });
        if (!existing) {
          const wallet = new WalletEntity();
          wallet.symbol = saved;
          wallet.user = user;
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
    }

    if (updateSymbolDto.depositTypes !== undefined) {
      const err = validateDepositTypes(nextType, updateSymbolDto.depositTypes as string[]);
      if (err) throw new BadRequestException(err);
    }
    if (updateSymbolDto.withdrawTypes !== undefined) {
      const err = validateWithdrawTypes(nextType, updateSymbolDto.withdrawTypes as string[]);
      if (err) throw new BadRequestException(err);
    }

    this.validateGateways(updateSymbolDto);

    Object.assign(symbol, updateSymbolDto);
    const saved = await this.symbolRepository.save(symbol);
    this.paymentBus.syncSymbol(saved);
    return saved;
  }

  private validateGateways(dto: CreateSymbolDto | UpdateSymbolDto): void {
    const hasGateway = dto.hasPaymentGateway !== undefined ? dto.hasPaymentGateway : undefined;

    if (dto.depositGateways !== undefined && dto.depositGateways.length > 0 && hasGateway === false) {
      throw new BadRequestException("Deposit gateways require hasPaymentGateway=true");
    }
    if (dto.withdrawGateways !== undefined && dto.withdrawGateways.length > 0 && hasGateway === false) {
      throw new BadRequestException("Withdraw gateways require hasPaymentGateway=true");
    }

    const validateDefault = (
      field: string,
      def: string | undefined,
      list: string[] | undefined,
    ) => {
      if (def && Array.isArray(list) && list.length > 0 && !list.includes(def)) {
        throw new BadRequestException(`${field} "${def}" is not in the selectable list: ${list.join(", ")}`);
      }
    };

    validateDefault("defaultDepositGateway", dto.defaultDepositGateway, dto.depositGateways);
    validateDefault("defaultWithdrawGateway", dto.defaultWithdrawGateway, dto.withdrawGateways);
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
