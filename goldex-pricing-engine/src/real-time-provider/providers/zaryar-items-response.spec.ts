import { readZaryarItemsList } from './zaryar-items-response';

/**
 * The shop that had prices and no names.
 *
 * Two Zaryar shops streamed prices for hours while their item lists stayed
 * empty, and the only thing the log said was "No metadata found" — true, and
 * useless, because the call had not failed. Every case below either produces
 * items or produces a sentence explaining what was in the body instead.
 */
describe('Zaryar ShopkeeperItemsList response', () => {
  it('reads the grouped shape the API documents', () => {
    const result = readZaryarItemsList({
      Data: [{ GroupName: 'مسکوکات', GroupId: 2, Items: [{ Id: 4, Name: 'ربع' }] }],
    });
    expect(result.failure).toBeNull();
    expect(result.groups[0].Items[0].Id).toBe(4);
  });

  it('names the envelope rejection instead of reporting no items', () => {
    const result = readZaryarItemsList({ IsSuccess: false, Message: 'دسترسی غیرمجاز', Data: null });
    expect(result.groups).toHaveLength(0);
    expect(result.rejected).toBe(true);
    expect(result.failure).toContain('دسترسی غیرمجاز');
  });

  it('tells a refused session apart from a refused request', () => {
    expect(readZaryarItemsList({ IsSuccess: false, Message: 'Invalid token' }).authRejected).toBe(
      true,
    );
    expect(readZaryarItemsList({ IsSuccess: false, StatusCode: 401 }).authRejected).toBe(true);
    // A shop with nothing on sale is not a shop that logged out.
    expect(
      readZaryarItemsList({ IsSuccess: false, Message: 'آیتمی برای نمایش وجود ندارد' })
        .authRejected,
    ).toBe(false);
  });

  it('says which of the empty cases it is', () => {
    expect(readZaryarItemsList({ Result: [] }).failure).toContain('Data was absent');
    expect(readZaryarItemsList({ Data: null }).failure).toContain('Data was null');
    expect(readZaryarItemsList({ Data: [] }).failure).toContain('empty list');
    expect(readZaryarItemsList({ Data: [{ GroupName: 'سکه', Items: [] }] }).failure).toContain(
      'no items in them',
    );
    expect(readZaryarItemsList('<html>gateway</html>').failure).toContain('response body was');
  });

  it('accepts a wrapper object around the group list', () => {
    const result = readZaryarItemsList({
      Data: { Groups: [{ GroupName: 'آبشده', Items: [{ Id: 1, Name: 'آبشده نقدی' }] }] },
    });
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].GroupName).toBe('آبشده');
  });

  it('accepts a single group sent unwrapped', () => {
    const result = readZaryarItemsList({ Data: { GroupName: 'نقره', Items: [{ Id: 9 }] } });
    expect(result.groups[0].GroupName).toBe('نقره');
  });

  it('folds a flat item list back into its own groups', () => {
    const result = readZaryarItemsList({
      Data: [
        { Id: 1, Name: 'آبشده', GroupName: 'آبشده', GroupId: 1 },
        { Id: 4, Name: 'ربع', GroupName: 'مسکوکات', GroupId: 2 },
        { Id: 5, Name: 'نیم', GroupName: 'مسکوکات', GroupId: 2 },
      ],
    });
    expect(result.failure).toBeNull();
    expect(result.groups).toHaveLength(2);
    expect(result.groups[1].Items).toHaveLength(2);
    expect(result.groups[1].GroupId).toBe(2);
  });

  it('keeps the price fields the caller reads off the same rows', () => {
    const result = readZaryarItemsList({
      Data: [{ GroupName: 'آبشده', Items: [{ Id: 1, Name: 'آبشده', FeeBuy: 10, FeeSell: 9 }] }],
    });
    expect(result.groups[0].Items[0].FeeBuy).toBe(10);
  });
});
