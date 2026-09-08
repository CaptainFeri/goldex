import { ProviderAccountService } from './provider-account.service';
import { ProviderDealEntity } from './entity/provider-deal.entity';
import { MessagePatterns } from '../rabbitmq/rabbitmq.module';
import { DealStatus, ProviderCategory } from './types/enums';

type Published = { pattern: string; data: any };

function deal(over: Partial<ProviderDealEntity>): ProviderDealEntity {
  return {
    providerKey: 'mock-talaab-a',
    providerCategory: ProviderCategory.TALAAB,
    itemId: 101,
    itemName: 'طلای آب‌شده',
    gramVolume: 5,
    customerGramPrice: 100_000_000,
    dealType: 0,
    dealTypeStr: 'خرید',
    dealStatus: DealStatus.DONE,
    orderDate: new Date('2026-09-08T12:36:00Z'),
    ...over,
  } as ProviderDealEntity;
}

function buildService(deals: ProviderDealEntity[]) {
  const published: Published[] = [];
  const dealRepo = { find: jest.fn().mockResolvedValue(deals) };
  const rabbit = {
    publish: jest.fn((pattern: string, data: any) => {
      published.push({ pattern, data });
      return Promise.resolve();
    }),
  };
  const service = new ProviderAccountService(
    {} as any,
    dealRepo as any,
    {} as any,
    {} as any,
    { log: jest.fn(), error: jest.fn() } as any,
    rabbit as any,
  );
  return { service, published, dealRepo };
}

describe('ProviderAccountService.publishDealBalance', () => {
  it('sums only the deals the provider has settled', async () => {
    const { service, published } = buildService([
      deal({ orderId: '1002' }),
      deal({ orderId: '1003' }),
      deal({ orderId: '1001', dealStatus: DealStatus.CANCELLED }),
      deal({ orderId: '1004', dealStatus: DealStatus.PENDING }),
    ]);

    await service.publishDealBalance('mock-talaab-a');

    expect(published).toHaveLength(1);
    expect(published[0].pattern).toBe(MessagePatterns.PROVIDER_DEALS_UPDATED);
    const agg = published[0].data.doneDeals;
    expect(agg.dealCount).toBe(2);
    expect(agg.totalVolume).toBe(10);
    expect(agg.totalValue).toBe(1_000_000_000);
    expect(agg.buyVolume).toBe(10);
    expect(agg.sellVolume).toBe(0);
    expect(agg.netVolume).toBe(10);
    expect(agg.netValue).toBe(-1_000_000_000);
  });

  it('publishes a zeroed aggregate for an item whose deals were all refused', async () => {
    const { service, published } = buildService([
      deal({ orderId: '1001', dealStatus: DealStatus.CANCELLED }),
      deal({ orderId: '1004', dealStatus: DealStatus.PENDING }),
    ]);

    await service.publishDealBalance('mock-talaab-a');

    expect(published).toHaveLength(1);
    const agg = published[0].data.doneDeals;
    expect(agg.dealCount).toBe(0);
    expect(agg.totalVolume).toBe(0);
    expect(agg.totalValue).toBe(0);
    expect(agg.netVolume).toBe(0);
    expect(agg.netValue).toBe(0);
    expect(agg.lastDealAt).toBeNull();
  });

  it('keeps a platform sell on the sell side and aggregates per item', async () => {
    const { service, published } = buildService([
      deal({ orderId: '1002', dealType: 1, dealTypeStr: 'فروش', gramVolume: 7 }),
      deal({ orderId: 'txn-9', itemId: 102, gramVolume: 2 }),
    ]);

    await service.publishDealBalance('mock-talaab-a');

    expect(published).toHaveLength(2);
    const byItem = new Map(published.map((p) => [p.data.itemId, p.data.doneDeals]));
    expect(byItem.get(101).sellVolume).toBe(7);
    expect(byItem.get(101).netVolume).toBe(-7);
    expect(byItem.get(102).buyVolume).toBe(2);
    expect(byItem.get(102).netVolume).toBe(2);
  });
});
