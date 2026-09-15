import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { ProviderController } from './provider.controller';
import { ProviderDeviceController } from './device/provider-device.controller';
import { ProviderService } from './provider.service';
import { ProviderAutoLoginService } from './provider-auto-login.service';
import { LoginDeviceService } from './device/login-device.service';
import { LoginAttemptService } from './login-attempt.service';
import { DeviceAuthGuard } from './device/device-auth.guard';
import { ProviderEntity } from './entity/provider.entity';
import { ProviderLoginDeviceEntity } from './entity/provider-login-device.entity';
import { ProviderLoginAttemptEntity } from './entity/provider-login-attempt.entity';
import { ProviderDealSnapshotEntity } from '../financial/entity/provider-deal-snapshot.entity';
import { ProviderBalanceSnapshotEntity } from '../financial/entity/provider-balance-snapshot.entity';
import { RedisService } from '../redis/redis.service';
import { RabbitMQService } from '../rabbitmq/rabbitmq.service';
import { PricingRedisService } from '../admin-monitoring/pricing-redis.service';
import { AdminNotificationGateway } from '../notification/admin-notification.gateway';

/**
 * The seams, over real HTTP.
 *
 * Everything below this file is unit-tested, and none of those tests can catch
 * the two things that actually broke during this work: a route declared after
 * `:id` so that "needs-login" was handed to a UUID pipe, and a guard that let
 * the wrong credential through. Both are properties of the assembled
 * application, so this assembles one — with fakes for the database, Redis and
 * the message bus, so it runs in the ordinary test suite rather than needing a
 * Postgres.
 */
describe('the auto-login routes as an application', () => {
  let app: INestApplication;
  let deviceToken: string;
  let redis: Map<string, any>;
  let providerRow: any;
  let notifications: { sendToAdmins: jest.Mock };

  /** An in-memory stand-in for one TypeORM repository. */
  const fakeRepo = (rows: any[]) => ({
    find: jest.fn(({ where, order, take }: any = {}) => {
      let out = [...rows];
      if (where?.providerKey) out = out.filter((r) => r.providerKey === where.providerKey);
      if (where?.outcome) out = out.filter((r) => r.outcome === where.outcome);
      if (order) out = out.reverse();
      return Promise.resolve(take ? out.slice(0, take) : out);
    }),
    findOne: jest.fn(({ where }: any) =>
      Promise.resolve(
        rows.find((r) => {
          if (where.id !== undefined) return r.id === where.id;
          if (where.tokenHash !== undefined) {
            return r.tokenHash === where.tokenHash && !r.revokedAt;
          }
          if (where.providerKey !== undefined) {
            return (
              r.providerKey === where.providerKey &&
              (where.outcome === undefined || r.outcome === where.outcome)
            );
          }
          return r.key === where.key;
        }) ?? null,
      ),
    ),
    create: jest.fn((data: any) => ({ ...data })),
    save: jest.fn((row: any) => {
      const existing = rows.find((r) => r.id && r.id === row.id);
      if (existing) {
        Object.assign(existing, row);
        return Promise.resolve(existing);
      }
      const saved = { ...row, id: row.id ?? `row-${rows.length + 1}`, createAt: new Date() };
      rows.push(saved);
      return Promise.resolve(saved);
    }),
    update: jest.fn((where: any, patch: any) => {
      const row = rows.find((r) => r.id === where.id || r.key === where.key);
      if (row) Object.assign(row, patch);
      return Promise.resolve({ affected: 1 });
    }),
    count: jest.fn(() => Promise.resolve(rows.length)),
  });

  beforeEach(async () => {
    redis = new Map();
    providerRow = {
      id: '11111111-1111-4111-8111-111111111111',
      key: 'zaryar',
      category: 'zaryar',
      baseUrl: 'https://example.ir',
      phone: '09123456789',
      sendOtpUrl: 'https://example.ir/send',
      verifyCodeUrl: 'https://example.ir/verify',
      status: 'auth_expired',
      active: true,
      auth: {},
      config: {},
    };
    notifications = { sendToAdmins: jest.fn() };

    const redisFake = {
      get: (key: string) => Promise.resolve(redis.get(key) ?? null),
      setWithExpiration: (key: string, value: any) => {
        redis.set(key, value);
        return Promise.resolve('OK');
      },
      setIfAbsent: (key: string, value: any) => {
        if (redis.has(key)) return Promise.resolve(false);
        redis.set(key, value);
        return Promise.resolve(true);
      },
      incrementWithExpiry: (key: string) => {
        const next = (Number(redis.get(key)) || 0) + 1;
        redis.set(key, next);
        return Promise.resolve(next);
      },
      del: (key: string) => Promise.resolve(redis.delete(key)),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [ProviderController, ProviderDeviceController],
      providers: [
        ProviderService,
        ProviderAutoLoginService,
        LoginDeviceService,
        LoginAttemptService,
        DeviceAuthGuard,
        { provide: getRepositoryToken(ProviderEntity), useValue: fakeRepo([providerRow]) },
        { provide: getRepositoryToken(ProviderLoginDeviceEntity), useValue: fakeRepo([]) },
        { provide: getRepositoryToken(ProviderLoginAttemptEntity), useValue: fakeRepo([]) },
        { provide: getRepositoryToken(ProviderDealSnapshotEntity), useValue: fakeRepo([]) },
        { provide: getRepositoryToken(ProviderBalanceSnapshotEntity), useValue: fakeRepo([]) },
        { provide: RedisService, useValue: redisFake },
        {
          provide: RabbitMQService,
          useValue: {
            publishCommand: jest.fn(() => Promise.resolve()),
            // Everything the engine is asked to do succeeds, so what these
            // tests exercise is the routing and the rules, not the provider.
            requestCommand: jest.fn(() => Promise.resolve({ ok: true, data: { active: true } })),
          },
        },
        {
          provide: PricingRedisService,
          useValue: {
            getProxyConfigured: jest.fn(() => Promise.resolve(true)),
            getRegistry: jest.fn(() => Promise.resolve([])),
            getProviders: jest.fn(() => Promise.resolve([])),
          },
        },
        { provide: AdminNotificationGateway, useValue: notifications },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    deviceToken = (await moduleRef.get(LoginDeviceService).enroll('گوشی میز')).token;
  });

  afterEach(async () => {
    await app.close();
  });

  const asDevice = () => ({ Authorization: `Bearer ${deviceToken}` });

  /**
   * The bug class that bit twice: a literal path declared after `:id` is never
   * reached, because `:id` matches it first and hands it to a UUID pipe.
   */
  describe('literal routes are not swallowed by the :id route', () => {
    it.each(['needs-login', 'awaiting-otp'])('device route /%s resolves', async (path) => {
      const res = await request(app.getHttpServer())
        .get(`/device/providers/${path}`)
        .set(asDevice());
      expect(res.status).toBe(200);
    });

    it.each(['proxy-status', 'awaiting-otp', 'needs-login', 'login-attempts'])(
      'admin route /%s resolves rather than 400-ing on a UUID pipe',
      async (path) => {
        const res = await request(app.getHttpServer()).get(`/admin/providers/${path}`);
        // The admin guard refuses because no middleware set `request.admin`.
        // What matters is that it is 401 and not 400: a 400 would mean the
        // path reached ParseUUIDPipe, which is the bug.
        expect(res.status).toBe(401);
      },
    );
  });

  describe('the device credential opens the device routes and nothing else', () => {
    it('admits a valid credential', async () => {
      await request(app.getHttpServer())
        .get('/device/providers/needs-login')
        .set(asDevice())
        .expect(200);
    });

    it.each([
      ['no credential at all', undefined],
      ['a token nobody was issued', 'Bearer gxd_not-real'],
      ['something that is not ours', 'Bearer eyJhbGciOiJIUzI1NiJ9.x.y'],
    ])('refuses %s', async (_label, header) => {
      const req = request(app.getHttpServer()).get('/device/providers/needs-login');
      if (header) req.set('Authorization', header);
      await req.expect(401);
    });

    /**
     * The point of the whole credential. If a device token opened the admin
     * API there would be no smaller door, only a second key to the same one.
     */
    it('does not open the admin API', async () => {
      await request(app.getHttpServer())
        .post('/admin/providers')
        .set(asDevice())
        .send({ key: 'mine', category: 'zaryar', baseUrl: 'https://x.ir' })
        .expect(401);
    });

    it('stops working the moment it is revoked', async () => {
      const devices = app.get(LoginDeviceService);
      const [enrolled] = await devices.list();
      await devices.revoke(enrolled.id);

      await request(app.getHttpServer())
        .get('/device/providers/needs-login')
        .set(asDevice())
        .expect(401);
    });
  });

  describe('a device may only act on a provider it has claimed', () => {
    const id = '11111111-1111-4111-8111-111111111111';

    it('refuses to ask for a code without a claim', async () => {
      const res = await request(app.getHttpServer())
        .post(`/device/providers/${id}/send-otp`)
        .set(asDevice())
        .send({ phone: '09123456789' });

      expect(res.status).toBe(409);
      expect(JSON.stringify(res.body)).toMatch(/claim it first/);
    });

    it('refuses to verify without a claim', async () => {
      await request(app.getHttpServer())
        .post(`/device/providers/${id}/verify-otp`)
        .set(asDevice())
        .send({ otp: '48213' })
        .expect(409);
    });

    it('carries the whole exchange through once claimed', async () => {
      await request(app.getHttpServer())
        .post(`/device/providers/${id}/login-lease`)
        .set(asDevice())
        .expect(201);

      await request(app.getHttpServer())
        .post(`/device/providers/${id}/send-otp`)
        .set(asDevice())
        .send({ phone: '09123456789' })
        .expect(201);

      await request(app.getHttpServer())
        .post(`/device/providers/${id}/verify-otp`)
        .set(asDevice())
        .send({ otp: '48213' })
        .expect(201);

      // The claim is released by the successful verify, and the run of
      // failures it was counted against is cleared with it.
      expect(redis.get('provider:autologin:lease:zaryar')).toBeUndefined();
      expect(redis.get('provider:autologin:attempts:zaryar')).toBeUndefined();
    });

    it('will not let a second device claim what the first is holding', async () => {
      await request(app.getHttpServer())
        .post(`/device/providers/${id}/login-lease`)
        .set(asDevice())
        .expect(201);

      const devices = app.get(LoginDeviceService);
      const other = await devices.enroll('گوشی دوم');

      await request(app.getHttpServer())
        .post(`/device/providers/${id}/login-lease`)
        .set({ Authorization: `Bearer ${other.token}` })
        .expect(409);
    });
  });

  describe('validation at the edge', () => {
    const id = '11111111-1111-4111-8111-111111111111';

    it('refuses a release with an outcome that is neither', async () => {
      await request(app.getHttpServer())
        .post(`/device/providers/${id}/login-lease/release`)
        .set(asDevice())
        .send({ outcome: 'maybe' })
        .expect(400);
    });

    it('refuses a relay with no code in it', async () => {
      await request(app.getHttpServer())
        .post('/device/providers/relay-otp')
        .set(asDevice())
        .send({ providerKey: 'zaryar' })
        .expect(400);
    });

    it('refuses a provider id that is not a uuid', async () => {
      await request(app.getHttpServer())
        .post('/device/providers/not-a-uuid/login-lease')
        .set(asDevice())
        .expect(400);
    });
  });
});
