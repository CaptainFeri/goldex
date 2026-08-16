import { Injectable, NotFoundException, ConflictException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { UserLevelEntity } from "./entity/user-level.entity";
import { UserEntity } from "../user/entity/user.entity";
import { CreateLevelDto } from "./dto/create-level.dto";
import { UpdateLevelDto } from "./dto/update-level.dto";
import { AssignLevelDto } from "./dto/assign-level.dto";
import { UserEvents } from "../shared/constants/events.constants";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";

@Injectable()
export class UserLevelService {
  constructor(
    @InjectRepository(UserLevelEntity)
    private readonly levelRepo: Repository<UserLevelEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(PricePairEntity)
    private readonly pairRepo: Repository<PricePairEntity>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async findAll(): Promise<UserLevelEntity[]> {
    return this.levelRepo.find({
      relations: { pairs: { baseSymbol: true, quoteSymbol: true } },
      order: { priority: "ASC" },
    });
  }

  async findById(id: string): Promise<UserLevelEntity> {
    const level = await this.levelRepo.findOne({
      where: { id },
      relations: { pairs: { baseSymbol: true, quoteSymbol: true } },
    });
    if (!level) throw new NotFoundException("User level not found");
    return level;
  }

  async findBySlug(slug: string): Promise<UserLevelEntity | null> {
    return this.levelRepo.findOne({ where: { slug } });
  }

  async getDefaultLevel(): Promise<UserLevelEntity | null> {
    return this.levelRepo.findOne({ where: { isDefault: true } });
  }

  async create(dto: CreateLevelDto): Promise<UserLevelEntity> {
    const existing = await this.levelRepo.findOne({ where: { slug: dto.slug } });
    if (existing) throw new ConflictException("Level with this slug already exists");
    if (dto.isDefault) {
      await this.levelRepo.update({ isDefault: true }, { isDefault: false });
    }
    const { pairIds, ...rest } = dto;
    const saved = await this.levelRepo.save(this.levelRepo.create(rest));
    if (pairIds && pairIds.length > 0) {
      const pairs = await this.pairRepo.findBy({ id: In(pairIds) });
      saved.pairs = pairs;
      await this.levelRepo.save(saved);
    }
    return this.findById(saved.id);
  }

  async update(id: string, dto: UpdateLevelDto): Promise<UserLevelEntity> {
    const level = await this.findById(id);
    if (dto.slug && dto.slug !== level.slug) {
      const existing = await this.levelRepo.findOne({ where: { slug: dto.slug } });
      if (existing) throw new ConflictException("Level with this slug already exists");
    }
    if (dto.isDefault) {
      await this.levelRepo.update({ isDefault: true }, { isDefault: false });
    }
    const { pairIds, ...rest } = dto;
    await this.levelRepo.update(id, rest);
    if (pairIds) {
      const pairs = await this.pairRepo.findBy({ id: In(pairIds) });
      await this.levelRepo.save({ id, pairs });
    }
    return this.findById(id);
  }

  async remove(id: string): Promise<void> {
    const level = await this.findById(id);
    if (level.isDefault) throw new BadRequestException("Cannot delete the default level");
    const userCount = await this.userRepo.count({ where: { levelId: id } });
    if (userCount > 0) {
      const defaultLevel = await this.getDefaultLevel();
      if (defaultLevel) {
        await this.userRepo.update({ levelId: id }, { levelId: defaultLevel.id });
      }
    }
    await this.levelRepo.softDelete(id);
  }

  async assignLevel(dto: AssignLevelDto): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { id: dto.userId } });
    if (!user) throw new NotFoundException("User not found");
    const level = await this.findById(dto.levelId);
    const previousLevelId = user.levelId;

    user.levelId = level.id;
    user.levelAssignedAt = new Date();
    user.levelExpiresAt = dto.expiresAt || null;
    await this.userRepo.save(user);
    const updated = await this.userRepo.findOne({
      where: { id: user.id },
      relations: { level: true },
    });
    this.eventEmitter.emit(UserEvents.LEVEL_CHANGED, {
      userId: user.id,
      levelId: level.id,
      levelName: level.name,
      previousLevelId,
    });
    return updated;
  }

  async unassignLevel(userId: string): Promise<UserEntity> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    user.levelId = null;
    user.levelAssignedAt = null;
    user.levelExpiresAt = null;
    await this.userRepo.save(user);
    const updated = await this.userRepo.findOne({
      where: { id: user.id },
      relations: { level: true },
    });
    this.eventEmitter.emit(UserEvents.LEVEL_UNASSIGNED, { userId });
    return updated;
  }

  async getUserLevel(userId: string): Promise<UserLevelEntity | null> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: { level: true },
    });
    if (!user) return null;
    if (user.levelExpiresAt && new Date() > user.levelExpiresAt) {
      const defaultLevel = await this.getDefaultLevel();
      if (defaultLevel) {
        user.levelId = defaultLevel.id;
        user.levelAssignedAt = new Date();
        user.levelExpiresAt = null;
        await this.userRepo.save(user);
        return defaultLevel;
      }
      return null;
    }
    if (user.level) return user.level;
    const defaultLevel = await this.getDefaultLevel();
    if (defaultLevel) {
      user.levelId = defaultLevel.id;
      user.levelAssignedAt = new Date();
      user.levelExpiresAt = null;
      await this.userRepo.save(user);
      return defaultLevel;
    }
    return null;
  }

  async getFeatureValue(userId: string, featureKey: string): Promise<any> {
    const level = await this.getUserLevel(userId);
    if (!level) return null;
    return level.features?.[featureKey] ?? null;
  }

  async hasFeature(userId: string, featureKey: string): Promise<boolean> {
    const value = await this.getFeatureValue(userId, featureKey);
    if (value === null || value === undefined) return false;
    if (typeof value === "object" && "enabled" in value) return value.enabled === true;
    if (typeof value === "boolean") return value;
    return value !== null && value !== undefined;
  }

  // Ids of the pairs allowed by the user's effective level. Empty array means
  // "no explicit pair restriction" (callers fall back to market-type filtering).
  async getUserAllowedPairIds(userId: string): Promise<string[]> {
    const level = await this.getUserLevel(userId);
    if (!level?.pairs) return [];
    return level.pairs.map((p) => p.id);
  }

  async getUsersByLevel(levelId: string, page: number, limit: number): Promise<[UserEntity[], number]> {
    return this.userRepo.findAndCount({
      where: { levelId },
      skip: (page - 1) * limit,
      take: limit,
      order: { createAt: "DESC" },
    });
  }
}
