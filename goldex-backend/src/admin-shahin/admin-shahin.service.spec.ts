import { BadRequestException, NotFoundException } from "@nestjs/common";
import { AdminShahinService, normalizeDirection } from "./admin-shahin.service";

const ACCOUNT = {
  id: 1, accountNumber: "1234567890", bankCode: "BSI", bankName: "بانک ملی",
  iban: "IR12", ownerName: "شرکت", balance: "1000", accountStatus: "active",
  lastAccessedAt: new Date("2026-09-01T10:00:00Z"), metadata: null,
} as any;

function build(forwarded: unknown = {}, accounts: any[] = [ACCOUNT], entries: any[] = []) {
  const forward = jest.fn(async (..._args: unknown[]) => forwarded);
  const service = new AdminShahinService(
    {
      find: jest.fn(async () => accounts),
      findOne: jest.fn(async ({ where }: any) => accounts.find((a) => a.id === where.id) ?? null),
    } as any,
    { find: jest.fn(async () => entries) } as any,
    { forward } as any,
  );
  return { service, forward };
}

describe("normalizeDirection", () => {
  it("believes the bank when it says which way the money went", () => {
    expect(normalizeDirection("credit", "-500")).toBe("credit");
    expect(normalizeDirection("واریز", "-500")).toBe("credit");
    expect(normalizeDirection("برداشت", "500")).toBe("debit");
    expect(normalizeDirection("DEBIT", null)).toBe("debit");
  });

  it("falls back to the sign only when the bank said nothing", () => {
    expect(normalizeDirection(null, "-500")).toBe("debit");
    expect(normalizeDirection(null, "500")).toBe("credit");
  });

  it("returns null rather than guessing", () => {
    // A wrong direction on a bank statement is worse than an empty cell.
    expect(normalizeDirection(null, null)).toBeNull();
    expect(normalizeDirection(null, "")).toBeNull();
    expect(normalizeDirection(null, "0")).toBeNull();
    expect(normalizeDirection("something else", "abc")).toBeNull();
  });
});

describe("statement parsing", () => {
  const rows = [
    { date: "1405/06/10", description: "واریز", amount: "5000000", balance: "9000000",
      trackNo: "TRK-1", type: "واریز" },
  ];

  it.each([
    ["respObject.transactions", { respObject: { transactions: rows } }],
    ["nested data.respObject.items", { data: { respObject: { items: rows } } }],
    ["respObject.records", { respObject: { records: rows } }],
    ["a bare array in respObject", { respObject: rows }],
  ])("reads the bank's %s shape", (_label, response) => {
    // The upstream is not consistent about this; one place knows all of them.
    const { service } = build();
    const parsed = service.parseStatement(response);
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ amount: "5000000", trackNo: "TRK-1", direction: "credit" });
  });

  it("returns nothing rather than throwing on an unrecognised shape", () => {
    const { service } = build();
    expect(service.parseStatement({ respObject: { unexpected: true } })).toEqual([]);
    expect(service.parseStatement(null)).toEqual([]);
  });

  it("accepts the alternative field names the bank uses", () => {
    const { service } = build();
    const [row] = service.parseStatement({
      respObject: {
        items: [{ transactionDate: "d", narration: "n", transactionAmount: "10",
                  runningBalance: "20", trackingNumber: "T" }],
      },
    });
    expect(row).toMatchObject({ date: "d", description: "n", amount: "10", balance: "20", trackNo: "T" });
  });
});

describe("AdminShahinService", () => {
  it("asks the bank for the balance instead of returning the stored figure", async () => {
    const { service, forward } = build({ respObject: { availableBalance: "7777", effectiveBalance: "8888" } });
    const out = await service.balance(1, "admin-1");
    expect(forward).toHaveBeenCalledWith(
      "/account/balance", { accountNumber: "1234567890", bankCode: "BSI" }, true, "admin-1",
    );
    expect(out.availableBalance).toBe("7777");
    // The stored 1000 must not leak through as if it were current.
    expect(out.availableBalance).not.toBe("1000");
    expect(out.fetchedAt).toBeInstanceOf(Date);
  });

  it("reports a balance the bank did not give as null", async () => {
    const { service } = build({ respObject: {} });
    const out = await service.balance(1, "a");
    expect(out.availableBalance).toBeNull();
  });

  it("404s for an account it does not have", async () => {
    const { service } = build({}, []);
    await expect(service.balance(99, "a")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses an inverted date range instead of returning an empty statement", async () => {
    // Silently returning nothing reads as "no transactions in that range".
    const { service } = build({ respObject: { transactions: [] } });
    await expect(
      service.statement(1, { from: "2026-09-10", to: "2026-09-01" }, "a"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("applies the filters the bank does not support", async () => {
    const rows = [
      { amount: "100", trackNo: "A" },
      { amount: "5000", trackNo: "B" },
      { amount: "900000", trackNo: "C" },
    ];
    const { service } = build({ respObject: { transactions: rows } });

    expect(await service.statement(1, { trackNo: "B" }, "a")).toHaveLength(1);
    expect(await service.statement(1, { minAmount: "1000" }, "a")).toHaveLength(2);
    expect(await service.statement(1, { maxAmount: "5000" }, "a")).toHaveLength(2);
    expect(await service.statement(1, { minAmount: "1000", maxAmount: "10000" }, "a")).toHaveLength(1);
  });

  it("refuses an inquiry the bank could not name an owner for", async () => {
    // A confirmation dialog showing a blank owner is worse than an error.
    const { service } = build({ respObject: {} });
    await expect(service.inquiry("123", "a")).rejects.toThrow(/INQUIRY_NO_OWNER/);
  });

  it("returns the owner the bank named", async () => {
    const { service } = build({ respObject: { ownerName: "علی رضایی", bankName: "بانک ملت" } });
    await expect(service.inquiry("123", "a")).resolves.toEqual({
      ownerName: "علی رضایی", accountNumber: "123", bankName: "بانک ملت",
    });
  });

  it("does not forward the OTP confirmation on to the bank", async () => {
    const { service, forward } = build({});
    await service.transfer(
      { method: "satna", sourceAccount: "s", destinationAccount: "d", amount: "100",
        challengeId: "c", otp: "12345" } as any,
      "admin-1",
    );
    const body = forward.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("challengeId");
    expect(body).not.toHaveProperty("otp");
    expect(body).toMatchObject({ method: "satna", amount: "100" });
  });

  it("strips the batch's refIds too — they exist for the challenge, not the bank", async () => {
    const { service, forward } = build({});
    await service.batchTransfer(
      { method: "paya", sourceAccount: "s", items: [], refIds: ["a"], challengeId: "c", otp: "1" },
      "admin-1",
    );
    const body = forward.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty("refIds");
    expect(body).not.toHaveProperty("otp");
  });
});

describe("open banking", () => {
  it("reports connected from the last call, not from wishful defaults", async () => {
    const entries = [
      { accountId: 1, statusCode: 200, createdAt: new Date("2026-09-02T10:00:00Z"), errorMessage: null },
      { accountId: 1, statusCode: 500, createdAt: new Date("2026-09-01T10:00:00Z"), errorMessage: "old" },
    ];
    const { service } = build({}, [ACCOUNT], entries);
    const [row] = await service.openBanking();
    expect(row.connected).toBe(true);
    expect(row.lastError).toBeNull();
  });

  it("surfaces the error when the last call failed", async () => {
    const entries = [
      { accountId: 1, statusCode: 502, createdAt: new Date("2026-09-02T10:00:00Z"), errorMessage: "gateway" },
    ];
    const { service } = build({}, [ACCOUNT], entries);
    const [row] = await service.openBanking();
    expect(row.connected).toBe(false);
    expect(row.lastError).toBe("gateway");
  });

  it("is not connected when the bank has never been called for the account", async () => {
    const { service } = build({}, [ACCOUNT], []);
    expect((await service.openBanking())[0].connected).toBe(false);
  });

  it("leaves scope and consent null rather than inventing them", async () => {
    // There is no upstream endpoint reporting either; a made-up expiry on a
    // banking consent screen is worse than an empty field.
    const { service } = build({}, [ACCOUNT], []);
    const [row] = await service.openBanking();
    expect(row.accessScope).toBeNull();
    expect(row.consentExpiresAt).toBeNull();
  });

  it("reports scope and consent when the bank did supply them", async () => {
    const withMeta = { ...ACCOUNT, metadata: { accessScope: "read", consentExpiresAt: "2026-12-01T00:00:00Z" } };
    const { service } = build({}, [withMeta], []);
    const [row] = await service.openBanking();
    expect(row.accessScope).toBe("read");
    expect(row.consentExpiresAt).toEqual(new Date("2026-12-01T00:00:00Z"));
  });
});
