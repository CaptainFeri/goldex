import { Injectable, NotFoundException, ConflictException, ForbiddenException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserTelegramEntity } from "./user-telegram.entity";
import { UserEntity } from "../user/entity/user.entity";
import { UserRoleEnum } from "../shared/enum/user.role.enum";

@Injectable()
export class UserTelegramService {
  constructor(
    @InjectRepository(UserTelegramEntity)
    private readonly repo: Repository<UserTelegramEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async link(telegramId: number, userId: string): Promise<UserTelegramEntity> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    if (user.role !== UserRoleEnum.PARTNER) {
      throw new ForbiddenException(
        "Only partner users can link their account to the Telegram bot. Please contact support.",
      );
    }

    const existing = await this.repo.findOne({ where: { telegramId } });
    if (existing) {
      if (existing.userId === userId) return existing;
      throw new ConflictException("Telegram ID is already linked to another user");
    }
    return this.repo.save(this.repo.create({ telegramId, userId }));
  }

  async findByTelegramId(telegramId: number): Promise<UserTelegramEntity | null> {
    return this.repo.findOne({ where: { telegramId }, relations: { user: true } });
  }

  async findByUserId(userId: string): Promise<UserTelegramEntity | null> {
    return this.repo.findOne({ where: { userId } });
  }

  async unlink(telegramId: number): Promise<void> {
    const entity = await this.repo.findOne({ where: { telegramId } });
    if (!entity) throw new NotFoundException("Telegram link not found");
    await this.repo.remove(entity);
  }
}
