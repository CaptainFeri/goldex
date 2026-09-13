import { BadRequestException } from "@nestjs/common";
import { AllocationService } from "./allocation.service";
import { PacketStatusEnum } from "../enum/packet-status.enum";

/**
 * Allocation against a pool of fungible packages.
 *
 * The vault has no "this user's gold" in it any more: a deposit joins the
 * pool, so what a user holds is the balance in their wallet and any package on
 * the shelf can serve them.
 */
const packet = (over: Record<string, unknown> = {}) => ({
  id: "p-1",
  idSecure: "DEP-1",
  warehouseId: "w-1",
  symbolId: "gold",
  pureWeight: 48,
  status: PacketStatusEnum.ORPHAN,
  ang: null,
  ayar: null,
  warehouseIndexPosition: null,
  ...over,
});

function build(shelf: any[] = []) {
  const captured: any = {};
  const packets = {
    find: jest.fn(async (options: any) => {
      captured.where = options.where;
      captured.order = options.order;
      return shelf;
    }),
  };
  const requests = { findOne: jest.fn() };
  return { service: new AllocationService(packets as any, requests as any), packets, requests, captured };
}

describe("listing what a warehouse can serve", () => {
  it("asks only for free packages in the named warehouse, at or under the weight", async () => {
    // Over-delivering would hand over gold the user has not paid for, and a
    // RESERVED package is already spoken for by another withdrawal.
    const { service, captured } = build([]);
    await service.listCandidates({ warehouseId: "w-1", symbolId: "gold", weight: 50 });

    expect(captured.where).toMatchObject({ warehouseId: "w-1", status: PacketStatusEnum.ORPHAN, symbolId: "gold" });
    // A FindOperator, so the bound is on the operator rather than the key.
    expect(captured.where.pureWeight.type).toBe("lessThanOrEqual");
    expect(captured.where.pureWeight.value).toBe(50);
  });

  it("orders heaviest first, so the smallest refund comes first", async () => {
    const { service, captured } = build([]);
    await service.listCandidates({ warehouseId: "w-1", weight: 50 });
    expect(captured.order).toEqual({ pureWeight: "DESC" });
  });

  it("reports what each choice refunds to the wallet", async () => {
    // The roadmap's scenario: 50g asked for, a 48g package found, 2g back.
    const { service } = build([packet({ pureWeight: 48 })]);
    const [candidate] = await service.listCandidates({ warehouseId: "w-1", weight: 50 });

    expect(candidate.refundWeight).toBe(2);
    expect(candidate.isExactMatch).toBe(false);
  });

  it("calls a difference inside the tolerance threshold an exact match", async () => {
    // Roadmap §4: under 0.05g is zero.
    const { service } = build([packet({ pureWeight: 49.98 })]);
    const [candidate] = await service.listCandidates({ warehouseId: "w-1", weight: 50 });
    expect(candidate.isExactMatch).toBe(true);
  });

  it("refuses to list without a warehouse, because a package elsewhere is not an answer", async () => {
    const { service } = build();
    await expect(service.listCandidates({ warehouseId: "", weight: 50 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("refuses a non-positive weight", async () => {
    const { service } = build();
    await expect(service.listCandidates({ warehouseId: "w-1", weight: 0 })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("does not filter by symbol when the caller names none", async () => {
    const { service, captured } = build([]);
    await service.listCandidates({ warehouseId: "w-1", weight: 50 });
    expect(captured.where.symbolId).toBeUndefined();
  });
});

describe("options offered for a request", () => {
  const request = (over: Record<string, unknown> = {}) => ({
    id: "r-1",
    type: "OUTPUT",
    status: "PENDING",
    weight: 50,
    warehouseId: "w-1",
    symbolId: "gold",
    ...over,
  });

  const suggest = async (shelf: any[], over: Record<string, unknown> = {}) => {
    const { service, requests } = build(shelf);
    requests.findOne.mockResolvedValue(request(over) as any);
    return service.suggestForRequest("r-1");
  };

  it("puts an exact match first", async () => {
    const options = await suggest([
      packet({ id: "p-exact", pureWeight: 50 }),
      packet({ id: "p-fit", pureWeight: 48 }),
    ]);
    expect(options[0].kind).toBe("exact");
    expect(options[0].refundWeight).toBe(0);
  });

  it("offers the closest package below when nothing matches exactly", async () => {
    const options = await suggest([packet({ id: "p-fit", pureWeight: 48 }), packet({ id: "p-small", pureWeight: 10 })]);
    const fit = options.find((option) => option.kind === "fit");
    expect(fit?.packetIds).toEqual(["p-fit"]);
    expect(fit?.refundWeight).toBe(2);
  });

  it("offers a combination only when it beats the best single package", async () => {
    // 30 + 19 = 49 beats 30 alone, so it is worth showing.
    const options = await suggest([
      packet({ id: "a", pureWeight: 30 }),
      packet({ id: "b", pureWeight: 19 }),
    ]);
    const combination = options.find((option) => option.kind === "combination");
    expect(combination?.packetIds.sort()).toEqual(["a", "b"]);
    expect(combination?.deliveredWeight).toBe(49);
  });

  it("does not offer a combination that is no better than one package", async () => {
    // 48 alone already beats 10 + 12; more pieces for a bigger refund is worse.
    const options = await suggest([
      packet({ id: "big", pureWeight: 48 }),
      packet({ id: "a", pureWeight: 10 }),
      packet({ id: "b", pureWeight: 12 }),
    ]);
    expect(options.find((option) => option.kind === "combination")).toBeUndefined();
  });

  it("never offers the user's own previous deposit as a special case", async () => {
    // That priority is gone with the ownership it depended on.
    const options = await suggest([packet({ id: "p-fit", pureWeight: 48 })]);
    expect(options.map((option) => option.kind)).not.toContain("own-exact");
    expect(options.map((option) => option.kind)).not.toContain("own-fit");
  });

  it("refuses to allocate against a deposit request", async () => {
    await expect(suggest([], { type: "INPUT" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("refuses to allocate against a request that is already done", async () => {
    await expect(suggest([], { status: "COMPLETED" })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("parseOptionKey", () => {
  it("splits a combination key into its packages", () => {
    const { service } = build();
    expect(service.parseOptionKey("combination:a_b_c")).toEqual({ kind: "combination", packetIds: ["a", "b", "c"] });
  });

  it("refuses a key with no strategy in it", () => {
    const { service } = build();
    expect(() => service.parseOptionKey("nonsense")).toThrow(BadRequestException);
  });
});
