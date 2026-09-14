import { WarehouseService } from "./warehouse.service";
import { SymbolTypeEnum } from "../../admin-symbol/enum/symbol.type.enum";

/**
 * The two lists the movement form fills its dropdowns from.
 *
 * Served by the warehouse API rather than the symbol and provider admin ones,
 * which require the ADMIN role while these screens belong to warehouse
 * operators.
 */
function build(symbols: any[] = [], providers: any[] = []) {
  const captured: any = {};
  const service = Reflect.construct(WarehouseService, Array(8).fill({})) as WarehouseService;
  (service as any).symbolRepository = {
    find: jest.fn(async (options: any) => { captured.symbolWhere = options.where; return symbols; }),
  };
  (service as any).providerRepository = { find: jest.fn(async () => providers) };
  return { service, captured };
}

describe("movement lookups", () => {
  it("offers material symbols only", async () => {
    // A vault holds metal; offering rial would let an operator book a deposit
    // the warehouse cannot store.
    const { service, captured } = build();
    await service.getMovementLookups();
    expect(captured.symbolWhere).toEqual({ symbolType: SymbolTypeEnum.MATERIAL });
  });

  it("returns a symbol's slug and name and nothing else", async () => {
    const { service } = build([{ id: "s-1", slug: "XAU", name: "طلا", secret: "no" }]);
    const { symbols } = await service.getMovementLookups();
    expect(symbols).toEqual([{ id: "s-1", slug: "XAU", name: "طلا" }]);
  });

  it("falls back to the slug when a symbol has no name", async () => {
    const { service } = build([{ id: "s-1", slug: "XAG", name: null }]);
    expect((await service.getMovementLookups()).symbols[0].name).toBe("XAG");
  });

  it("returns a provider's key and display name and nothing else", async () => {
    // The provider row carries credentials and URLs; a dropdown needs neither.
    const { service } = build([], [{ key: "zaryar", persianName: "زریار", auth: { token: "secret" } }]);
    const { providers } = await service.getMovementLookups();
    expect(providers).toEqual([{ key: "zaryar", name: "زریار" }]);
  });

  it("falls back to the key when a provider has no Persian name", async () => {
    const { service } = build([], [{ key: "atlas", persianName: "" }]);
    expect((await service.getMovementLookups()).providers[0].name).toBe("atlas");
  });

  it("returns empty lists rather than nothing when there is nothing to offer", async () => {
    const { service } = build();
    expect(await service.getMovementLookups()).toEqual({ symbols: [], providers: [] });
  });
});
