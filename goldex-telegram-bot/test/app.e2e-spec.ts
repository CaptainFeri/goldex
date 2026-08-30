import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { UserService } from '../src/user/user.service';
import {
  TelegramUserEntity,
  UserState,
} from '../src/user/entity/telegram-user.entity';

describe('goldex-telegram-bot (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let dataSource: DataSource;
  let users: UserService;

  const chatId = 12_345_678;
  const goldexUserId = 'e2e-goldex-user';
  const accessToken = 'e2e-access-token';
  const refreshToken = 'e2e-refresh-token';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    http = request(app.getHttpServer());
    dataSource = app.get(DataSource);
    users = app.get(UserService);
  }, 120000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query('TRUNCATE TABLE telegram_users RESTART IDENTITY CASCADE');
    }
    await app?.close();
  });

  it('boots without exposing any HTTP API (no controllers)', async () => {
    await http.get('/').expect(404);
    await http.get('/api/v1/anything').expect(404);
  });

  describe('UserService (telegram_users persistence)', () => {
    it('creates an idle user on first contact', async () => {
      const user = await users.findOrCreate(chatId, {
        firstName: 'E2E',
        username: 'e2e_user',
      });

      expect(user.id).toBeDefined();
      expect(user.telegramChatId).toBe(chatId);
      expect(user.state).toBe(UserState.IDLE);
      expect(user.firstName).toBe('E2E');

      const saved = await dataSource
        .getRepository(TelegramUserEntity)
        .findOne({ where: { telegramChatId: chatId } });
      expect(saved?.state).toBe(UserState.IDLE);
    });

    it('returns the same row on repeated contact (idempotent)', async () => {
      const first = await users.findOrCreate(chatId);
      const second = await users.findOrCreate(chatId);
      expect(second.id).toBe(first.id);

      const count = await dataSource
        .getRepository(TelegramUserEntity)
        .count({ where: { telegramChatId: chatId } });
      expect(count).toBe(1);
    });

    it('updates the conversation state', async () => {
      await users.updateState(chatId, UserState.WAITING_FOR_OTP);

      const saved = await dataSource
        .getRepository(TelegramUserEntity)
        .findOne({ where: { telegramChatId: chatId } });
      expect(saved?.state).toBe(UserState.WAITING_FOR_OTP);
      expect(saved?.lastActivityAt).toBeDefined();
    });

    it('stores the phone number', async () => {
      await users.setPhone(chatId, '09120000001');
      const saved = await dataSource
        .getRepository(TelegramUserEntity)
        .findOne({ where: { telegramChatId: chatId } });
      expect(saved?.phone).toBe('09120000001');
    });

    it('authenticates the user against the goldex backend', async () => {
      await users.authenticate(chatId, goldexUserId, accessToken, refreshToken, 0);

      const saved = await dataSource
        .getRepository(TelegramUserEntity)
        .findOne({ where: { telegramChatId: chatId } });
      expect(saved?.state).toBe(UserState.AUTHENTICATED);
      expect(saved?.goldexUserId).toBe(goldexUserId);
      expect(saved?.accessToken).toBe(accessToken);
      expect(saved?.refreshToken).toBe(refreshToken);

      const authenticated = await users.findAllAuthenticated();
      expect(authenticated.map((u) => u.telegramChatId)).toContain(chatId);
    });

    it('finds users by their goldex user id', async () => {
      const found = await users.findByGoldexUserId(goldexUserId);
      expect(found?.telegramChatId).toBe(chatId);
    });

    it('merges metadata', async () => {
      await users.updateMetadata(chatId, { source: 'e2e' });
      await users.updateMetadata(chatId, { attempt: 2 });

      const saved = await dataSource
        .getRepository(TelegramUserEntity)
        .findOne({ where: { telegramChatId: chatId } });
      expect(saved?.metadata).toEqual({ source: 'e2e', attempt: 2 });
    });

    it('logs the user out and resets the session', async () => {
      await users.logout(chatId);

      const saved = await dataSource
        .getRepository(TelegramUserEntity)
        .findOne({ where: { telegramChatId: chatId } });
      expect(saved?.state).toBe(UserState.IDLE);
      expect(saved?.goldexUserId).toBeNull();
      expect(saved?.accessToken).toBeNull();
      expect(saved?.refreshToken).toBeNull();
      expect(saved?.phone).toBeNull();

      const authenticated = await users.findAllAuthenticated();
      expect(authenticated.map((u) => u.telegramChatId)).not.toContain(chatId);
    });
  });
});
