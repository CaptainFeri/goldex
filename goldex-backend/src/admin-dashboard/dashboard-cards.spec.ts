import { AdminDashboardService } from "./admin-dashboard.service";
import {
  DashboardMetric,
  DashboardVolumeCategory,
  DashboardWithdrawChannel,
} from "./dashboard.enums";
import { OrderTypeEnum } from "../order/enum/order.type.enum";
import { KycStatusEnum } from "../baseinfo/enum/kycStatus.enum";
import { PacketStatusEnum } from "../warehouse/enum/packet-status.enum";
import { WithdrawStatusEnum } from "../withdraw/enum/withdraw-status.enum";

/**
 * Built from the prototype: the cards are query composition, and wiring a
 * database in would test TypeORM rather than the rules being asserted here.
 */
function service(over: Record<string, any> = {}): any {
  const svc = Object.create(AdminDashboardService.prototype);
  Object.assign(svc, over);
  return svc;
}

describe("filter normalisation", () => {
  const svc = service();

  it("keeps a category the volume card offers", () => {
    expect(svc.normalizeFilter(DashboardMetric.VOLUME, "material")).toBe("material");
  });

  it("drops a value the metric does not offer, rather than erroring", () => {
    // A stale bookmark, or a filter left selected while the metric changed.
    expect(svc.normalizeFilter(DashboardMetric.VOLUME, "warehouse-7")).toBeUndefined();
    expect(svc.normalizeFilter(DashboardMetric.TRADES, "material")).toBeUndefined();
  });

  it("drops any filter on a metric that has none", () => {
    expect(svc.normalizeFilter(DashboardMetric.PROFIT, "anything")).toBeUndefined();
    expect(svc.normalizeFilter(DashboardMetric.USERS, "anything")).toBeUndefined();
  });

  it("passes opaque ids through, since only the query can judge them", () => {
    expect(svc.normalizeFilter(DashboardMetric.INVENTORY, "wh-1")).toBe("wh-1");
    expect(svc.normalizeFilter(DashboardMetric.CREDITS, "sym-1")).toBe("sym-1");
    expect(svc.normalizeFilter(DashboardMetric.PROVIDERS, "pair-1")).toBe("pair-1");
  });
});

describe("card filters", () => {
  it("offers the four symbol categories on the volume card", async () => {
    const options = await service().filtersFor(DashboardMetric.VOLUME);
    expect(options.map((o: any) => o.value)).toEqual(Object.values(DashboardVolumeCategory));
  });

  it("offers the three withdrawal channels, EM among them", async () => {
    const options = await service().filtersFor(DashboardMetric.WITHDRAWALS);
    expect(options.map((o: any) => o.value)).toEqual(Object.values(DashboardWithdrawChannel));
    expect(options.map((o: any) => o.value)).toContain(DashboardWithdrawChannel.EM);
  });

  it("offers the three order types on the trades card", async () => {
    const options = await service().filtersFor(DashboardMetric.TRADES);
    expect(options.map((o: any) => o.value).sort()).toEqual(
      Object.values(OrderTypeEnum).sort()
    );
  });

  it("offers nothing for a metric with no sub-filter", async () => {
    expect(await service().filtersFor(DashboardMetric.PROFIT)).toEqual([]);
    expect(await service().filtersFor(DashboardMetric.USERS)).toEqual([]);
  });

  it("reads warehouses from the database rather than naming them in code", async () => {
    const svc = service({
      warehouses: { find: jest.fn().mockResolvedValue([{ id: "w1", name: "انبار مرکزی" }]) },
    });
    expect(await svc.filtersFor(DashboardMetric.INVENTORY)).toEqual([
      { value: "w1", label: "انبار مرکزی" },
    ]);
  });
});

describe("card figures", () => {
  it("counts users as active, blocked and under KYC review", async () => {
    const users = { count: jest.fn().mockResolvedValueOnce(90).mockResolvedValueOnce(10).mockResolvedValue(4) };
    const kyc = { count: jest.fn().mockResolvedValue(7) };
    const card = await service({ users, kyc }).cardBody(DashboardMetric.USERS);

    expect(card.stats.map((s: any) => [s.label, s.value])).toEqual([
      ["حساب‌های فعال", "90"],
      ["حساب‌های مسدود", "10"],
      ["در حین بررسی", "7"],
    ]);
    // The queue is a KYC state, not a user column.
    expect(kyc.count).toHaveBeenCalledWith({ where: { status: KycStatusEnum.PENDING } });
  });

  it("reports sell, buy and profit volume for the chosen category", async () => {
    const orderValue = jest
      .fn()
      .mockResolvedValueOnce(500)   // sell
      .mockResolvedValueOnce(300)   // buy
      .mockResolvedValue(800);      // window totals for the delta
    const svc = service({ orderValue, ledgerSum: jest.fn().mockResolvedValue(42) });

    const card = await svc.cardBody(DashboardMetric.VOLUME, DashboardVolumeCategory.MATERIAL);
    expect(card.stats.map((s: any) => s.label)).toEqual([
      "حجم کل فروش",
      "حجم کل خرید",
      "حجم سود",
    ]);
    expect(card.stats[0].value).toBe("500.00");
    expect(card.label).toContain("فلزات");
    // Every figure is Rial: a category spans several symbols, and grams of
    // gold added to coins is not a total.
    expect(card.stats.every((s: any) => s.unit === "IRR")).toBe(true);
  });

  it("splits profit into today, the month, and gross", async () => {
    const svc = service({
      sumLedger: jest.fn().mockResolvedValueOnce(10).mockResolvedValueOnce(200).mockResolvedValue(150),
      grossLedger: jest.fn().mockResolvedValue(260),
    });
    const card = await svc.cardBody(DashboardMetric.PROFIT);
    expect(card.stats.map((s: any) => [s.label, s.value])).toEqual([
      ["سود خالص روز", "10.00"],
      ["سود خالص ماه", "200.00"],
      ["سود خام", "260.00"],
    ]);
  });

  it("maps the EM channel onto the p2p withdrawals it is stored as", async () => {
    const withdrawCount = jest.fn().mockResolvedValue(3);
    const withdrawSum = jest.fn().mockResolvedValue(1000);
    const withdrawSumBetween = jest.fn().mockResolvedValue(2000);
    const svc = service({ withdrawCount, withdrawSum, withdrawSumBetween });

    const card = await svc.cardBody(DashboardMetric.WITHDRAWALS, DashboardWithdrawChannel.EM);
    expect(withdrawCount).toHaveBeenCalledWith(WithdrawStatusEnum.PENDING, "p2p");
    expect(card.stats.map((s: any) => s.label)).toEqual([
      "تعداد در انتظار",
      "مبلغ در انتظار",
      "مبلغ انجام‌شده",
    ]);
  });

  it("counts providers as total, active and inactive for one pair", async () => {
    const svc = service({
      providerKeysForPair: jest.fn().mockResolvedValue(["a", "b"]),
      providers: {
        find: jest.fn().mockResolvedValue([
          { key: "a", active: true },
          { key: "b", active: false },
          { key: "c", active: true },
        ]),
      },
    });
    const card = await svc.cardBody(DashboardMetric.PROVIDERS, "pair-1");
    // "c" is not mapped to the pair, so it is not this card's business.
    expect(card.stats.map((s: any) => s.value)).toEqual(["2", "1", "1"]);
  });

  it("counts trades done and rejected today against the week", async () => {
    const orderCount = jest
      .fn()
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(80)
      .mockResolvedValue(60);
    const card = await service({ orderCount }).cardBody(
      DashboardMetric.TRADES,
      OrderTypeEnum.MARKET
    );
    expect(card.stats.map((s: any) => s.value)).toEqual(["12", "3", "80"]);
    expect(card.deltaPercent).toBeCloseTo(33.3, 0);
  });

  it("counts collateral holders once, however many credits they hold", async () => {
    const rows = [
      { userId: "u1", collateralAmount: 10, initialCollateralValue: 100, currentCollateralValue: 80 },
      { userId: "u1", collateralAmount: 5, initialCollateralValue: 50, currentCollateralValue: 60 },
      { userId: "u2", collateralAmount: 2, initialCollateralValue: 20, currentCollateralValue: 20 },
    ];
    const svc = service({
      collateralRows: jest.fn().mockResolvedValue(rows),
      symbols: { findOne: jest.fn().mockResolvedValue({ slug: "XAU" }) },
    });
    const card = await svc.cardBody(DashboardMetric.CREDITS, "sym-1");
    expect(card.stats[0].value).toBe("2");
    expect(card.stats[1].value).toBe("17.0000");
    // Only the downside counts: the line that gained does not net off the loss.
    expect(card.stats[2].value).toBe("20.00");
  });

  it("reports inventory as counts with weight as the hint", async () => {
    const packetTotals = jest
      .fn()
      .mockResolvedValueOnce({ count: 120, weight: 4500.5 })
      .mockResolvedValueOnce({ count: 8, weight: 300.25 })
      .mockResolvedValueOnce({ count: 2, weight: 60 });
    const svc = service({
      packetTotals,
      warehouses: { findOne: jest.fn().mockResolvedValue({ name: "انبار مرکزی" }) },
    });
    const card = await svc.cardBody(DashboardMetric.INVENTORY, "w1");
    expect(card.stats.map((s: any) => [s.value, s.hint])).toEqual([
      ["120", "4500.500 گرم"],
      ["8", "300.250 گرم"],
      ["2", "60.000 گرم"],
    ]);
    expect(packetTotals).toHaveBeenNthCalledWith(2, "w1", { status: PacketStatusEnum.PENDING });
    expect(packetTotals).toHaveBeenNthCalledWith(3, "w1", { orphan: true });
  });
});
