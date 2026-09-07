import { OrderStatusConsumer } from "./order-status.consumer";
import { OrderStatusEnum } from "../../order/enum/order.status.enum";
import { MessagePatterns } from "../interfaces/rabbitmq.interfaces";

/**
 * Settling a MARKET order from the provider's own outcome.
 *
 * The customer's balance is locked the moment the order is placed and only this
 * handler releases it, so every path that ends without settling is an order
 * stuck PENDING with the money still held.
 */

const ORDER_ID = "6ca134af-c519-482a-a2a4-c40c8b3ea939";
const PAIR_ID = "8cce4777-14f5-4d3b-86e3-6ce394088574";

function build(overrides: { pricePairOnOrder?: boolean; pairFound?: boolean } = {}) {
  const { pricePairOnOrder = true, pairFound = true } = overrides;
  const pair = { id: PAIR_ID, baseSymbol: { slug: "XAU" }, quoteSymbol: { slug: "IRR" } };

  const order: any = {
    id: ORDER_ID,
    orderCode: "ORD-SM-MTQXC843",
    status: OrderStatusEnum.PENDING,
    pricePairId: PAIR_ID,
    pricePair: pricePairOnOrder ? pair : null,
    providerOrderId: null,
    isCreditLinked: false,
  };

  const walletOrderService = {
    confirmOrderExecution: jest.fn().mockResolvedValue(undefined),
    rejectOrder: jest.fn().mockResolvedValue(undefined),
  };

  const subscriptions = new Map<string, (msg: any) => any>();
  const consumer = new OrderStatusConsumer(
    { subscribe: (p: string, cb: any) => subscriptions.set(p, cb) } as any,
    walletOrderService as any,
    { findOne: async () => order, update: jest.fn(), save: jest.fn() } as any,
    { findOne: async () => null, save: jest.fn() } as any,
    { findOne: async () => null, save: jest.fn() } as any,
    { findOne: async () => null, save: jest.fn() } as any,
    { findOne: async () => (pairFound ? pair : null) } as any,
  );

  return { consumer, order, walletOrderService, subscriptions };
}

/** The engine's message for a provider deal that ended cancelled. */
const cancelled = {
  pattern: MessagePatterns.ORDER_STATUS_CHANGED,
  data: {
    providerKey: "mock-zaryar-a",
    orderId: "0537f149-6638-40b2-a1ef-c788c0e18e1b",
    itemId: 101,
    dealType: 1,
    count: 10,
    clientOrderId: ORDER_ID,
    status: 2,
    statusStr: "لغو شده",
  },
};

async function deliver(consumer: OrderStatusConsumer, subscriptions: Map<string, any>, msg: any) {
  await consumer.onModuleInit();
  await subscriptions.get(MessagePatterns.ORDER_STATUS_CHANGED)!(msg);
}

describe("provider order settlement", () => {
  it("rejects the order and unlocks the balance when the provider cancels", async () => {
    const { consumer, walletOrderService, subscriptions } = build();
    await deliver(consumer, subscriptions, cancelled);
    expect(walletOrderService.rejectOrder).toHaveBeenCalledTimes(1);
  });

  it("still settles when the pair relation did not load", async () => {
    // The join coming back empty used to end the handler early, leaving the
    // order PENDING and the customer's balance locked with nothing to release
    // it later.
    const { consumer, walletOrderService, subscriptions } = build({ pricePairOnOrder: false });
    await deliver(consumer, subscriptions, cancelled);
    expect(walletOrderService.rejectOrder).toHaveBeenCalledTimes(1);
  });

  it("confirms the order when the provider fills it", async () => {
    const { consumer, walletOrderService, subscriptions } = build();
    await deliver(consumer, subscriptions, {
      ...cancelled,
      data: { ...cancelled.data, status: 1, statusStr: "انجام شده" },
    });
    expect(walletOrderService.confirmOrderExecution).toHaveBeenCalledTimes(1);
    expect(walletOrderService.rejectOrder).not.toHaveBeenCalled();
  });

  it("leaves an already-settled order alone", async () => {
    const { consumer, order, walletOrderService, subscriptions } = build();
    order.status = OrderStatusEnum.COMPLETED;
    await deliver(consumer, subscriptions, cancelled);
    expect(walletOrderService.rejectOrder).not.toHaveBeenCalled();
  });

  it("ignores an arbitrage-bot leg, which settles elsewhere", async () => {
    const { consumer, walletOrderService, subscriptions } = build();
    await deliver(consumer, subscriptions, {
      ...cancelled,
      data: { ...cancelled.data, clientOrderId: "bot:trade-1:buy" },
    });
    expect(walletOrderService.rejectOrder).not.toHaveBeenCalled();
  });

  it("gives up only when the pair is genuinely gone", async () => {
    const { consumer, walletOrderService, subscriptions } = build({
      pricePairOnOrder: false,
      pairFound: false,
    });
    await deliver(consumer, subscriptions, cancelled);
    expect(walletOrderService.rejectOrder).not.toHaveBeenCalled();
  });
});
