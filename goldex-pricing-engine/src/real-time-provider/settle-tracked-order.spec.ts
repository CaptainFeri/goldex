import { ProviderOrderService } from './provider-order.service';
import { MessagePatterns } from '../rabbitmq/rabbitmq.module';

/**
 * Reporting a provider's terminal status.
 *
 * This message is the only notice the backend gets that a deal resolved — it
 * releases the customer's locked balance and completes or rejects their order.
 * Losing it strands the order, so the tracker must not consider the status
 * handled until the broker has actually taken it.
 */

const data = {
  providerKey: 'mock-talaab-a',
  itemId: 101,
  dealType: 1,
  count: 5,
  clientOrderId: '9fcb7018-f7c2-4bb0-a24f-9f3ee2c9d3e5',
} as any;

function build(publishResult: boolean | Error) {
  const publish = jest.fn(async () => {
    if (publishResult instanceof Error) throw publishResult;
    return publishResult;
  });

  const service = new ProviderOrderService(
    {} as any, {} as any, {} as any,
    { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
    {} as any,
    { publish } as any,
  );

  // The tracker's own state, as startTracking would have left it.
  const interval = setInterval(() => undefined, 60_000).unref();
  (service as any).trackedOrders.set('1001', {
    providerKey: data.providerKey, orderId: '1001', itemId: 101,
    dealType: 1, count: 5, lastStatus: 0, interval,
    clientOrderId: data.clientOrderId,
  });
  (service as any).updateDealStatus = jest.fn().mockResolvedValue(undefined);

  return { service, publish, tracked: () => (service as any).trackedOrders.get('1001') };
}

const settle = (service: ProviderOrderService, status = 1) =>
  (service as any).settleTrackedOrder('1001', status, 'تایید شده', data, data.clientOrderId);

describe('reporting a tracked order status', () => {
  it('publishes the status the backend settles on', async () => {
    const { service, publish } = build(true);
    await settle(service);

    expect(publish).toHaveBeenCalledTimes(1);
    const [pattern, payload] = publish.mock.calls[0] as any[];
    expect(pattern).toBe(MessagePatterns.ORDER_STATUS_CHANGED);
    expect(payload).toMatchObject({ clientOrderId: data.clientOrderId, status: 1 });
  });

  it('stops tracking once the broker has taken it', async () => {
    const { service, tracked } = build(true);
    await settle(service);
    expect(tracked()).toBeUndefined();
  });

  it('keeps tracking when the publish is dropped, so the next tick retries', async () => {
    // The failure this guards: the deal row was updated and the tracker
    // stopped, so the status was lost and the order sat pending forever.
    const { service, tracked } = build(false);
    await settle(service);

    expect(tracked()).toBeDefined();
    // lastStatus must not advance, or the retry would see no change.
    expect(tracked().lastStatus).toBe(0);
  });

  it('retries on the next tick and settles then', async () => {
    const { service, publish, tracked } = build(false);
    await settle(service);
    expect(tracked()).toBeDefined();

    publish.mockImplementation(async () => true);
    await settle(service);
    expect(tracked()).toBeUndefined();
  });

  it('does not spin forever when there is no broker at all', async () => {
    const service = new ProviderOrderService(
      {} as any, {} as any, {} as any,
      { log: jest.fn(), warn: jest.fn(), error: jest.fn() } as any,
      {} as any,
      undefined,
    );
    const interval = setInterval(() => undefined, 60_000).unref();
    (service as any).trackedOrders.set('1001', { orderId: '1001', lastStatus: 0, interval });
    (service as any).updateDealStatus = jest.fn().mockResolvedValue(undefined);

    await (service as any).settleTrackedOrder('1001', 1, 'تایید شده', data, data.clientOrderId);
    expect((service as any).trackedOrders.get('1001')).toBeUndefined();
  });
});
