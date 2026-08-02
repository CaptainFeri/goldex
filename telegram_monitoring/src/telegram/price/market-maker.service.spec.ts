import { MarketMakerService } from './market-maker.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RedisService } from '../../redis/redis.service';
import { RabbitMQPublisherService } from '../rabbitmq-publisher.service';
import { MarketOpportunity, ParsedPrice, PriceSnapshot } from './price.types';

function mockEmitter(): EventEmitter2 {
  return { emit: jest.fn() } as any;
}

function mockRedis(): RedisService {
  const client = {
    setex: jest.fn(async () => 'OK'),
    mget: jest.fn(async () => []),
    zadd: jest.fn(async () => 1),
    zrange: jest.fn(async () => []),
    on: jest.fn(),
    quit: jest.fn(),
  } as any;
  return { getClient: () => client } as any;
}

function mockRmq(): RabbitMQPublisherService {
  return { publish: jest.fn(async () => {}) } as any;
}

function parsed(price: number, ourAction: 'WE_BUY' | 'WE_SELL'): ParsedPrice {
  return {
    price,
    sideLabel: ourAction === 'WE_BUY' ? 'فروش' : 'خرید',
    ourAction,
    subType: 'normal',
    deliveryType: 'با حواله',
    quantity: 1,
    raw: '',
  };
}

function snapshot(
  price: number,
  ourAction: 'WE_BUY' | 'WE_SELL',
  messageId: number,
): PriceSnapshot {
  return {
    ...parsed(price, ourAction),
    messageId,
    date: 1000 + messageId,
    categoryKey: 'normal',
  };
}

function emitted(emitter: EventEmitter2): MarketOpportunity[] {
  return (emitter.emit as jest.Mock).mock.calls
    .filter(([event]) => event === 'market.opportunity')
    .map(([, opp]) => opp as MarketOpportunity);
}

describe('MarketMakerService', () => {
  it('emits BEST_PRICE when a new lower WE_BUY price beats the previous best bid', () => {
    const emitter = mockEmitter();
    const service = new MarketMakerService(emitter, mockRedis(), mockRmq());

    service.onPrice(parsed(74_000_000, 'WE_BUY'), snapshot(74_000_000, 'WE_BUY', 1));
    service.onPrice(parsed(73_800_000, 'WE_BUY'), snapshot(73_800_000, 'WE_BUY', 2));

    const opps = emitted(emitter);
    expect(opps).toHaveLength(1);
    expect(opps[0]).toMatchObject({
      type: 'BEST_PRICE',
      direction: 'DOWN',
      ourAction: 'WE_BUY',
      price: 73_800_000,
      previousPrice: 74_000_000,
    });
  });

  it('emits BEST_PRICE when a new higher WE_SELL price beats the previous best ask', () => {
    const emitter = mockEmitter();
    const service = new MarketMakerService(emitter, mockRedis(), mockRmq());

    service.onPrice(parsed(74_000_000, 'WE_SELL'), snapshot(74_000_000, 'WE_SELL', 1));
    service.onPrice(parsed(74_100_000, 'WE_SELL'), snapshot(74_100_000, 'WE_SELL', 2));

    const opps = emitted(emitter);
    expect(opps).toHaveLength(1);
    expect(opps[0]).toMatchObject({
      type: 'BEST_PRICE',
      direction: 'UP',
      ourAction: 'WE_SELL',
      price: 74_100_000,
      previousPrice: 74_000_000,
    });
  });

  it('does not re-emit BEST_PRICE for a repeated best price', () => {
    const emitter = mockEmitter();
    const service = new MarketMakerService(emitter, mockRedis(), mockRmq());

    service.onPrice(parsed(74_000_000, 'WE_BUY'), snapshot(74_000_000, 'WE_BUY', 1));
    service.onPrice(parsed(73_800_000, 'WE_BUY'), snapshot(73_800_000, 'WE_BUY', 2));
    service.onPrice(parsed(73_800_000, 'WE_BUY'), snapshot(73_800_000, 'WE_BUY', 3));

    expect(emitted(emitter)).toHaveLength(1);
  });

  it('does not emit BEST_PRICE for a price that is not a new best', () => {
    const emitter = mockEmitter();
    const service = new MarketMakerService(emitter, mockRedis(), mockRmq());

    service.onPrice(parsed(74_000_000, 'WE_BUY'), snapshot(74_000_000, 'WE_BUY', 1));
    service.onPrice(parsed(73_900_000, 'WE_BUY'), snapshot(73_900_000, 'WE_BUY', 2));
    service.onPrice(parsed(73_950_000, 'WE_BUY'), snapshot(73_950_000, 'WE_BUY', 3));

    expect(emitted(emitter)).toHaveLength(1);
  });

  it('emits PRICE_MOVEMENT when the price changes by at least 0.5%', () => {
    const emitter = mockEmitter();
    const service = new MarketMakerService(emitter, mockRedis(), mockRmq());

    service.onPrice(parsed(74_000_000, 'WE_SELL'), snapshot(74_000_000, 'WE_SELL', 1));
    service.onPrice(parsed(74_400_000, 'WE_SELL'), snapshot(74_400_000, 'WE_SELL', 2));

    const opps = emitted(emitter);
    expect(opps).toHaveLength(2);
    expect(opps).toContainEqual(
      expect.objectContaining({
        type: 'PRICE_MOVEMENT',
        direction: 'UP',
        ourAction: 'WE_SELL',
        changePercent: expect.any(Number),
      }),
    );
  });
});
