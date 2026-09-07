import { StuckOrderReconciler } from "./stuck-order-reconciler.service";
import { OrderStatusEnum } from "./enum/order.status.enum";
import { MessagePatterns } from "../rabbitmq/interfaces/rabbitmq.interfaces";

/**
 * The safety net under order settlement.
 *
 * A market order's balance is released by exactly one message from the
 * pricing-engine. When that message is lost, this is the only thing that
 * notices — so what it asks about, and what it declines to ask about, is the
 * difference between an order recovering and staying stuck.
 */

const stuckOrder = {
  id: "9fcb7018-f7c2-4bb0-a24f-9f3ee2c9d3e5",
  orderCode: "ORD-SM-MTQY3MDU-F2E72C53",
  status: OrderStatusEnum.PENDING,
  providerOrderId: "1001",
  metadata: { providerKey: "mock-talaab-a", providerItemId: 101 },
} as any;

function build(orders: any[]) {
  const publishCommand = jest.fn().mockResolvedValue(undefined);
  const find = jest.fn().mockResolvedValue(orders);
  const service = new StuckOrderReconciler({ find } as any, { publishCommand } as any);
  return { service, publishCommand, find };
}

describe("stuck order reconciliation", () => {
  it("asks the engine what became of a stuck order", async () => {
    const { service, publishCommand } = build([stuckOrder]);
    await service.reconcile();

    expect(publishCommand).toHaveBeenCalledTimes(1);
    const [pattern, payload, routingKey] = publishCommand.mock.calls[0];
    expect(pattern).toBe(MessagePatterns.PROVIDER_COMMAND_ORDER_STATUS);
    expect(payload).toEqual({
      providerKey: "mock-talaab-a",
      orderId: "1001",
      // The engine echoes this back so settlement finds our order again.
      clientOrderId: stuckOrder.id,
    });
    expect(routingKey).toBe("mock-talaab-a");
  });

  it("only looks at pending orders that reached a provider", async () => {
    const { service, find } = build([]);
    await service.reconcile();

    const where = find.mock.calls[0][0].where;
    expect(where.status).toBe(OrderStatusEnum.PENDING);
    // A market order that never got an ack has no provider deal to ask about.
    expect(where.providerOrderId).toBeDefined();
    expect(where.createAt).toBeDefined();
  });

  it("skips an order with no provider recorded, rather than asking nobody", async () => {
    const { service, publishCommand } = build([{ ...stuckOrder, metadata: null }]);
    await service.reconcile();
    expect(publishCommand).not.toHaveBeenCalled();
  });

  it("keeps going when one order cannot be asked about", async () => {
    const { service, publishCommand } = build([
      { ...stuckOrder, metadata: null },
      stuckOrder,
    ]);
    await service.reconcile();
    expect(publishCommand).toHaveBeenCalledTimes(1);
  });

  it("stays quiet when nothing is stuck", async () => {
    const { service, publishCommand } = build([]);
    await service.reconcile();
    expect(publishCommand).not.toHaveBeenCalled();
  });

  it("does not throw when the broker is unavailable", async () => {
    const { service } = build([stuckOrder]);
    (service as any).rmq.publishCommand = jest.fn().mockRejectedValue(new Error("no channel"));
    await expect(service.reconcile()).resolves.toBeUndefined();
  });
});
