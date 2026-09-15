import { BaseRealtimeProvider } from './base-realtime.provider';
import { MessagePatterns } from '../rabbitmq/rabbitmq.module';

/**
 * Telling the engine that a provider needs a login, not another reconnection.
 *
 * Before this, every failure was a disconnection: the engine reconnected with
 * the same refused token every few seconds, the health check restarted it every
 * thirty, and the provider stayed down while the logs filled with attempts. The
 * point here is not the event — it is that the retrying stops, because retrying
 * a dead session cannot work and the loop hides the fact that nothing is.
 */
class TestProvider extends BaseRealtimeProvider {
  connectCalls = 0;

  async connect(): Promise<void> {
    this.connectCalls++;
  }
  disconnect(): void {}
  isConnected(): boolean {
    return false;
  }
  async getShopProfile(): Promise<any> {
    return {};
  }
  async getPrice(): Promise<any> {
    return null;
  }
  async getDealView(): Promise<any> {
    return {};
  }
  protected setupSocketListeners(): void {}
  protected async authenticate(): Promise<string> {
    return '';
  }

  // The two protected hooks under test, reached the way the providers reach
  // them: from inside a catch, and from a closed socket.
  note(error: unknown, where = 'metadata'): boolean {
    return this.noteIfAuthFailure(error, where);
  }
  dropped(): void {
    this.handleDisconnect();
  }
}

describe('a provider whose session has been refused', () => {
  const build = () => {
    const publish = jest.fn(() => Promise.resolve());
    const provider = new TestProvider(
      {} as any,
      {} as any,
      { publish } as any,
    );
    provider.setFormatter({
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      printConnectionEvent: jest.fn(),
    } as any);
    void provider.init({
      key: 'zaryar',
      category: 'zaryar',
      baseUrl: 'https://example.ir',
      auth: { token: 'expired' },
    } as any);
    return { provider, publish };
  };

  const unauthorized = { isAxiosError: true, response: { status: 401 } };

  it('says so, naming the call that was refused', () => {
    const { provider, publish } = build();
    expect(provider.note(unauthorized, 'metadata')).toBe(true);

    expect(publish).toHaveBeenCalledWith(
      MessagePatterns.PROVIDER_AUTH_EXPIRED,
      expect.objectContaining({ key: 'zaryar', reason: 'metadata answered 401' }),
      'zaryar',
    );
  });

  it('knows it is waiting on a login', () => {
    const { provider } = build();
    provider.note(unauthorized);
    expect(provider.hasExpiredSession()).toBe(true);
  });

  /**
   * Every authenticated call fails at once when a session dies — metadata,
   * prices, shop status — and an operator does not need to be told three times
   * that one provider needs one login.
   */
  it('says so once, however many calls are refused', () => {
    const { provider, publish } = build();
    provider.note(unauthorized, 'metadata');
    provider.note(unauthorized, 'prices');
    provider.note(unauthorized, 'shop status');
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it('says nothing about a failure that is not the session', () => {
    const { provider, publish } = build();
    expect(provider.note(new Error('connect ETIMEDOUT'))).toBe(false);
    expect(provider.note({ response: { status: 500 } })).toBe(false);
    expect(publish).not.toHaveBeenCalled();
    expect(provider.hasExpiredSession()).toBe(false);
  });

  describe('and the socket then closes', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('does not reconnect, because there is nothing to reconnect with', () => {
      const { provider } = build();
      provider.note(unauthorized);
      provider.dropped();

      jest.advanceTimersByTime(120_000);
      expect(provider.connectCalls).toBe(0);
    });

    it('still reconnects when the session was never the problem', () => {
      const { provider } = build();
      provider.dropped();

      jest.advanceTimersByTime(120_000);
      expect(provider.connectCalls).toBeGreaterThan(0);
    });
  });

  it('starts clean when the provider is brought up again', async () => {
    const { provider } = build();
    provider.note(unauthorized);
    await provider.init({
      key: 'zaryar',
      category: 'zaryar',
      baseUrl: 'https://example.ir',
      auth: { token: 'fresh' },
    } as any);
    expect(provider.hasExpiredSession()).toBe(false);
  });
});
