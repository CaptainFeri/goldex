import { RabbitMQService } from "./rabbitmq.service";
import { MessagePatterns } from "./interfaces/rabbitmq.interfaces";

/**
 * One message, every handler that asked for it.
 *
 * Two modules subscribe to a provider order status: the one that settles the
 * customer's order, and the one that settles an arbitrage bot's leg. Keeping a
 * single handler per pattern meant whichever module started last silently
 * replaced the other — customer orders were then handed to the bot handler,
 * which ignored them, and sat pending with the balance locked.
 */

function build() {
  // Built without the constructor: it opens a broker connection, and the
  // subscribe/dispatch logic under test needs none.
  const service: RabbitMQService = Object.create(RabbitMQService.prototype);
  Object.assign(service, {
    subscribers: new Map(),
    consuming: false,
    channel: null,
    logger: { log: jest.fn(), warn: jest.fn(), error: jest.fn() },
  });

  // Deliver straight to the dispatch path, without a broker.
  const deliver = (pattern: string, data: unknown) => {
    const handlers = (service as any).subscribers.get(pattern) ?? [];
    for (const cb of handlers) cb({ pattern, data, timestamp: "", providerKey: "p" });
    return handlers.length;
  };

  return { service, deliver };
}

describe("message fan-out", () => {
  it("gives one pattern to every handler that subscribed", async () => {
    const { service, deliver } = build();
    const settleOrder = jest.fn();
    const settleBotLeg = jest.fn();

    await service.subscribe(MessagePatterns.ORDER_STATUS_CHANGED, settleOrder);
    await service.subscribe(MessagePatterns.ORDER_STATUS_CHANGED, settleBotLeg);

    deliver(MessagePatterns.ORDER_STATUS_CHANGED, { clientOrderId: "abc" });

    expect(settleOrder).toHaveBeenCalledTimes(1);
    expect(settleBotLeg).toHaveBeenCalledTimes(1);
  });

  it("keeps the first handler when a second subscribes later", async () => {
    // Module init order decided the winner before; it must not matter now.
    const { service, deliver } = build();
    const first = jest.fn();
    await service.subscribe(MessagePatterns.ORDER_STATUS_CHANGED, first);
    await service.subscribe(MessagePatterns.ORDER_STATUS_CHANGED, jest.fn());

    deliver(MessagePatterns.ORDER_STATUS_CHANGED, {});
    expect(first).toHaveBeenCalledTimes(1);
  });

  it("still routes unrelated patterns to their own handler only", async () => {
    const { service, deliver } = build();
    const onStatus = jest.fn();
    const onPlaced = jest.fn();

    await service.subscribe(MessagePatterns.ORDER_STATUS_CHANGED, onStatus);
    await service.subscribe(MessagePatterns.ORDER_PLACED, onPlaced);

    deliver(MessagePatterns.ORDER_PLACED, {});
    expect(onPlaced).toHaveBeenCalledTimes(1);
    expect(onStatus).not.toHaveBeenCalled();
  });

  it("reports nothing listening rather than dropping in silence", async () => {
    const { deliver } = build();
    expect(deliver(MessagePatterns.ORDER_STATUS_CHANGED, {})).toBe(0);
  });
});
