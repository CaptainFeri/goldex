import {
  creditDefaultsFromFacility,
  isCreditTradingAllowed,
  resolveCreditPairConfig,
  resolveFacilityPairConfig,
  snapshotCreditLevelDefaults,
} from "./credit-pair-config.util";
import { CreditEnforceModeEnum } from "../enum/credit-enforce-mode.enum";

const GOLD_PAIR = "11111111-1111-4111-8111-111111111111";
const USD_PAIR = "22222222-2222-4222-8222-222222222222";

describe("resolveCreditPairConfig", () => {
  const defaults = {
    creditMaxLeverage: 5,
    creditDrawdownPercent: 30,
    creditEnforceOnDrawdown: CreditEnforceModeEnum.ALERT,
    creditMarginCallPercent: 7.5,
    creditMaxParallelRequests: 3,
  };

  it("falls back to the level when the pair configures nothing", () => {
    const r = resolveCreditPairConfig(defaults, {}, GOLD_PAIR);
    expect(r.creditMaxLeverage).toBe(5);
    expect(r.creditDrawdownPercent).toBe(30);
    expect(r.creditEnforceOnDrawdown).toBe(CreditEnforceModeEnum.ALERT);
    expect(r.creditMarginCallPercent).toBe(7.5);
  });

  it("lets each pair set its own terms", () => {
    const configs = {
      [GOLD_PAIR]: { creditMaxLeverage: 10, creditMarginCallPercent: 5 },
      [USD_PAIR]: { creditMaxLeverage: 2, creditEnforceOnDrawdown: CreditEnforceModeEnum.ENFORCE },
    };
    const gold = resolveCreditPairConfig(defaults, configs, GOLD_PAIR);
    const usd = resolveCreditPairConfig(defaults, configs, USD_PAIR);

    expect(gold.creditMaxLeverage).toBe(10);
    expect(gold.creditMarginCallPercent).toBe(5);
    // Untouched rules still come from the level.
    expect(gold.creditEnforceOnDrawdown).toBe(CreditEnforceModeEnum.ALERT);

    expect(usd.creditMaxLeverage).toBe(2);
    expect(usd.creditEnforceOnDrawdown).toBe(CreditEnforceModeEnum.ENFORCE);
    expect(usd.creditMarginCallPercent).toBe(7.5);
  });

  it("treats a rule nobody set as unenforced rather than zero", () => {
    const r = resolveCreditPairConfig({}, {}, GOLD_PAIR);
    expect(r.creditMaxNotional).toBeNull();
    expect(r.creditMinTradeSize).toBeNull();
    expect(r.creditEnforceOnExpiry).toBeNull();
  });

  it("coerces the numbers Postgres hands back as strings", () => {
    const r = resolveCreditPairConfig(
      { creditDrawdownPercent: "30" as unknown as number },
      { [GOLD_PAIR]: { creditMaxLeverage: "8" as unknown as number } },
      GOLD_PAIR,
    );
    expect(r.creditDrawdownPercent).toBe(30);
    expect(r.creditMaxLeverage).toBe(8);
  });

  it("keeps an explicit false — a pair may switch credit off on its own", () => {
    const r = resolveCreditPairConfig(
      { creditTradingEnabled: true },
      { [GOLD_PAIR]: { creditTradingEnabled: false } },
      GOLD_PAIR,
    );
    expect(r.creditTradingEnabled).toBe(false);
    expect(isCreditTradingAllowed(r)).toBe(false);
  });

  it("allows credit when nothing has been configured (opt-out model)", () => {
    expect(isCreditTradingAllowed(resolveCreditPairConfig({}, {}, GOLD_PAIR))).toBe(true);
  });

  it("uses the level defaults for a pair with no entry at all", () => {
    const r = resolveCreditPairConfig(defaults, { [USD_PAIR]: { creditMaxLeverage: 2 } }, GOLD_PAIR);
    expect(r.creditMaxLeverage).toBe(5);
  });
});

describe("creditDefaultsFromFacility", () => {
  it("prefers the snapshot taken when the facility was opened", () => {
    const defaults = creditDefaultsFromFacility({
      drawdownPercent: 99,
      metadata: { creditLevelDefaults: { creditDrawdownPercent: 30 } },
    });
    expect(defaults.creditDrawdownPercent).toBe(30);
  });

  it("reads a pre-snapshot facility off its own columns", () => {
    const defaults = creditDefaultsFromFacility({
      drawdownPercent: 25,
      enforceOnDrawdown: CreditEnforceModeEnum.ENFORCE,
      maxTradeChainDepth: 4,
      maxCreditNotional: 1000,
      metadata: { maxParallelRequests: 2 },
    });
    expect(defaults.creditDrawdownPercent).toBe(25);
    expect(defaults.creditEnforceOnDrawdown).toBe(CreditEnforceModeEnum.ENFORCE);
    expect(defaults.creditMaxExecutionLevel).toBe(4);
    expect(defaults.creditMaxNotional).toBe(1000);
    expect(defaults.creditMaxParallelRequests).toBe(2);
  });
});

describe("resolveFacilityPairConfig", () => {
  it("layers the facility's per-pair configs over its snapshot", () => {
    const credit = {
      metadata: {
        creditLevelDefaults: { creditMaxLeverage: 5, creditMarginCallPercent: 7.5 },
        creditConfigs: { [GOLD_PAIR]: { creditMarginCallPercent: 4 } },
      },
    };
    expect(resolveFacilityPairConfig(credit, GOLD_PAIR).creditMarginCallPercent).toBe(4);
    expect(resolveFacilityPairConfig(credit, GOLD_PAIR).creditMaxLeverage).toBe(5);
    expect(resolveFacilityPairConfig(credit, USD_PAIR).creditMarginCallPercent).toBe(7.5);
  });
});

describe("snapshotCreditLevelDefaults", () => {
  it("freezes the level's rules as plain numbers", () => {
    const snapshot = snapshotCreditLevelDefaults({
      creditMaxLeverage: "10" as unknown as number,
      creditWarningMarginPercent: "15" as unknown as number,
      creditReduceOnlyOnWarning: false,
      creditEnforceOnExpiry: CreditEnforceModeEnum.ENFORCE,
    });
    expect(snapshot.creditMaxLeverage).toBe(10);
    expect(snapshot.creditWarningMarginPercent).toBe(15);
    expect(snapshot.creditReduceOnlyOnWarning).toBe(false);
    expect(snapshot.creditEnforceOnExpiry).toBe(CreditEnforceModeEnum.ENFORCE);
    // Rules the level never set stay unset rather than becoming 0/false.
    expect(snapshot.creditMaxNotional).toBeNull();
    expect(snapshot.creditTradingEnabled).toBeNull();
  });
});
