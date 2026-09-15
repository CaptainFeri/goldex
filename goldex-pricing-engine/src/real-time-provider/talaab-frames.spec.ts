import { TalaAbWebSocketProvider } from './providers/talaab-websocket.provider';
import { MessagePatterns } from '../rabbitmq/rabbitmq.module';

/**
 * What the engine does with the frames Talaab actually sends.
 *
 * The parser decides what a frame says; this decides what happens next — that
 * a refused subscription raises a login instead of passing unnoticed, and that
 * a push whose ids match nothing says so rather than storing nothing quietly.
 * Both were silent failures in production: a shop reported open and
 * subscribed, and its price list stayed empty.
 */
describe('Talaab frame handling', () => {
  const build = (tracked: number[] = [3]) => {
    const redis = {
      setCurrentPrice: jest.fn(() => Promise.resolve()),
      addPriceToHistory: jest.fn(() => Promise.resolve()),
      publishPriceUpdate: jest.fn(() => Promise.resolve()),
    };
    const publish = jest.fn(() => Promise.resolve());
    const formatter = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      printConnectionEvent: jest.fn(),
    };
    const metadata = { enrichPriceData: jest.fn((price: unknown) => Promise.resolve(price)) };
    const provider = new TalaAbWebSocketProvider(
      {} as any,
      redis as any,
      metadata as any,
      formatter as any,
      { publish } as any,
    );
    void provider.init({
      key: 'afrogh',
      category: 'talaab',
      baseUrl: 'wss://example.ir/app/key',
      auth: { token: 'live' },
    });
    for (const id of tracked) (provider as any).trackedItemIds.add(id);
    const label = 'TALAAB:afrogh';
    const handle = (frame: unknown) =>
      (provider as any).handleWebSocketMessage(JSON.stringify(frame));
    return { provider, redis, publish, formatter, handle, label };
  };

  const pricingPush = (currencies: unknown[]) => ({
    event: 'new-panel',
    data: JSON.stringify({
      message: { type: 'all_systems_pricing_updated', data: { pricing: [{ currencies }] } },
    }),
  });

  it('stores the prices a push carries for tracked items', async () => {
    const { redis, handle } = build();
    handle(
      pricingPush([
        { id: 3, buy_price: '45000', sell_price: '45500', buy_status: 1, sell_status: 1 },
      ]),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(redis.setCurrentPrice).toHaveBeenCalledWith('afrogh', 3, expect.anything());
  });

  it('says so when a push matches none of the tracked ids', () => {
    const { redis, formatter, handle, label } = build([3]);
    handle(
      pricingPush([{ id: 99, buy_price: '1', sell_price: '2', buy_status: 1, sell_status: 1 }]),
    );
    expect(redis.setCurrentPrice).not.toHaveBeenCalled();
    expect(formatter.warn).toHaveBeenCalledWith(
      label,
      expect.stringContaining('none of them tracked'),
    );
  });

  it('raises a login when the server refuses the subscription', () => {
    const { publish, handle } = build();
    handle({
      event: 'pusher_internal:subscription_error',
      channel: 'afrogh',
      data: JSON.stringify({ status: 403 }),
    });
    expect(publish).toHaveBeenCalledWith(
      MessagePatterns.PROVIDER_AUTH_EXPIRED,
      expect.objectContaining({ key: 'afrogh' }),
      'afrogh',
    );
  });

  it('reports a refusal that is not about the session without raising a login', () => {
    const { publish, formatter, handle, label } = build();
    handle({
      event: 'pusher_internal:subscription_error',
      channel: 'afrogh',
      data: JSON.stringify({ status: 500 }),
    });
    expect(publish).not.toHaveBeenCalled();
    expect(formatter.error).toHaveBeenCalledWith(label, expect.stringContaining('refused'));
  });

  it('only claims the subscription once the server confirms it', () => {
    const { provider, formatter, handle, label } = build();
    expect((provider as any).subscribed).toBe(false);
    handle({ event: 'pusher_internal:subscription_succeeded', channel: 'afrogh' });
    expect((provider as any).subscribed).toBe(true);
    expect(formatter.log).toHaveBeenCalledWith(label, 'Subscription confirmed for afrogh');
  });

  it('keeps an unrecognised event in the log instead of discarding it', () => {
    const { formatter, handle, label } = build();
    handle({ event: 'shop-status-changed', data: JSON.stringify({}) });
    expect(formatter.debug).toHaveBeenCalledWith(label, 'Unhandled event: shop-status-changed');
  });
});
