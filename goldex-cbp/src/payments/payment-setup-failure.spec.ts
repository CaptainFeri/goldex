import { PaymentsService } from "./payments.service";
import { PaymentOperationEnum } from "./enum/payment-operation.enum";
import { PaymentStatusEnum } from "./enum/payment-status.enum";

/**
 * A request the gateway never got to see still has to reach the backend.
 *
 * Refusals raised while preparing a payment — an unknown symbol, a type the
 * symbol does not allow, a gateway that is not configured — used to throw into
 * the consumer, which logs and acks. Nothing went back over the bus, so the
 * caller sat on a pending deposit until its own timeout and could only report
 * that the gateway had not opened, never why.
 */
function build(symbol: any | null, coreError?: Error) {
  const saved: any[] = [];
  const failures: { payment: any; reason: string }[] = [];

  // The constructor reads config to build its callback URL, so the stand-in
  // config has to answer that one call.
  const config = { get: () => ({ callbackBaseUrl: "https://example.test" }) };
  const service = Reflect.construct(
    PaymentsService,
    Array(10).fill(config),
  ) as PaymentsService;
  (service as any).paymentRepo = {
    create: (v: any) => v,
    save: jest.fn(async (v: any) => { saved.push(v); return { ...v, id: "p-1" }; }),
  };
  (service as any).symbolsService = {
    findBySlug: jest.fn(async () => {
      if (!symbol) throw new Error("not found");
      return symbol;
    }),
  };
  (service as any).events = { failed: jest.fn((p: any, reason: string) => failures.push({ payment: p, reason })) };
  (service as any).logger = { error: jest.fn(), log: jest.fn() };
  (service as any).createDepositCore = jest.fn(async () => {
    if (coreError) throw coreError;
    return { id: "p-ok" };
  });
  (service as any).createWithdrawCore = (service as any).createDepositCore;

  return { service, saved, failures };
}

const cmd = {
  externalReference: "dep-1",
  userId: "u-1",
  symbolSlug: "IRR",
  symbolType: "rial",
  type: "payment-gateway",
  amount: 1_000_000,
  currency: "IRR",
  gatewayCode: "kaino-informal",
} as any;

describe("a deposit refused before it reaches a gateway", () => {
  it("reports an unconfigured gateway instead of going silent", async () => {
    // The case behind "the gateway does not open": rial is set to kaino but
    // the symbol reached cbp without the gateway configured on it.
    const { service, failures } = build(
      { id: "s-1", slug: "IRR" },
      new Error('Symbol "IRR" has no payment gateway configured'),
    );

    await expect(service.createDepositFromCommand(cmd)).rejects.toThrow();

    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toContain("has no payment gateway configured");
  });

  it("marks the payment FAILED and keeps the reason on it", async () => {
    const { service, saved } = build({ id: "s-1" }, new Error("Gateway \"kaino-informal\" is not allowed"));

    await expect(service.createDepositFromCommand(cmd)).rejects.toThrow();

    expect(saved[0].status).toBe(PaymentStatusEnum.FAILED);
    expect(saved[0].metadata.error).toContain("not allowed");
    expect(saved[0].externalReference).toBe("dep-1");
    expect(saved[0].operation).toBe(PaymentOperationEnum.DEPOSIT);
  });

  it("still reports an unknown symbol", async () => {
    const { service, failures } = build(null);
    await expect(service.createDepositFromCommand(cmd)).rejects.toThrow();
    expect(failures[0].reason).toContain("not found in cbp");
  });

  it("publishes one failure, not two, when the gateway call itself failed", async () => {
    // createDepositCore already records and reports that payment; a second
    // failure for the same request would move the deposit twice.
    const reported = Object.assign(new Error("kaino timed out"), { __cbpReported: true });
    const { service, failures } = build({ id: "s-1" }, reported);

    await expect(service.createDepositFromCommand(cmd)).rejects.toThrow();
    expect(failures).toHaveLength(0);
  });

  it("publishes nothing when the request goes through", async () => {
    const { service, failures } = build({ id: "s-1" });
    await expect(service.createDepositFromCommand(cmd)).resolves.toEqual({ id: "p-ok" });
    expect(failures).toHaveLength(0);
  });
});

describe("a withdrawal refused the same way", () => {
  it("reports it rather than leaving the caller waiting", async () => {
    const { service, failures, saved } = build({ id: "s-1" }, new Error("no withdraw gateway"));

    await expect(
      service.createWithdrawFromCommand({ ...cmd, type: "auto", externalReference: "wd-1" }),
    ).rejects.toThrow();

    expect(failures).toHaveLength(1);
    expect(saved[0].operation).toBe(PaymentOperationEnum.WITHDRAW);
  });
});
