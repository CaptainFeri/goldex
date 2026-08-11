import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('goldex-pricing-engine (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let dataSource: DataSource;

  const seed = Date.now().toString(36);
  const mockPort = process.env.MOCK_PORT || '5010';

  async function waitForProviderConnected(providerKey: string, timeoutMs = 25000): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      try {
        const res = await http.get(`/providers/${providerKey}/status`);
        if (res.status === 200 && res.body.data.connected === true) return true;
      } catch {
        /* keep polling */
      }
      if (Date.now() > deadline) return false;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    http = request(app.getHttpServer());
    dataSource = app.get(DataSource);
  }, 120000);

  afterAll(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.query("DELETE FROM providers WHERE key LIKE 'e2e-%'");
    }
    await app?.close();
  });

  describe('GET /providers', () => {
    it('returns all seeded providers', async () => {
      const res = await http.get('/providers').expect(200);
      expect(Array.isArray(res.body)).toBe(true);
      const keys = res.body.map((p: { key: string }) => p.key);
      expect(keys).toContain('mock-zaryar-a');
      expect(keys).toContain('mock-zaryar-b');
      expect(keys).toContain('mock-talaab-a');
      expect(keys).toContain('mirrokni');
    });

    it('seeded mock providers are active in DB', async () => {
      const res = await http.get('/providers');
      const mock = res.body.find((p: { key: string }) => p.key === 'mock-zaryar-a');
      expect(mock.active).toBe(true);
    });
  });

  describe('GET /providers/:id', () => {
    it('returns a single provider by id', async () => {
      const list = await http.get('/providers');
      const providerId = list.body[0].id;
      const res = await http.get(`/providers/${providerId}`).expect(200);
      expect(res.body.id).toBe(providerId);
    });

    it('returns 404 for an unknown id', async () => {
      const res = await http
        .get('/providers/00000000-0000-4000-8000-000000000000')
        .expect(404);
      expect(res.body.message).toBeDefined();
    });
  });

  describe('POST /providers', () => {
    it('rejects an empty body (validation)', async () => {
      await http.post('/providers').send({}).expect(400);
    });

    it('rejects a body missing required fields', async () => {
      await http.post('/providers').send({ key: `e2e-invalid-${seed}` }).expect(400);
    });

    it('creates an inactive provider', async () => {
      const res = await http
        .post('/providers')
        .send({
          key: `e2e-zaryar-${seed}`,
          category: 'zaryar',
          baseUrl: `http://localhost:${mockPort}/zaryar/e2e-${seed}`,
          sendOtpUrl: `http://localhost:${mockPort}/zaryar/e2e-${seed}/api/User/SendConfirmCode`,
          verifyCodeUrl: `http://localhost:${mockPort}/zaryar/e2e-${seed}/api/User/VerifyCode`,
          phone: '09120000000',
          persianName: 'E2E Provider',
        })
        .expect(201);

      expect(res.body.key).toBe(`e2e-zaryar-${seed}`);
      expect(res.body.active).toBe(false);
      expect(res.body.id).toBeDefined();
    });
  });

  describe('PATCH /providers/:id', () => {
    let providerId: string;

    beforeAll(async () => {
      const list = await http.get('/providers');
      const p = list.body.find((x: { key: string }) => x.key === `e2e-zaryar-${seed}`);
      providerId = p ? p.id : list.body[0].id;
    });

    it('updates provider fields', async () => {
      const res = await http
        .patch(`/providers/${providerId}`)
        .send({ persianName: 'E2E Updated' })
        .expect(200);
      expect(res.body.persianName).toBe('E2E Updated');
    });

    it('rejects invalid update payload', async () => {
      await http.patch(`/providers/${providerId}`).send({ key: '' }).expect(400);
    });
  });

  describe('OTP activation flow (against mock upstream)', () => {
    let providerId: string;

    beforeAll(async () => {
      const list = await http.get('/providers');
      const p = list.body.find((x: { key: string }) => x.key === `e2e-zaryar-${seed}`);
      providerId = p.id;
    });

    it('rejects send-otp without a phone', async () => {
      await http.post(`/providers/${providerId}/send-otp`).send({}).expect(400);
    });

    it('rejects send-otp on an already-active provider', async () => {
      const list = await http.get('/providers');
      const active = list.body.find((x: { key: string }) => x.key === 'mock-zaryar-a');
      const res = await http
        .post(`/providers/${active.id}/send-otp`)
        .send({ phone: '09120000000' })
        .expect(400);
      expect(res.body.message).toMatch(/already active/i);
    });

    it('sends OTP for the new inactive provider', async () => {
      const res = await http
        .post(`/providers/${providerId}/send-otp`)
        .send({ phone: '09120000000' })
        .expect(201);
      expect(res.body.message).toContain('OTP sent');
    });

    it('rejects verify-otp with malformed otp', async () => {
      await http
        .post(`/providers/${providerId}/verify-otp`)
        .send({ otp: 'abc' })
        .expect(400);
    });

    it('verifies OTP and activates the provider', async () => {
      const res = await http
        .post(`/providers/${providerId}/verify-otp`)
        .send({ otp: '12345' })
        .expect(201);
      expect(res.body.active).toBe(true);
      expect(res.body.auth?.token).toBeDefined();
    });
  });

  describe('toggle-active', () => {
    let providerId: string;

    beforeAll(async () => {
      const list = await http.get('/providers');
      const p = list.body.find((x: { key: string }) => x.key === `e2e-zaryar-${seed}`);
      providerId = p.id;
    });

    it('deactivates an active provider', async () => {
      const res = await http.post(`/providers/${providerId}/toggle-active`).expect(201);
      expect(res.body.active).toBe(false);
    });

    it('reactivates it', async () => {
      const res = await http.post(`/providers/${providerId}/toggle-active`).expect(201);
      expect(res.body.active).toBe(true);
    });
  });

  describe('runtime endpoints (mock upstream connected)', () => {
    beforeAll(async () => {
      const ok = await waitForProviderConnected('mock-zaryar-a');
      expect(ok).toBe(true);
    }, 35000);

    it('reports health for running providers', async () => {
      const res = await http.get('/providers/health').expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns current prices for a connected provider', async () => {
      const res = await http.get('/providers/mock-zaryar-a/prices').expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns provider status', async () => {
      const res = await http.get('/providers/mock-zaryar-a/status').expect(200);
      expect(res.body.data.key).toBe('mock-zaryar-a');
      expect(res.body.data.connected).toBe(true);
    });

    it('returns tracked items', async () => {
      const res = await http.get('/providers/mock-zaryar-a/tracked-items').expect(200);
      expect(res.body.data.count).toBeGreaterThan(0);
    });

    it('returns items metadata', async () => {
      const res = await http.get('/providers/mock-zaryar-a/items').expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns balance (may be null)', async () => {
      await http.get('/providers/mock-zaryar-a/balance').expect(200);
    });

    it('returns orders list', async () => {
      const res = await http.get('/providers/mock-zaryar-a/orders?limit=5').expect(200);
      expect(res.body.data).toBeDefined();
    });

    it('refreshes a provider connection', async () => {
      const res = await http.post('/providers/mock-zaryar-a/refresh').expect(201);
      expect(res.body.data.success).toBe(true);
    });

    it('returns all-prices', async () => {
      await http.get('/providers/all-prices').expect(200);
    });

    it('returns integrated prices', async () => {
      await http.get('/providers/integrated-prices').expect(200);
    });

    it('returns market map', async () => {
      await http.get('/providers/market-map').expect(200);
    });

    it('returns consolidated market with groups', async () => {
      const res = await http.get('/providers/consolidated-market').expect(200);
      expect(res.body.data).toHaveProperty('coins');
      expect(res.body.data).toHaveProperty('molten');
      expect(res.body.data).toHaveProperty('silver');
    });

    it('returns best prices', async () => {
      await http.get('/providers/best-prices').expect(200);
    });

    it('returns account summary', async () => {
      await http.get('/providers/account/summary').expect(200);
    });

    it('returns 404 for unknown provider status', async () => {
      await http.get('/providers/no-such-provider/status').expect(404);
    });
  });

  describe('POST /providers/:key/place-order', () => {
    it('places an order against the mock upstream', async () => {
      const res = await http
        .post('/providers/mock-zaryar-a/place-order')
        .send({ itemId: 101, dealType: 0, count: 1 })
        .expect(201);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('arbitrage endpoints', () => {
    it('returns current signals', async () => {
      const res = await http.get('/arbitrage').expect(200);
      expect(res.body.data).toHaveProperty('signals');
    });

    it('returns stats', async () => {
      await http.get('/arbitrage/stats').expect(200);
    });

    it('returns config', async () => {
      const res = await http.get('/arbitrage/config').expect(200);
      expect(typeof res.body.data.minProfitToman).toBe('number');
    });

    it('updates config', async () => {
      const res = await http
        .patch('/arbitrage/config')
        .send({ minProfitToman: 200000 })
        .expect(200);
      expect(res.body.data.minProfitToman).toBe(200000);
    });

    it('returns history', async () => {
      const res = await http.get('/arbitrage/history?limit=5').expect(200);
      expect(Array.isArray(res.body.data)).toBe(true);
    });

    it('returns signal for an item', async () => {
      await http.get('/arbitrage/item/101').expect(200);
    });

    it('forces a scan', async () => {
      await http.post('/arbitrage/scan').expect(201);
    });
  });
});
