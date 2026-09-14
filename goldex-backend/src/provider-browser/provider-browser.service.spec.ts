import { ProviderBrowserService } from './provider-browser.service';

/**
 * Pointing a browser at one provider, and turning what its login produced into
 * an activated provider.
 */
describe('provider browser', () => {
  const provider = {
    id: 'p1',
    key: 'zaryar',
    baseUrl: 'https://socket.example.ir/signalr',
    apiBaseUrl: 'https://api.example.ir',
    webPanelUrl: 'https://panel.example.ir',
    sendOtpUrl: 'https://auth.example.ir/send',
    verifyCodeUrl: 'https://auth.example.ir/verify',
    useProxy: true,
  };

  const build = (over: { provider?: any; client?: any } = {}) => {
    const client = {
      open: jest.fn().mockResolvedValue({ id: 's1', providerKey: 'zaryar', allowedHosts: [] }),
      get: jest.fn().mockResolvedValue({ id: 's1', providerKey: 'zaryar', captured: true }),
      captured: jest
        .fn()
        .mockResolvedValue({ auth: { token: 'tok' }, sourceUrl: 'https://api.example.ir/login' }),
      close: jest.fn().mockResolvedValue({ closed: true }),
      ...over.client,
    };
    const providers = {
      findOne: jest.fn().mockResolvedValue({ ...provider, ...over.provider }),
      setAuth: jest.fn().mockResolvedValue({ message: 'activated' }),
    };
    return { service: new ProviderBrowserService(client as any, providers as any), client, providers };
  };

  describe('opening', () => {
    /**
     * The panel URL is where a person signs in; the others are where that page's
     * own requests go. Leaving them out would have the allowlist block the login
     * the moment it submitted.
     */
    it('opens on the web panel and allows every host the login needs', async () => {
      const { service, client } = build();
      await service.open('p1');

      expect(client.open).toHaveBeenCalledWith({
        providerKey: 'zaryar',
        loginUrl: 'https://panel.example.ir',
        otherUrls: [
          'https://socket.example.ir/signalr',
          'https://api.example.ir',
          'https://auth.example.ir/send',
          'https://auth.example.ir/verify',
        ],
        useProxy: true,
      });
    });

    it('carries the provider’s own proxy choice, so the browser egresses as the engine would', async () => {
      const { service, client } = build({ provider: { useProxy: false } });
      await service.open('p1');
      expect(client.open.mock.calls[0][0].useProxy).toBe(false);
    });

    it('treats a provider from before the flag as proxied', async () => {
      const { service, client } = build({ provider: { useProxy: undefined } });
      await service.open('p1');
      expect(client.open.mock.calls[0][0].useProxy).toBe(true);
    });

    it('refuses a provider with no web panel address to open', async () => {
      const { service, client } = build({ provider: { webPanelUrl: '  ' } });
      await expect(service.open('p1')).rejects.toThrow(/webPanelUrl/);
      expect(client.open).not.toHaveBeenCalled();
    });

    it('leaves out urls the provider does not have', async () => {
      const { service, client } = build({
        provider: { apiBaseUrl: undefined, sendOtpUrl: '', verifyCodeUrl: null },
      });
      await service.open('p1');
      expect(client.open.mock.calls[0][0].otherUrls).toEqual([
        'https://socket.example.ir/signalr',
      ]);
    });
  });

  describe('activating', () => {
    it('stores what the login produced and closes the browser', async () => {
      const { service, client, providers } = build();
      await service.activate('p1', 's1');

      expect(providers.setAuth).toHaveBeenCalledWith('p1', { token: 'tok' });
      expect(client.close).toHaveBeenCalledWith('s1');
    });

    /**
     * A browser left open is a live signed-in session sitting in the server
     * until its TTL runs out. Whether the engine liked the credentials has
     * nothing to do with whether the login is over.
     */
    it('closes the browser even when the engine refuses the credentials', async () => {
      const { service, client, providers } = build();
      providers.setAuth.mockRejectedValue(new Error('Credentials rejected'));

      await expect(service.activate('p1', 's1')).rejects.toThrow('Credentials rejected');
      expect(client.close).toHaveBeenCalledWith('s1');
    });

    // Session ids are handed out by another service; binding them to the
    // provider stops one provider being activated with another's login.
    it('refuses a session that belongs to a different provider', async () => {
      const { service, client, providers } = build({
        client: { get: jest.fn().mockResolvedValue({ id: 's1', providerKey: 'talaab' }) },
      });

      await expect(service.activate('p1', 's1')).rejects.toThrow(/different provider/i);
      expect(providers.setAuth).not.toHaveBeenCalled();
      expect(client.captured).not.toHaveBeenCalled();
    });

    it('passes through a browser that captured nothing', async () => {
      const { service, providers } = build({
        client: {
          captured: jest.fn().mockRejectedValue(new Error('No credentials captured yet')),
        },
      });

      await expect(service.activate('p1', 's1')).rejects.toThrow(/No credentials captured/);
      expect(providers.setAuth).not.toHaveBeenCalled();
    });
  });
});
