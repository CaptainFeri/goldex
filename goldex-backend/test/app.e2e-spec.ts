import { INestApplication, ValidationPipe, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { RedisService } from '../src/redis/redis.service';
import { UserEntity } from '../src/user/entity/user.entity';
import { UserRoleEnum } from '../src/shared/enum/user.role.enum';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

describe('goldex-backend (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let dataSource: DataSource;
  let smsMock: {
    sendSMS: jest.Mock;
    sendOTP: jest.Mock;
    getProviderName: jest.Mock;
  };

  const phone = '09120000001';
  const password = 'e2e-password';
  const api = '/api/v1';

  let accessToken: string;
  let refreshToken: string;

  beforeAll(async () => {
    smsMock = {
      sendSMS: jest.fn().mockResolvedValue({ success: true }),
      sendOTP: jest.fn().mockResolvedValue({ success: true }),
      getProviderName: jest.fn().mockReturnValue('e2e-mock'),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('SMS_PROVIDER')
      .useValue(smsMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    app.enableVersioning({
      type: VersioningType.URI,
      prefix: 'v',
      defaultVersion: '1',
    });
    await app.init();

    http = request(app.getHttpServer());
    dataSource = app.get(DataSource);
  }, 180000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query('TRUNCATE TABLE "user" RESTART IDENTITY CASCADE');
      try {
        const redis = app.get(RedisService).getClient();
        const keys = await redis.keys('otp:*');
        for (const key of keys) await redis.del(key);
      } catch {
        // Redis cleanup is best-effort
      }
    }
    await app?.close();
  });

  describe('public endpoints', () => {
    it('serves the country list without authentication', async () => {
      const res = await http
        .get(`${api}/base-info/countries?pageNumber=1&pageSize=10`)
        .expect(200);
      expect(res.body).toHaveProperty('data');
      expect(Array.isArray(res.body.data.countryList)).toBe(true);
    });

    it('serves the language list without authentication', async () => {
      const res = await http
        .get(`${api}/base-info/languages?pageNumber=1&pageSize=10`)
        .expect(200);
      expect(Array.isArray(res.body.data.languageList)).toBe(true);
    });
  });

  describe('registration via OTP (SMS provider mocked)', () => {
    it('rejects an invalid phone number', async () => {
      const res = await http
        .post(`${api}/auth/send-otp`)
        .send({ phone: '12345' })
        .expect(400);
      expect(res.body.message).toBeDefined();
      expect(smsMock.sendOTP).not.toHaveBeenCalled();
    });

    it('sends an OTP for a brand-new phone number', async () => {
      const res = await http
        .post(`${api}/auth/send-otp`)
        .send({ phone })
        .expect(201);
      expect(res.body.data.message).toContain('OTP sent');
      expect(smsMock.sendOTP).toHaveBeenCalledTimes(1);
    });

    it('rejects a duplicate OTP request before the first one expires', async () => {
      const res = await http
        .post(`${api}/auth/send-otp`)
        .send({ phone })
        .expect(400);
      expect(res.body.message).toBe('OTP.ALREADY_SENT');
    });

    it('verifies the OTP and returns a temporary registration token', async () => {
      const res = await http
        .post(`${api}/auth/verify-otp`)
        .send({ phone, otp: '12345' })
        .expect(201);
      expect(res.body.data.requiresRegistration).toBe(true);
      expect(res.body.data.phone).toBe(phone);
      expect(res.body.data.userId).toBeDefined();
      expect(res.body.data.temporaryToken).toBeDefined();
    });

    it('rejects an invalid OTP code', async () => {
      await http.post(`${api}/auth/send-otp`).send({ phone: '09120000002' });
      const res = await http
        .post(`${api}/auth/verify-otp`)
        .send({ phone: '09120000002', otp: '99999' })
        .expect(400);
      expect(res.body.message).toBe('OTP.INVALID');
    });

    it('completes registration and mints real access/refresh tokens', async () => {
      // The first verify consumed the OTP; request a fresh one for the same phone.
      await http.post(`${api}/auth/send-otp`).send({ phone }).expect(201);
      const verify = await http
        .post(`${api}/auth/verify-otp`)
        .send({ phone, otp: '12345' })
        .expect(201);
      const temporaryToken = verify.body.data.temporaryToken;

      const res = await http
        .post(`${api}/auth/complete-registration`)
        .set('Authorization', `Bearer ${temporaryToken}`)
        .send({ userId: verify.body.data.userId, firstName: 'E2E', lastName: 'User', password, email: 'e2e@example.com' })
        .expect(201);

      expect(res.body.data.access_token).toBeDefined();
      expect(res.body.data.refresh_token).toBeDefined();
      expect(res.body.data.user.phone).toBe(phone);
      accessToken = res.body.data.access_token;
      refreshToken = res.body.data.refresh_token;

      const saved = await dataSource
        .getRepository(UserEntity)
        .findOne({ where: { phone } });
      expect(saved?.role).toBe(UserRoleEnum.CUSTOMER);
      expect(saved?.registeredAt).toBeDefined();
      expect(saved?.email).toBe('e2e@example.com');
    });
  });

  describe('password login', () => {
    it('rejects a wrong password', async () => {
      const res = await http
        .post(`${api}/auth/login`)
        .set('User-Agent', UA)
        .send({ phone, password: 'wrong-password' })
        .expect(400);
      expect(res.body.message).toBe('PASSWORD.INVALID');
    });

    it('logs in with the correct password', async () => {
      const res = await http
        .post(`${api}/auth/login`)
        .set('User-Agent', UA)
        .send({ phone, password })
        .expect(201);
      expect(res.body.data.access_token).toBeDefined();
      expect(res.body.data.refresh_token).toBeDefined();
      expect(res.body.data.currentDevice).toBeDefined();
      accessToken = res.body.data.access_token;
      refreshToken = res.body.data.refresh_token;
    });

    it('refreshes the access token', async () => {
      const res = await http
        .post(`${api}/auth/refresh`)
        .set('User-Agent', UA)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ refreshToken })
        .expect(201);
      expect(res.body.data.access_token).toBeDefined();
      expect(res.body.data.refresh_token).toBeDefined();
      accessToken = res.body.data.access_token;
      refreshToken = res.body.data.refresh_token;
    });
  });

  describe('guarded endpoints', () => {
    it('rejects requests without a bearer token', async () => {
      const res = await http.get(`${api}/market/pairs`).expect(401);
      expect(res.body.message).toBe('FORBIDDEN');
    });

    it('returns the market pairs for an authenticated user', async () => {
      const res = await http
        .get(`${api}/market/pairs`)
        .set('User-Agent', UA)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data).toBeDefined();
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns the effective market access for an authenticated user', async () => {
      const res = await http
        .get(`${api}/market/access`)
        .set('User-Agent', UA)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      expect(res.body.data.marketTypes).toBeDefined();
      expect(Array.isArray(res.body.data.marketTypes)).toBe(true);
    });

    it('answers the authenticated HEAD probe', async () => {
      await http
        .head(`${api}/auth/auth`)
        .set('User-Agent', UA)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
    });
  });
});
