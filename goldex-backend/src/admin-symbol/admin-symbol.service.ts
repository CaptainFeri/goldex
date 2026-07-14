// symbol.service.ts
import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateSymbolDto } from "./dto/create-symbol.dto";
import { UpdateSymbolDto } from "./dto/update-symbol.dto";
import { SymbolEntity } from "./entity/symbol.entity";
import { SymbolTypeEnum } from "./enum/symbol.type.enum";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";
import { UserEntity } from "../user/entity/user.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";

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
  ) {}

  async create(createSymbolDto: CreateSymbolDto): Promise<SymbolEntity> {
    const symbol = this.symbolRepository.create(createSymbolDto);
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
