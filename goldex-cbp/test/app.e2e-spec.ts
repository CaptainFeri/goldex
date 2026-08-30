import { INestApplication, VersioningType } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DeepPartial, DataSource } from 'typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PaymentEntity } from '../src/payments/entity/payment.entity';
import { PaymentCategoryEnum } from '../src/payments/enum/payment-category.enum';
import { PaymentOperationEnum } from '../src/payments/enum/payment-operation.enum';
import { PaymentStatusEnum } from '../src/payments/enum/payment-status.enum';
import { KainoGatewayService } from '../src/payments/gateways/informal/kaino-gateway.service';
import { PaymentSymbolEntity } from '../src/symbols/entity/payment-symbol.entity';
import { SymbolTypeEnum } from '../src/symbols/enum/symbol.type.enum';

describe('CBP e2e - Kaino callback (POST /api/v1/payments/callbacks/kaino)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let kainoMock: {
    metadata: Record<string, unknown>;
    verify: jest.Mock;
    deposit: jest.Mock;
    withdraw: jest.Mock;
  };

  const URL = '/api/v1/payments/callbacks/kaino';

  beforeAll(async () => {
    kainoMock = {
      metadata: {
        code: 'kaino-informal',
        name: 'Kaino Wallet',
        category: 'fiat',
        kind: 'informal',
      },
      verify: jest.fn(),
      deposit: jest.fn(),
      withdraw: jest.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(KainoGatewayService)
      .useValue(kainoMock)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      prefix: 'v',
      defaultVersion: '1',
    });
    await app.init();

    dataSource = app.get(DataSource);
  });

  afterAll(async () => {
    await dataSource.query(
      'TRUNCATE TABLE payment, payment_symbol RESTART IDENTITY CASCADE',
    );
    await app.close();
  });

  async function seedPayment(
    overrides: DeepPartial<PaymentEntity> = {},
  ): Promise<PaymentEntity> {
    const symRepo = dataSource.getRepository(PaymentSymbolEntity);
    let symbol = await symRepo.findOne({ where: { slug: 'E2E-IRR' } });
    if (!symbol) {
      symbol = await symRepo.save(
        symRepo.create({
          name: 'E2E Toman',
          slug: 'E2E-IRR',
          symbolType: SymbolTypeEnum.RIAL,
          hasPaymentGateway: true,
          isActive: true,
        }),
      );
    }
    const payRepo = dataSource.getRepository(PaymentEntity);
    const data: DeepPartial<PaymentEntity> = {
      userId: 'e2e-user',
      symbolId: symbol.id,
      operation: PaymentOperationEnum.DEPOSIT,
      category: PaymentCategoryEnum.FIAT,
      type: 'kaino',
      amount: 1000000,
      status: PaymentStatusEnum.PENDING,
      identifier: 'DP-E2E-001',
      gatewayCode: 'kaino-informal',
      metadata: { foo: 'bar' },
      ...overrides,
    };
    return payRepo.save(payRepo.create(data));
  }

  async function findPayment(identifier: string): Promise<PaymentEntity | null> {
    return dataSource
      .getRepository(PaymentEntity)
      .findOne({ where: { identifier } });
  }

  beforeEach(async () => {
    kainoMock.verify.mockReset();
    await dataSource.query('TRUNCATE TABLE payment RESTART IDENTITY CASCADE');
  });

  describe('happy path', () => {
    it('verifies a pending payment and marks it succeeded', async () => {
      await seedPayment();

      kainoMock.verify.mockResolvedValue({
        success: true,
        raw: { state: 'SUCCESS' },
      });

      const res = await request(app.getHttpServer())
        .post(`${URL}?reference=DP-E2E-001`)
        .send({ ipgReference: 'IPG-0001', channel: 'kaino' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.alreadyVerified).toBeUndefined();
      expect(res.body.payment.status).toBe('succeeded');
      expect(res.body.payment.identifier).toBe('DP-E2E-001');
      expect(res.body.payment.ipgReference).toBe('IPG-0001');

      expect(kainoMock.verify).toHaveBeenCalledWith(
        expect.objectContaining({ identifier: 'DP-E2E-001' }),
        expect.objectContaining({ ipgReference: 'IPG-0001' }),
      );

      const saved = await findPayment('DP-E2E-001');
      expect(saved?.status).toBe(PaymentStatusEnum.SUCCEEDED);
      expect(saved?.completedAt).toBeDefined();
      expect(saved?.ipgReference).toBe('IPG-0001');
      expect(saved?.rawResponse).toEqual({ state: 'SUCCESS' });
    });

    it('returns alreadyVerified on a repeated callback without re-verifying', async () => {
      await seedPayment();
      kainoMock.verify.mockResolvedValue({ success: true, raw: {} });

      await request(app.getHttpServer())
        .post(`${URL}?reference=DP-E2E-001`)
        .send({});

      const res = await request(app.getHttpServer())
        .post(`${URL}?reference=DP-E2E-001`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body).toEqual({ success: true, alreadyVerified: true });
      expect(kainoMock.verify).toHaveBeenCalledTimes(1);
    });

    it('falls back to body.identifier when no reference query is given', async () => {
      await seedPayment({ identifier: 'DP-E2E-002' });
      kainoMock.verify.mockResolvedValue({ success: true, raw: {} });

      const res = await request(app.getHttpServer())
        .post(URL)
        .send({ identifier: 'DP-E2E-002', ipgReference: 'IPG-0002' });

      expect(res.status).toBe(201);
      expect(res.body.payment.identifier).toBe('DP-E2E-002');
      expect(res.body.payment.ipgReference).toBe('IPG-0002');
      expect(kainoMock.verify).toHaveBeenCalledTimes(1);
    });
  });

  describe('failure paths', () => {
    it('returns 404 for an unknown reference', async () => {
      const res = await request(app.getHttpServer())
        .post(`${URL}?reference=DP-NOPE`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.message).toBe('Payment not found for reference');
    });

    it('returns 404 when the gateway code is not registered', async () => {
      await seedPayment({ gatewayCode: 'no-such-gateway' });

      const res = await request(app.getHttpServer())
        .post(`${URL}?reference=DP-E2E-001`)
        .send({});

      expect(res.status).toBe(404);
      expect(res.body.message).toContain('is not registered');
    });

    it('returns 400 when the gateway does not support verification', async () => {
      await seedPayment();
      const originalVerify = kainoMock.verify;
      (kainoMock as any).verify = undefined;

      const res = await request(app.getHttpServer())
        .post(`${URL}?reference=DP-E2E-001`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('does not support verification');

      (kainoMock as any).verify = originalVerify;
    });

    it('keeps the payment pending when verification fails', async () => {
      await seedPayment();
      kainoMock.verify.mockResolvedValue({
        success: false,
        raw: { state: 'FAILED', code: 'X' },
      });

      const res = await request(app.getHttpServer())
        .post(`${URL}?reference=DP-E2E-001`)
        .send({});

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        success: false,
        raw: { state: 'FAILED', code: 'X' },
      });

      const saved = await findPayment('DP-E2E-001');
      expect(saved?.status).toBe(PaymentStatusEnum.PENDING);
      expect(saved?.completedAt).toBeNull();
    });
  });
});
