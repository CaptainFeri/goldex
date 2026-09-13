import Decimal from "decimal.js";
import { WarehouseRequestService } from "./warehouse-request.service";
import { RequestStatusEnum } from "../enum/request-status.enum";
import { RequestTypeEnum } from "../enum/request-type.enum";
import { PacketStatusEnum } from "../enum/packet-status.enum";
import { WarehouseRequestEntity } from "../entity/warehouse-request.entity";
import { PacketEntity } from "../entity/packet.entity";
import { TransactionEntity } from "../../wallet/entities/transaction.entity";

/**
 * Releasing the wallet lock when a withdrawal is turned down.
 *
 * A withdrawal locks the user's balance the moment they raise it, so every way
 * the request can end without gold leaving the vault has to give it back. The
 * admin's rejection is the one that did not.
 */
function build(request: Partial<WarehouseRequestEntity>, reserved: PacketEntity[] = []) {
  const wallet = { id: "w-1", userId: "u-1", symbolId: "gold", freeBalance: 0, lockedBalance: 50 };
  const row = {
    id: "r-1",
    type: RequestTypeEnum.OUTPUT,
    status: RequestStatusEnum.PENDING,
    userId: "u-1",
    symbolId: "gold",
    warehouseId: "wh-1",
    weight: 50,
    metadata: {},
    ...request,
  } as WarehouseRequestEntity;

  const saved: any[] = [];
  const manager = {
    findOne: jest.fn(async (entity: any, options: any) => {
      if (entity === WarehouseRequestEntity) return row;
      if (entity === PacketEntity) return reserved.find((p) => p.id === options?.where?.id) ?? null;
      if (entity === TransactionEntity) return null;
      return null;
    }),
    find: jest.fn(async (entity: any) => (entity === PacketEntity ? reserved : [])),
    save: jest.fn(async (v: any) => { saved.push(v); return v; }),
    softDelete: jest.fn(async () => undefined),
    getRepository: jest.fn(() => ({ create: (v: any) => v, save: jest.fn(async (v: any) => v) })),
  };

  const queryRunner = {
    manager,
    connect: jest.fn(),
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };

  const service = Reflect.construct(WarehouseRequestService, Array(11).fill({})) as WarehouseRequestService;
  (service as any).dataSource = { createQueryRunner: () => queryRunner };
  (service as any).logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };
  (service as any).getWalletForUpdate = jest.fn(async () => wallet);
  (service as any).historyRepository = { create: (v: any) => v, save: jest.fn(async (v: any) => v) };
  (service as any).syncLinkedRecord = jest.fn();
  (service as any).warehouseService = { updateCapacity: jest.fn() };
  (service as any).voucherService = { issueForWithdraw: jest.fn(async () => "v-1") };

  return { service, wallet, row, queryRunner, reserved };
}

const reject = (service: WarehouseRequestService) =>
  service.processRequest("r-1", "admin-1", { status: RequestStatusEnum.REJECTED } as any);

describe("rejecting a withdrawal", () => {
  it("releases the lock on a request that never got a package", async () => {
    // The case that was broken: a PENDING withdrawal has no package, because
    // one is only reserved at approval. The unlock sat behind a check for that
    // package, so the user's gold stayed locked with nothing left to free it.
    const { service, wallet } = build({ status: RequestStatusEnum.PENDING });

    await reject(service);

    expect(new Decimal(wallet.lockedBalance).toNumber()).toBe(0);
    expect(new Decimal(wallet.freeBalance).toNumber()).toBe(50);
  });

  it("releases the lock on a request that had one reserved", async () => {
    const packet = {
      id: "p-1",
      idSecure: "DEP-1",
      warehouseId: "wh-1",
      pureWeight: 48,
      status: PacketStatusEnum.RESERVED,
      reservedForRequestId: "r-1",
    } as PacketEntity;

    const { service, wallet } = build({ status: RequestStatusEnum.APPROVED, packetId: "p-1" }, [packet]);

    await reject(service);

    expect(wallet.lockedBalance).toBe(0);
    expect(wallet.freeBalance).toBe(50);
  });

  it("puts a reserved package back on the shelf, free for anyone", async () => {
    // It never belonged to the requester — a reservation is "nobody else may
    // take this while an admin works on it", not a transfer.
    const packet = {
      id: "p-1",
      idSecure: "DEP-1",
      warehouseId: "wh-1",
      pureWeight: 48,
      status: PacketStatusEnum.RESERVED,
      reservedForRequestId: "r-1",
      userId: null,
    } as unknown as PacketEntity;

    const { service } = build({ status: RequestStatusEnum.APPROVED, packetId: "p-1" }, [packet]);

    await reject(service);

    expect(packet.status).toBe(PacketStatusEnum.ORPHAN);
    expect(packet.reservedForRequestId).toBeNull();
    expect(packet.userId).toBeNull();
  });

  it("returns every package of a combination, not just the one the request names", async () => {
    const packets = [
      { id: "p-1", idSecure: "A", warehouseId: "wh-1", pureWeight: 30, status: PacketStatusEnum.RESERVED, reservedForRequestId: "r-1" },
      { id: "p-2", idSecure: "B", warehouseId: "wh-1", pureWeight: 19, status: PacketStatusEnum.RESERVED, reservedForRequestId: "r-1" },
    ] as unknown as PacketEntity[];

    const { service } = build({ status: RequestStatusEnum.APPROVED, packetId: "p-1" }, packets);

    await reject(service);

    expect(packets.every((p) => p.status === PacketStatusEnum.ORPHAN)).toBe(true);
  });

  it("commits the release rather than leaving it to a later sweep", async () => {
    const { service, queryRunner } = build({ status: RequestStatusEnum.PENDING });

    await reject(service);

    expect(queryRunner.commitTransaction).toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
  });
});

describe("rejecting a deposit", () => {
  it("touches no balance, because a pending deposit never locked one", async () => {
    // A deposit credits nothing until the metal is weighed and confirmed.
    const { service, wallet } = build({ type: RequestTypeEnum.INPUT, status: RequestStatusEnum.PENDING });

    await reject(service);

    expect(wallet.lockedBalance).toBe(50);
    expect(wallet.freeBalance).toBe(0);
  });

  it("discards the placeholder package written at approval", async () => {
    const packet = { id: "p-1", idSecure: "DEP-1", status: PacketStatusEnum.PENDING } as PacketEntity;
    const { service, queryRunner } = build(
      { type: RequestTypeEnum.INPUT, status: RequestStatusEnum.APPROVED, packetId: "p-1" },
      [packet],
    );

    await reject(service);

    expect(queryRunner.manager.softDelete).toHaveBeenCalledWith(PacketEntity, "p-1");
  });
});
