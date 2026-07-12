import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { UserTelegramEntity } from "./user-telegram.entity";

@Injectable()
export class UserTelegramService {
  constructor(
    @InjectRepository(UserTelegramEntity)
    private readonly repo: Repository<UserTelegramEntity>,
  ) {}

  async link(telegramId: number, userId: string): Promise<UserTelegramEntity> {
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
