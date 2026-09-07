import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { ManagerAccountService } from "./manager-account.service";
import { ManagerAccountEntity } from "./entity/manager-account.entity";
import { ManagerAccountFundingEntity } from "./entity/manager-account-funding.entity";
import { ManagerAccountLedgerEntity } from "./entity/manager-account-ledger.entity";
import {
  ManagerFundingDirectionEnum,
  ManagerFundingStatusEnum,
  ManagerLedgerTypeEnum,
} from "./enum/manager-account.enums";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { SELF_APPROVE_PERMISSION } from "./manager-account.constants";

/**
 * The rules that decide whether money may enter a manager's account.
 *
 * Funding is the only way capital reaches a manager, and a manager's capital is
 * what backs their arbitrage bots — so who may approve what is worth pinning
 * down at the level where it is actually decided.
 */

const REQUESTER = "admin-requester";
const OTHER_SENIOR = "admin-other-senior";

function build() {
  const account: any = {
    id: "acc-1",
    adminId: REQUESTER,
    symbolId: "sym-1",
    availableBalance: 0,
    allocatedBalance: 0,
    status: "ACTIVE",
  };
  const funding: any = {
    id: "fund-1",
    accountId: account.id,
    adminId: REQUESTER,
    symbolId: "sym-1",
    amount: 100,
    direction: ManagerFundingDirectionEnum.CREDIT,
    status: ManagerFundingStatusEnum.PENDING,
    requestedByAdminId: REQUESTER,
    reviewedByAdminId: null,
    reviewedAt: null,
    reason: null,
    reviewNote: null,
  };
  const ledger: any[] = [];

  const manager = {
    findOne: async (entity: unknown) =>
      entity === ManagerAccountFundingEntity ? funding : account,
    save: async (entity: unknown, row?: unknown) => {
      // TypeORM's save is called both as save(entity, row) and save(row).
      const value = row ?? entity;
      if (entity === ManagerAccountLedgerEntity) ledger.push(value);
      return value;
    },
  };

  const service = new ManagerAccountService(
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
    { transaction: async (fn: any) => fn(manager) } as any,
  );

  return { service, account, funding, ledger };
}

const reviewer = (id: string, permissions: string[] = []) => ({
  id,
  role: AdminRole.SUPER_ADMIN,
  permissions,
});

describe("manager funding approval", () => {
  it("lets a different senior admin approve, crediting the account", async () => {
    const { service, account, funding } = build();

    await service.reviewFunding("fund-1", { approve: true }, reviewer(OTHER_SENIOR));

    expect(funding.status).toBe(ManagerFundingStatusEnum.APPROVED);
    expect(funding.reviewedByAdminId).toBe(OTHER_SENIOR);
    expect(account.availableBalance).toBe(100);
  });

  it("refuses a requester approving their own request", async () => {
    const { service, account, funding } = build();

    await expect(
      service.reviewFunding("fund-1", { approve: true }, reviewer(REQUESTER)),
    ).rejects.toBeInstanceOf(ForbiddenException);

    // The refusal must leave the request and the balance untouched.
    expect(funding.status).toBe(ManagerFundingStatusEnum.PENDING);
    expect(account.availableBalance).toBe(0);
  });

  it("allows self-approval for a reviewer holding funding_self_approve", async () => {
    const { service, account, funding } = build();

    await service.reviewFunding(
      "fund-1",
      { approve: true },
      reviewer(REQUESTER, [SELF_APPROVE_PERMISSION]),
    );

    expect(funding.status).toBe(ManagerFundingStatusEnum.APPROVED);
    expect(account.availableBalance).toBe(100);
  });

  it("marks a self-approval on the ledger, so the balance explains itself", async () => {
    const { service, ledger } = build();

    await service.reviewFunding(
      "fund-1",
      { approve: true },
      reviewer(REQUESTER, [SELF_APPROVE_PERMISSION]),
    );

    const entry = ledger.find((l) => l.type === ManagerLedgerTypeEnum.FUNDING_CREDIT);
    expect(entry.description).toContain("self-approved");
  });

  it("does not mark an ordinary two-person approval", async () => {
    const { service, ledger } = build();

    await service.reviewFunding("fund-1", { approve: true }, reviewer(OTHER_SENIOR));

    const entry = ledger.find((l) => l.type === ManagerLedgerTypeEnum.FUNDING_CREDIT);
    expect(entry.description).not.toContain("self-approved");
  });

  it("refuses a reviewer who is not a senior admin, permission or not", async () => {
    const { service } = build();

    await expect(
      service.reviewFunding("fund-1", { approve: true }, {
        id: OTHER_SENIOR,
        role: AdminRole.ADMIN,
        permissions: [SELF_APPROVE_PERMISSION],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refuses a request that was already reviewed", async () => {
    const { service, funding } = build();
    funding.status = ManagerFundingStatusEnum.APPROVED;

    await expect(
      service.reviewFunding("fund-1", { approve: true }, reviewer(OTHER_SENIOR)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects without touching the balance", async () => {
    const { service, account, funding } = build();

    await service.reviewFunding(
      "fund-1",
      { approve: false, note: "not now" },
      reviewer(OTHER_SENIOR),
    );

    expect(funding.status).toBe(ManagerFundingStatusEnum.REJECTED);
    expect(funding.reviewNote).toBe("not now");
    expect(account.availableBalance).toBe(0);
  });
});
