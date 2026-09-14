import { AdminSymbolService } from "./admin-symbol.service";

/**
 * Keeping the payment service level with a symbol edit.
 *
 * The sync is fire-and-forget and never retries, so anything that edits a
 * symbol and does not publish leaves the two services configured differently —
 * visible only when a user cannot deposit.
 */
function build(symbols: any[] = []) {
  const published: any[] = [];
  const service = Reflect.construct(AdminSymbolService, Array(6).fill({})) as AdminSymbolService;
  (service as any).symbolRepository = {
    find: jest.fn(async () => symbols),
    findOne: jest.fn(async () => symbols[0] ?? null),
    delete: jest.fn(async () => ({ affected: 1 })),
  };
  (service as any).paymentBus = { syncSymbol: jest.fn((s: any) => published.push(s)) };
  (service as any).findOne = jest.fn(async () => symbols[0]);
  return { service, published };
}

describe("removing a symbol", () => {
  it("deactivates it on the payment service rather than leaving it live", async () => {
    // cbp has no delete: a symbol it never hears about again stays exactly as
    // it was, still accepting payments for something that no longer exists.
    const { service, published } = build([{ id: "s-1", slug: "IRR", isActive: true }]);

    await service.remove("s-1");

    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({ slug: "IRR", isActive: false });
  });
});

describe("resyncing every symbol", () => {
  it("republishes all of them", async () => {
    // The way back when a sync was refused, or lost while cbp was down.
    const { service, published } = build([
      { id: "s-1", slug: "IRR" },
      { id: "s-2", slug: "XAU" },
    ]);

    expect(await service.resyncAll()).toEqual({ synced: 2 });
    expect(published.map((s) => s.slug)).toEqual(["IRR", "XAU"]);
  });

  it("reports nothing to do rather than failing on an empty install", async () => {
    const { service, published } = build([]);
    expect(await service.resyncAll()).toEqual({ synced: 0 });
    expect(published).toHaveLength(0);
  });
});
