import Decimal from "decimal.js";
import { WarehouseService } from "./warehouse.service";

/**
 * Provider settlement material, and how much of it is still on the bench.
 *
 * Gold settled for with a provider exists the moment the settlement is
 * recorded, but it is not a package and no withdrawal can be served from it
 * until an operator weighs it and shelves it. What this measures is that gap.
 */
function build(settlements: any[], packed: any[]) {
  const rawQuery = (rows: any[]) => ({
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    setParameters: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue(rows),
  });

  const service = Reflect.construct(WarehouseService, Array(6).fill({})) as WarehouseService;
  (service as any).settlementRepository = { createQueryBuilder: jest.fn(() => rawQuery(settlements)) };
  (service as any).packetRepository = { createQueryBuilder: jest.fn(() => rawQuery(packed)) };
  return service;
}

describe("unpacked settlement material", () => {
  it("is what was taken in, less what was handed back, less what has been packed", async () => {
    const service = build(
      [{ providerKey: "zaryar", received: "100", paid: "10" }],
      [{ providerKey: "zaryar", packed: "30" }],
    );

    const [provider] = (await service.getSettlementMaterialBalance()).providers;

    expect(provider.netBalance).toBe(90);
    expect(provider.packed).toBe(30);
    expect(provider.unpacked).toBe(60);
  });

  it("counts wastage as packed, because it came out of the same pile", async () => {
    // The query sums pure_weight + wastage, so a 30g package cut with 0.5g of
    // wastage draws 30.5g off the bench.
    const service = build(
      [{ providerKey: "zaryar", received: "100", paid: "0" }],
      [{ providerKey: "zaryar", packed: "30.5" }],
    );

    expect((await service.getSettlementMaterialBalance()).providers[0].unpacked).toBe(69.5);
  });

  it("shows the full amount waiting when nothing has been packed yet", async () => {
    // The old behaviour returned this number forever; the point is that it now
    // falls as packages are cut.
    const service = build([{ providerKey: "zaryar", received: "100", paid: "0" }], []);
    expect((await service.getSettlementMaterialBalance()).providers[0].unpacked).toBe(100);
  });

  it("never reports a negative pile", async () => {
    // More packed than settled for is a data problem to investigate, not a
    // negative amount of gold sitting on a bench.
    const service = build(
      [{ providerKey: "zaryar", received: "10", paid: "0" }],
      [{ providerKey: "zaryar", packed: "40" }],
    );
    expect((await service.getSettlementMaterialBalance()).providers[0].unpacked).toBe(0);
  });

  it("keeps providers apart", async () => {
    const service = build(
      [
        { providerKey: "a", received: "100", paid: "0" },
        { providerKey: "b", received: "50", paid: "0" },
      ],
      [{ providerKey: "a", packed: "100" }],
    );

    const balance = await service.getSettlementMaterialBalance();
    expect(balance.providers.find((p) => p.providerKey === "a")!.unpacked).toBe(0);
    expect(balance.providers.find((p) => p.providerKey === "b")!.unpacked).toBe(50);
    expect(balance.totalUnpacked).toBe(50);
  });

  it("answers for one provider on its own", async () => {
    const service = build(
      [{ providerKey: "zaryar", received: "100", paid: "0" }],
      [{ providerKey: "zaryar", packed: "25" }],
    );
    expect(await service.getUnpackedMaterialFor("zaryar")).toBe(75);
    // A provider the platform has never settled with has nothing waiting.
    expect(await service.getUnpackedMaterialFor("nobody")).toBe(0);
  });

  it("does not lose precision on fractional grams", async () => {
    const service = build(
      [{ providerKey: "zaryar", received: "0.3", paid: "0" }],
      [{ providerKey: "zaryar", packed: "0.1" }],
    );
    // 0.3 - 0.1 in binary floating point is 0.19999999999999998.
    expect(new Decimal((await service.getSettlementMaterialBalance()).providers[0].unpacked).toString()).toBe("0.2");
  });
});
