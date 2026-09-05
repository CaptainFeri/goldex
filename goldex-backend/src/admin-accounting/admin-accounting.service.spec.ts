import { BadRequestException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { AdminAccountingService, sideForMovement } from "./admin-accounting.service";
import {
  AccountingGranularity,
  AccountingMetric,
  CustomerType,
  VoucherCategory,
  VoucherMovement,
  VoucherSide,
  VoucherStatus,
  WalletSubset,
} from "./accounting.enums";

const AUTHOR = "11111111-1111-1111-1111-111111111111";
const REVIEWER = "22222222-2222-2222-2222-222222222222";

const voucher = (over: Record<string, unknown> = {}) => ({
  id: "v-1",
  voucherCode: "DOC-14050600001",
  customerName: "شرکت زرین تجارت",
  customerType: CustomerType.FORMAL,
  category: VoucherCategory.FEE,
  movement: VoucherMovement.DEPOSIT,
  side: VoucherSide.CREDITOR,
  symbolId: "sym-1",
  amount: "2450000000",
  walletType: "DEPOSIT",
  walletSubset: WalletSubset.CASH,
  description: "تسویه فاکتور",
  documentDate: new Date(),
  status: VoucherStatus.PENDING,
  createdBy: AUTHOR,
  createAt: new Date(),
  ...over,
});

function build(current = voucher()) {
  const state = { row: current as any };
  const vouchers = {
    findOne: jest.fn(async () => state.row),
    create: jest.fn((v) => v),
    save: jest.fn(async (v) => {
      state.row = { ...state.row, ...v, id: v.id ?? "v-1" };
      return state.row;
    }),
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      getMany: jest.fn().mockResolvedValue([]),
    })),
  };
  const ledger = {
    createQueryBuilder: jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ income: "1000", expense: "250" }),
      getMany: jest.fn().mockResolvedValue([]),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
    })),
  };
  const symbols = {
    findOne: jest.fn(async () => ({ id: "sym-1", slug: "IRR" })),
    find: jest.fn(async () => [{ id: "sym-1", slug: "IRR" }]),
  };
  return {
    service: new AdminAccountingService(ledger as any, vouchers as any, symbols as any),
    vouchers,
    state,
  };
}

const draft = (over: Record<string, unknown> = {}) =>
  ({
    movement: VoucherMovement.DEPOSIT,
    customerName: "شرکت زرین تجارت",
    customerType: CustomerType.FORMAL,
    category: VoucherCategory.FEE,
    symbolId: "sym-1",
    amount: "2450000000",
    walletType: "DEPOSIT",
    walletSubset: WalletSubset.CASH,
    description: "تسویه فاکتور",
    documentDate: new Date().toISOString(),
    ...over,
  }) as any;

describe("sideForMovement", () => {
  it("books a deposit to the customer as creditor and a withdrawal as debtor", () => {
    // A deposit increases what the platform owes; a withdrawal reduces it.
    expect(sideForMovement(VoucherMovement.DEPOSIT)).toBe(VoucherSide.CREDITOR);
    expect(sideForMovement(VoucherMovement.WITHDRAW)).toBe(VoucherSide.DEBTOR);
  });
});

describe("voucher creation", () => {
  it("derives side from movement and ignores what the client sent", async () => {
    const { service, vouchers } = build();
    await service.createVoucher(AUTHOR, draft({ movement: VoucherMovement.WITHDRAW, side: VoucherSide.CREDITOR }));
    expect(vouchers.create).toHaveBeenCalledWith(expect.objectContaining({ side: VoucherSide.DEBTOR }));
  });

  it("creates as a draft whatever status is asked for", async () => {
    // Booking is a separate, reviewed step; a client must not skip it.
    const { service, vouchers } = build();
    await service.createVoucher(AUTHOR, draft({ status: VoucherStatus.FINALIZED }));
    expect(vouchers.create).toHaveBeenCalledWith(expect.objectContaining({ status: VoucherStatus.DRAFT }));
  });

  it("records the author, not the client's claim", async () => {
    const { service, vouchers } = build();
    await service.createVoucher(AUTHOR, draft({ createdBy: REVIEWER }));
    expect(vouchers.create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: AUTHOR }));
  });

  it("refuses a non-positive amount", async () => {
    const { service } = build();
    for (const amount of ["0", "-5"]) {
      await expect(service.createVoucher(AUTHOR, draft({ amount }))).rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it("refuses an unparseable document date", async () => {
    const { service } = build();
    await expect(service.createVoucher(AUTHOR, draft({ documentDate: "not-a-date" }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});

describe("voucher review", () => {
  it("refuses to let the author book their own entry", async () => {
    // The only control this workflow has: a finance lead holds both rights and
    // could otherwise do both halves alone.
    const { service } = build(voucher({ createdBy: AUTHOR, status: VoucherStatus.PENDING }));
    await expect(service.finalizeVoucher(AUTHOR, "v-1", {})).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.rejectVoucher(AUTHOR, "v-1", {})).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("books a pending voucher for a second operator", async () => {
    const { service, state } = build(voucher({ status: VoucherStatus.PENDING }));
    await service.finalizeVoucher(REVIEWER, "v-1", { note: "بررسی شد" });
    expect(state.row.status).toBe(VoucherStatus.FINALIZED);
    expect(state.row.reviewedBy).toBe(REVIEWER);
    expect(state.row.reviewNote).toBe("بررسی شد");
  });

  it("will not book a voucher that was never submitted", async () => {
    const { service } = build(voucher({ status: VoucherStatus.DRAFT }));
    await expect(service.finalizeVoucher(REVIEWER, "v-1", {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it("will not re-book or reverse a booked voucher", async () => {
    // Finalized is terminal: a correction is a new voucher, not an edit.
    const { service } = build(voucher({ status: VoucherStatus.FINALIZED }));
    await expect(service.finalizeVoucher(REVIEWER, "v-1", {})).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.rejectVoucher(REVIEWER, "v-1", {})).rejects.toBeInstanceOf(BadRequestException);
  });

  it("will not act on a voucher that does not exist", async () => {
    const { service, vouchers } = build();
    vouchers.findOne.mockResolvedValue(null as any);
    await expect(service.finalizeVoucher(REVIEWER, "missing", {})).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe("accounting figures", () => {
  it("computes margin from income and net profit", async () => {
    const { service } = build();
    const s = await service.stats();
    expect(s.income).toBe("1000.00");
    expect(s.expense).toBe("250.00");
    expect(s.netProfit).toBe("750.00");
    expect(s.marginPercent).toBe(75);
    expect(s.unit).toBe("IRR");
  });

  it("returns a null margin rather than dividing by zero income", async () => {
    const { service } = build();
    (service as any).ledger.createQueryBuilder = jest.fn(() => ({
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      getRawOne: jest.fn().mockResolvedValue({ income: "0", expense: "0" }),
    }));
    expect((await service.stats()).marginPercent).toBeNull();
  });

  it("sends no currency with the margin metric", async () => {
    // A ratio is not money; IRR here would have the panel render it as toman.
    const { service } = build();
    const margin = await service.series({
      metric: AccountingMetric.MARGIN,
      granularity: AccountingGranularity.MONTH,
      year: 1405,
    });
    expect(margin.unit).toBeNull();
    expect(margin.points).toHaveLength(12);
  });

  it("buckets a day granularity across the Jalali month's real length", async () => {
    const { service } = build();
    // Farvardin has 31 days; Aban has 30. A fixed 30 would drop one.
    const farvardin = await service.series({
      metric: AccountingMetric.INCOME,
      granularity: AccountingGranularity.DAY,
      year: 1405,
      month: 1,
    });
    const aban = await service.series({
      metric: AccountingMetric.INCOME,
      granularity: AccountingGranularity.DAY,
      year: 1405,
      month: 8,
    });
    expect(farvardin.points).toHaveLength(31);
    expect(aban.points).toHaveLength(30);
  });

  it("buckets an hour granularity into twenty-four", async () => {
    const { service } = build();
    const hours = await service.series({
      metric: AccountingMetric.EXPENSE,
      granularity: AccountingGranularity.HOUR,
      year: 1405,
      month: 1,
      day: 1,
    });
    expect(hours.points).toHaveLength(24);
    expect(hours.points[0].label).toBe("00");
  });
});
