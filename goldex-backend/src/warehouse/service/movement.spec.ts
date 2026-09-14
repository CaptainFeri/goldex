import { BadRequestException } from "@nestjs/common";
import Decimal from "decimal.js";
import { MovementService } from "./movement.service";
import { MovementDirectionEnum, MovementPartyEnum, MovementSourceEnum } from "../enum/movement.enum";

/**
 * The physical ledger.
 *
 * A movement is metal crossing the warehouse door — distinct from a request,
 * which is paperwork that may never be fulfilled, and which metal can move
 * without entirely.
 */
function build() {
  const saved: any[] = [];
  const repo = {
    create: (v: any) => v,
    save: jest.fn(async (v: any) => { saved.push(v); return { ...v, id: "m-1" }; }),
  };
  const service = new MovementService(repo as any);
  const queryRunner = { manager: { getRepository: () => repo } };
  return { service, queryRunner, saved, repo };
}

const input = (over: Record<string, unknown> = {}) => ({
  warehouseId: "wh-1",
  direction: MovementDirectionEnum.IN,
  source: MovementSourceEnum.DEPOSIT_REQUEST,
  netWeight: 96,
  partyType: MovementPartyEnum.USER,
  partyUserId: "u-1",
  ...over,
}) as any;

describe("recording a crossing", () => {
  it("stores the weight as a positive magnitude, whichever way it went", async () => {
    // Direction lives in its own column: a signed weight invites a query that
    // forgets to check which way the metal went.
    const { service, saved } = build();

    await service.record(null, input({ direction: MovementDirectionEnum.OUT, netWeight: 48 }));

    expect(saved[0].netWeight).toBe(48);
    expect(saved[0].direction).toBe(MovementDirectionEnum.OUT);
  });

  it("accepts a Decimal without going through a float", async () => {
    const { service, saved } = build();
    await service.record(null, input({ netWeight: new Decimal("0.1").plus("0.2") }));
    expect(saved[0].netWeight).toBe(0.3);
  });

  it("records nothing for a zero-weight crossing", async () => {
    // A row no reconciliation can explain is worse than no row.
    const { service, repo } = build();
    expect(await service.record(null, input({ netWeight: 0 }))).toBeNull();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("records nothing for a negative weight", async () => {
    const { service, repo } = build();
    expect(await service.record(null, input({ netWeight: -5 }))).toBeNull();
    expect(repo.save).not.toHaveBeenCalled();
  });

  it("writes through the caller's transaction so it commits with the movement", async () => {
    // A deposit that rolls back must not leave a row claiming gold arrived.
    const { service, queryRunner, saved } = build();
    await service.record(queryRunner, input());
    expect(saved).toHaveLength(1);
  });

  it("keeps several packages on one crossing", async () => {
    // An intake may be shelved as several packages and a withdrawal served by
    // a combination; both are one crossing of the door.
    const { service, saved } = build();
    await service.record(null, input({ packetIds: ["p-1", "p-2", "p-3"] }));
    expect(saved[0].packetIds).toEqual(["p-1", "p-2", "p-3"]);
  });

  it("stores no empty package list", async () => {
    const { service, saved } = build();
    await service.record(null, input({ packetIds: [] }));
    expect(saved[0].packetIds).toBeNull();
  });
});

describe("attributing a crossing", () => {
  const assert = (over: Record<string, unknown>) =>
    build().service.assertPartyResolved({
      partyType: MovementPartyEnum.USER,
      ...over,
    } as any);

  it("refuses a user movement that names no user", () => {
    // An unattributable crossing is what this ledger exists to make impossible.
    expect(() => assert({ partyUserId: null })).toThrow(BadRequestException);
  });

  it("refuses a provider movement that names no provider", () => {
    expect(() => assert({ partyType: MovementPartyEnum.PROVIDER, providerKey: null })).toThrow(
      BadRequestException,
    );
  });

  it("accepts a system movement, which has no outside counterparty", () => {
    // Wastage consumed in a cut leaves the shelf without going to anyone.
    expect(() => assert({ partyType: MovementPartyEnum.SYSTEM, partyUserId: null })).not.toThrow();
  });

  it("accepts each named counterparty", () => {
    expect(() => assert({ partyUserId: "u-1" })).not.toThrow();
    expect(() => assert({ partyType: MovementPartyEnum.PROVIDER, providerKey: "zaryar" })).not.toThrow();
  });
});
