import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AdminEmService } from "./admin-em.service";
import { P2pAuditActorEnum, P2pResolutionTypeEnum } from "../p2p/enum/p2p.enums";

const REQUEST = { id: "r-1", symbolId: "sym-1", destinationBankAccountId: null, hasEnclosure: false } as any;
const ACTOR = { adminId: "admin-1", ip: "10.0.0.1", userAgent: "jest" };

function build(request: any = { ...REQUEST }, escalation: any = { id: "esc-1" }, account: any = { id: "acc-1", symbolId: "sym-1" }) {
  const saved: any[] = [];
  const resolve = jest.fn().mockResolvedValue(undefined);
  const findById = jest.fn(async () => account);
  const service = new AdminEmService(
    {
      findOne: jest.fn(async ({ where }: any) => (where.id === request.id ? request : null)),
      save: jest.fn(async (r: any) => { saved.push({ ...r }); return r; }),
    } as any,
    { openEscalationFor: jest.fn(async () => escalation), proof: jest.fn(), toProof: jest.fn() } as any,
    { resolve } as any,
    { findById } as any,
  );
  return { service, resolve, findById, saved, request };
}

describe("AdminEmService decisions", () => {
  it("resolves through P2pEscalationService rather than writing p2p rows", async () => {
    // The whole point of the projection: the audit log, the two-person control
    // and the settlement invariants all live in that service.
    const { service, resolve } = build();
    await service.approve("r-1", { note: "تایید", challengeId: "c", otp: "1" }, ACTOR);

    expect(resolve).toHaveBeenCalledWith(
      "esc-1",
      "admin-1",
      { resolution: P2pResolutionTypeEnum.CONFIRM_PAYMENT, note: "تایید" },
      expect.objectContaining({ actorType: P2pAuditActorEnum.ADMIN, actorId: "admin-1" }),
    );
  });

  it("maps reject to REJECT_PAYMENT", async () => {
    const { service, resolve } = build();
    await service.reject("r-1", { note: "مغایرت", challengeId: "c", otp: "1" }, ACTOR);
    expect(resolve.mock.calls[0][2]).toMatchObject({ resolution: P2pResolutionTypeEnum.REJECT_PAYMENT });
  });

  it("passes the caller's ip and agent into the audit context", async () => {
    const { service, resolve } = build();
    await service.approve("r-1", { note: "n", challengeId: "c", otp: "1" }, ACTOR);
    expect(resolve.mock.calls[0][3]).toMatchObject({ ip: "10.0.0.1", userAgent: "jest" });
  });

  it("refuses a decision when there is no open escalation to resolve", async () => {
    // Rather than inventing a state change outside the audited path.
    const { service, resolve } = build({ ...REQUEST }, null);
    await expect(
      service.approve("r-1", { note: "n", challengeId: "c", otp: "1" }, ACTOR),
    ).rejects.toThrow(/NO_OPEN_ESCALATION/);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("does not swallow a refusal from the escalation service", async () => {
    // A staged two-person decision, or an already-resolved escalation, must
    // reach the operator.
    const { service, resolve } = build();
    resolve.mockRejectedValueOnce(new BadRequestException("This escalation is already resolved"));
    await expect(
      service.approve("r-1", { note: "n", challengeId: "c", otp: "1" }, ACTOR),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("AdminEmService account assignment", () => {
  it("validates the account through its owning service", async () => {
    const { service, findById, saved } = build();
    await service.assignAccount("r-1", "acc-1");
    expect(findById).toHaveBeenCalledWith("acc-1");
    expect(saved[0].destinationBankAccountId).toBe("acc-1");
  });

  it("refuses an account for a different symbol", async () => {
    // Caught now rather than at settlement time, when it is someone's problem.
    const { service, saved } = build({ ...REQUEST }, { id: "e" }, { id: "acc-2", symbolId: "sym-other" });
    await expect(service.assignAccount("r-1", "acc-2")).rejects.toBeInstanceOf(BadRequestException);
    expect(saved).toHaveLength(0);
  });

  it("allows an account with no symbol restriction", async () => {
    const { service, saved } = build({ ...REQUEST }, { id: "e" }, { id: "acc-3", symbolId: null });
    await service.assignAccount("r-1", "acc-3");
    expect(saved[0].destinationBankAccountId).toBe("acc-3");
  });

  it("404s for a request it does not have", async () => {
    const { service } = build();
    await expect(service.assignAccount("nope", "acc-1")).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("AdminEmService enclosure", () => {
  it("stores the operator's answer both ways", async () => {
    const { service, saved } = build();
    await service.setEnclosure("r-1", true);
    expect(saved[0].hasEnclosure).toBe(true);
    await service.setEnclosure("r-1", false);
    // `if (value)` here would make turning it off silently do nothing.
    expect(saved[1].hasEnclosure).toBe(false);
  });
});
