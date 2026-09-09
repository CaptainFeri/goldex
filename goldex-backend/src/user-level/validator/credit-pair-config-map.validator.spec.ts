import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { CreateLevelDto } from "../dto/create-level.dto";
import { CreditEnforceModeEnum } from "../../credit/enum/credit-enforce-mode.enum";

const PAIR = "11111111-1111-4111-8111-111111111111";

function validate(creditConfigs: unknown) {
  const dto = plainToInstance(CreateLevelDto, {
    name: "Gold",
    slug: "gold",
    creditConfigs,
  });
  return { dto, errors: validateSync(dto) };
}

describe("IsCreditPairConfigMap", () => {
  it("accepts a config the order path knows how to read", () => {
    const { errors } = validate({
      [PAIR]: {
        creditMaxLeverage: 10,
        creditMarginCallPercent: 7.5,
        creditEnforceOnDrawdown: CreditEnforceModeEnum.ENFORCE,
      },
    });
    expect(errors).toHaveLength(0);
  });

  it("leaves no trace on the DTO", () => {
    // The validator used to stash its findings on the object it was handed;
    // UserLevelService spreads that object straight into a TypeORM update, so
    // the stray property became "Property ... was not found in UserLevelEntity".
    // Comparing a failing DTO against a passing one is not enough: the old
    // code stashed its findings on both. Every key has to be a declared
    // property, so a bookkeeping field of any kind fails this.
    const declared = new Set(Object.keys(new CreateLevelDto()));
    for (const input of [
      { [PAIR]: { creditMaxLeverage: 10 } },
      { [PAIR]: { creditMaxLeverage: 0 } },
      { "not-a-uuid": {} },
    ]) {
      const { dto } = validate(input);
      const undeclared = Object.keys(dto).filter(
        (key) => !declared.has(key) && dto[key as keyof CreateLevelDto] !== undefined,
      );
      expect(undeclared).toEqual([]);
    }
  });

  it("names the pair and the rule that failed", () => {
    const { errors } = validate({ [PAIR]: { creditDrawdownPercent: 150 } });
    expect(errors).toHaveLength(1);
    const message = Object.values(errors[0].constraints ?? {}).join(" ");
    expect(message).toContain(PAIR);
    expect(message).toContain("creditDrawdownPercent");
  });

  it("rejects a key that is not a price pair id", () => {
    const { errors } = validate({ "not-a-uuid": { creditMaxLeverage: 5 } });
    expect(errors).toHaveLength(1);
    expect(Object.values(errors[0].constraints ?? {}).join(" ")).toContain(
      "not a price pair id",
    );
  });

  it("rejects a misspelled rule rather than storing it unread", () => {
    const { errors } = validate({ [PAIR]: { creditMaxLevrage: 10 } });
    expect(errors).toHaveLength(1);
    expect(Object.values(errors[0].constraints ?? {}).join(" ")).toContain(
      "creditMaxLevrage",
    );
  });

  it("accepts an absent map", () => {
    expect(validate(undefined).errors).toHaveLength(0);
  });
});
