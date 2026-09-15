import { ProviderManagerService } from './provider-manage.service';
import { ProviderEntity } from './entity/provider.entity';

/**
 * What the health check does with a provider that needs a login.
 *
 * It runs every thirty seconds and restarts any active provider that is not
 * connected, which is right for a dropped connection and wrong for a refused
 * session: that restart presents the same dead token, is refused again, and
 * repeats until somebody notices — while the logs read as though recovery is
 * being attempted.
 *
 * So such a provider is parked. Not by a flag somebody has to remember to
 * clear, but by the session that was refused: when a different one is stored,
 * the provider is no longer the one that failed, and it is picked up again.
 */
describe('a provider parked waiting for a login', () => {
  const entity = (over: Partial<ProviderEntity> = {}): ProviderEntity =>
    ({
      id: 'p-1',
      key: 'zaryar',
      category: 'zaryar',
      baseUrl: 'https://example.ir',
      auth: { token: 'expired-token' },
      config: {},
      active: true,
      metadataRefreshIntervalMs: 60000,
      ...over,
    }) as ProviderEntity;

  const build = (row: ProviderEntity, expired: boolean) => {
    const fake = {
      init: jest.fn(() => Promise.resolve()),
      connect: jest.fn(() => Promise.resolve()),
      stop: jest.fn(),
      disconnect: jest.fn(),
      isConnected: () => !expired,
      hasExpiredSession: () => expired,
      getShopProfile: jest.fn(),
      getPrice: jest.fn(),
      getDealView: jest.fn(),
      onPriceUpdate: jest.fn(),
      config: {} as any,
    };

    const service = new ProviderManagerService(
      {} as any,
      {
        publishSnapshot: jest.fn(() => Promise.resolve()),
        getAllCurrentPrices: jest.fn(() => Promise.resolve([])),
      } as any,
      { getAllItemIds: jest.fn(() => Promise.resolve([])) } as any,
      { find: jest.fn(() => Promise.resolve([row])) } as any,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      { publish: jest.fn(() => Promise.resolve()) } as any,
    );

    // The only seam: which provider class is built. Everything else runs.
    jest.spyOn(service as any, 'createProvider').mockReturnValue(fake);
    return { service, fake };
  };

  it('is not started again while it holds the session that was refused', async () => {
    const row = entity();
    const { service, fake } = build(row, true);

    await service.startProvider(row);
    expect(fake.connect).toHaveBeenCalledTimes(1);

    await service.reconcileProviders();
    await service.reconcileProviders();
    expect(fake.connect).toHaveBeenCalledTimes(1);
  });

  it('is dropped rather than left registered as though it were working', async () => {
    const row = entity();
    const { service, fake } = build(row, true);

    await service.startProvider(row);

    expect(fake.stop).toHaveBeenCalled();
    expect(service.getProvider('zaryar')).toBeUndefined();
  });

  /**
   * The clearing rule. Nothing calls it: storing a new session is what makes
   * this provider a different one from the provider that failed.
   */
  it('is picked up again once a new session is stored', async () => {
    const row = entity();
    const { service, fake } = build(row, true);

    await service.startProvider(row);
    await service.reconcileProviders();
    expect(fake.connect).toHaveBeenCalledTimes(1);

    row.auth = { token: 'fresh-token' };
    await service.reconcileProviders();
    expect(fake.connect).toHaveBeenCalledTimes(2);
  });

  it('leaves a provider that merely dropped its connection alone', async () => {
    const row = entity();
    const { service, fake } = build(row, false);

    await service.startProvider(row);
    // Connected on the first attempt, so the health check has nothing to do —
    // and nothing here is parked.
    await service.reconcileProviders();
    expect(fake.connect).toHaveBeenCalledTimes(1);
    expect(service.getProvider('zaryar')).toBeDefined();
  });
});
