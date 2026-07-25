import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramUserEntity, UserState } from './entity/telegram-user.entity';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(TelegramUserEntity)
    private readonly userRepo: Repository<TelegramUserEntity>,
  ) {}

  async findByChatId(chatId: number): Promise<TelegramUserEntity | null> {
    return this.userRepo.findOne({
      where: { telegramChatId: chatId },
    });
  }

  async findOrCreate(chatId: number, metadata?: {
    firstName?: string;
    lastName?: string;
    username?: string;
  }): Promise<TelegramUserEntity> {
    let user = await this.findByChatId(chatId);
    if (!user) {
      user = this.userRepo.create({
        telegramChatId: chatId,
        state: UserState.IDLE,
        ...metadata,
      });
      user = await this.userRepo.save(user);
    } else if (metadata) {
      if (metadata.firstName) user.firstName = metadata.firstName;
      if (metadata.lastName) user.lastName = metadata.lastName;
      if (metadata.username) user.username = metadata.username;
      user = await this.userRepo.save(user);
    }
    return user;
  }

  async updateState(chatId: number, state: UserState): Promise<void> {
    await this.userRepo.update(
      { telegramChatId: chatId },
      { state, lastActivityAt: new Date() },
    );
  }

  async setPhone(chatId: number, phone: string): Promise<void> {
    await this.userRepo.update({ telegramChatId: chatId }, { phone });
  }

  async authenticate(
    chatId: number,
    goldexUserId: string,
    accessToken: string,
    refreshToken: string,
    role?: number,
  ): Promise<void> {
    await this.userRepo.update(
      { telegramChatId: chatId },
      {
        goldexUserId,
        accessToken,
        refreshToken,
        role,
        state: UserState.AUTHENTICATED,
        lastActivityAt: new Date(),
      },
    );
  }

  async setRole(chatId: number, role: number): Promise<void> {
    await this.userRepo.update({ telegramChatId: chatId }, { role });
  }

  async logout(chatId: number): Promise<void> {
    await this.userRepo.update(
      { telegramChatId: chatId },
      {
        goldexUserId: null,
        accessToken: null,
        refreshToken: null,
        state: UserState.IDLE,
        phone: null,
        metadata: null,
      },
    );
  }

  async updateMetadata(chatId: number, metadata: Record<string, any>): Promise<void> {
    const user = await this.findByChatId(chatId);
    if (user) {
      user.metadata = { ...(user.metadata || {}), ...metadata };
      await this.userRepo.save(user);
    }
  }

  async findByGoldexUserId(goldexUserId: string): Promise<TelegramUserEntity | null> {
    return this.userRepo.findOne({
      where: { goldexUserId },
    });
  }

  async findAllAuthenticated(): Promise<TelegramUserEntity[]> {
    return this.userRepo.find({
      where: { state: UserState.AUTHENTICATED },
    });
  }
}
