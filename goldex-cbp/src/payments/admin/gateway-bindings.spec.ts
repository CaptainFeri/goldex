import { CbpAdminService } from "./cbp-admin.service";

/**
 * Which symbols actually route at each gateway.
 *
 * The gateway list on its own says a provider exists, not whether anything
 * uses it — a gateway configured on no symbol looks identical to one serving
 * every deposit in the system.
 */
const symbol = (over: Record<string, unknown> = {}) => ({
  slug: "IRR",
  name: "ریال",
  isActive: true,
  hasPaymentGateway: true,
  depositGateways: ["kaino-informal"],
  withdrawGateways: [],
  defaultDepositGateway: "kaino-informal",
  defaultWithdrawGateway: null,
  ...over,
});

const build = (symbols: any[]) => {
  const service = Reflect.construct(CbpAdminService, [{}, {}]) as CbpAdminService;
  (service as any).symbolRepo = { find: jest.fn(async () => symbols) };
  return service;
};

describe("gateway bindings", () => {
  it("lists a symbol under the gateway it deposits through", async () => {
    const bindings = await build([symbol()]).gatewayBindings();
    expect(bindings["kaino-informal"].deposit).toEqual([
      { slug: "IRR", name: "ریال", isActive: true, isDefault: true },
    ]);
  });

  it("keeps deposit and withdraw apart", async () => {
    const bindings = await build([
      symbol({ depositGateways: ["kaino-informal"], withdrawGateways: ["shahin"] }),
    ]).gatewayBindings();

    expect(bindings["kaino-informal"].deposit.map((s) => s.slug)).toEqual(["IRR"]);
    expect(bindings["kaino-informal"].withdraw).toEqual([]);
    expect(bindings["shahin"].withdraw.map((s) => s.slug)).toEqual(["IRR"]);
  });

  it("marks which symbols call it their default", async () => {
    const bindings = await build([
      symbol({ depositGateways: ["kaino-informal", "shahin"], defaultDepositGateway: "shahin" }),
    ]).gatewayBindings();

    expect(bindings["kaino-informal"].deposit[0].isDefault).toBe(false);
    expect(bindings["shahin"].deposit[0].isDefault).toBe(true);
  });

  it("still lists a symbol that is switched off", async () => {
    // It is configured against this gateway and will use it the moment it is
    // switched back on — which is what someone about to change the gateway
    // needs to know.
    const bindings = await build([symbol({ isActive: false })]).gatewayBindings();
    expect(bindings["kaino-informal"].deposit[0].isActive).toBe(false);
  });

  it("ignores a symbol whose gateway switch is off", async () => {
    // It routes nowhere, whatever lists it still carries from before.
    const bindings = await build([symbol({ hasPaymentGateway: false })]).gatewayBindings();
    expect(bindings).toEqual({});
  });

  it("returns nothing for a gateway no symbol points at", async () => {
    const bindings = await build([symbol()]).gatewayBindings();
    expect(bindings["shahin"]).toBeUndefined();
  });

  it("groups several symbols under one gateway", async () => {
    const bindings = await build([
      symbol({ slug: "IRR" }),
      symbol({ slug: "USD", name: "دلار" }),
    ]).gatewayBindings();

    expect(bindings["kaino-informal"].deposit.map((s) => s.slug).sort()).toEqual(["IRR", "USD"]);
  });
});
