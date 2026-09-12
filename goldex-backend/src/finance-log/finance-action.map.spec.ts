import { mapTransactionType } from "./finance-action.map";
import { FinanceActionEnum } from "./enum/finance-action.enum";
import { TransactionTypeEnum } from "../wallet/enum/transaction.type.enum";

describe("mapTransactionType", () => {
  // The whole point of the subscriber is that nothing slips through, so the
  // mapping has to answer for every transaction type the platform can write.
  it("maps every transaction type to a named action", () => {
    for (const type of Object.values(TransactionTypeEnum)) {
      const action = mapTransactionType(type);
      expect(Object.values(FinanceActionEnum)).toContain(action);
      expect(action).not.toBe(FinanceActionEnum.OTHER);
    }
  });

  it("maps money in and out to the plain deposit and withdrawal actions", () => {
    expect(mapTransactionType(TransactionTypeEnum.DEPOSIT)).toBe(FinanceActionEnum.DEPOSIT);
    expect(mapTransactionType(TransactionTypeEnum.WITHDRAWAL)).toBe(FinanceActionEnum.WITHDRAWAL);
  });

  it("keeps the two sides of a trade apart", () => {
    expect(mapTransactionType(TransactionTypeEnum.BUY)).toBe(FinanceActionEnum.ORDER_BUY);
    expect(mapTransactionType(TransactionTypeEnum.SELL)).toBe(FinanceActionEnum.ORDER_SELL);
  });

  it("books a fee as commission", () => {
    expect(mapTransactionType(TransactionTypeEnum.FEE)).toBe(FinanceActionEnum.COMMISSION);
  });

  it("maps the credit wallet movements onto their credit actions", () => {
    expect(mapTransactionType(TransactionTypeEnum.CREDIT_LIQUIDATION)).toBe(
      FinanceActionEnum.LIQUIDATION,
    );
    expect(mapTransactionType(TransactionTypeEnum.CREDIT_SETTLEMENT)).toBe(
      FinanceActionEnum.CREDIT_SETTLED,
    );
  });

  // A movement of an unknown kind still has to be logged — an unrecognised one
  // is precisely what an auditor needs to see.
  it("falls back to OTHER for a type it does not know", () => {
    expect(mapTransactionType("SOMETHING_NEW")).toBe(FinanceActionEnum.OTHER);
  });

  it("falls back to OTHER rather than throwing on a missing type", () => {
    expect(mapTransactionType(null)).toBe(FinanceActionEnum.OTHER);
    expect(mapTransactionType(undefined)).toBe(FinanceActionEnum.OTHER);
    expect(mapTransactionType("")).toBe(FinanceActionEnum.OTHER);
  });

  it("names every action it can return in the enum", () => {
    // Guards against a mapping that points at a string the Postgres enum,
    // generated from FinanceActionEnum, would reject.
    const named = new Set<string>(Object.values(FinanceActionEnum));
    for (const type of Object.values(TransactionTypeEnum)) {
      expect(named.has(mapTransactionType(type))).toBe(true);
    }
  });
});
