import { of } from 'rxjs';
import { ZaryarSignalRProvider } from './providers/zaryar-signalr.provider';
import { MessagePatterns } from '../rabbitmq/rabbitmq.module';

/**
 * What happens when the item list comes back empty.
 *
 * Two shops streamed prices for hours with no item names stored, and the log
 * said only "No metadata found" — a sentence that fits every cause and
 * distinguishes none of them. The request had not failed; the body had not
 * held what the parse expected. These are the three outcomes that matters:
 * items, a stated reason, or a login.
 */
describe('Zaryar metadata fetch', () => {
  const build = (body: unknown) => {
    const httpService = { post: jest.fn(() => of({ data: body })) };
    const metadataService = { bulkSetMetadata: jest.fn(() => Promise.resolve()) };
    const publish = jest.fn(() => Promise.resolve());
    const formatter = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      printConnectionEvent: jest.fn(),
    };
    const provider = new ZaryarSignalRProvider(
      httpService as any,
      {} as any,
      metadataService as any,
      formatter as any,
      { publish } as any,
    );
    void provider.init({
      key: 'arianatala',
      category: 'zaryar',
      baseUrl: 'https://example.ir/signalr',
      auth: { token: 'live', shopkeeperId: '7' },
    });
    const fetchMetadata = () => (provider as any).fetchMetadataFromApi() as Promise<unknown[]>;
    return { provider, formatter, publish, fetchMetadata, label: 'ZARYAR:arianatala' };
  };

  it('reads the grouped list into metadata', async () => {
    const { fetchMetadata } = build({
      Data: [{ GroupName: 'مسکوکات', Items: [{ Id: 4, Name: 'ربع سکه' }] }],
    });
    await expect(fetchMetadata()).resolves.toEqual([
      { itemId: 4, name: 'ربع سکه', unit: 'عدد', groupId: 2, groupName: 'مسکوکات' },
    ]);
  });

  it('says what the body held instead of items', async () => {
    const { formatter, fetchMetadata, label } = build({ Data: [] });
    await expect(fetchMetadata()).resolves.toEqual([]);
    expect(formatter.error).toHaveBeenCalledWith(
      label,
      expect.stringContaining('Item list unusable for metadata: Data was an empty list'),
    );
  });

  it('treats a rejected session in a 200 body as the expiry it is', async () => {
    const { publish, fetchMetadata } = build({ IsSuccess: false, Message: 'Invalid token' });
    await fetchMetadata();
    expect(publish).toHaveBeenCalledWith(
      MessagePatterns.PROVIDER_AUTH_EXPIRED,
      expect.objectContaining({ key: 'arianatala' }),
      'arianatala',
    );
  });

  it('does not ask for a login when the shop merely has nothing listed', async () => {
    const { publish, formatter, fetchMetadata } = build({
      IsSuccess: false,
      Message: 'آیتمی یافت نشد',
    });
    await fetchMetadata();
    expect(publish).not.toHaveBeenCalled();
    expect(formatter.error).toHaveBeenCalledWith(
      'ZARYAR:arianatala',
      expect.stringContaining('آیتمی یافت نشد'),
    );
  });
});
