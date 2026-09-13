import { BadRequestException } from "@nestjs/common";
import Decimal from "decimal.js";
import { WarehouseRequestService } from "./warehouse-request.service";
import { computeNetWeight } from "../constants/warehouse.constants";

/**
 * Intake arithmetic: what a delivery is worth, and how it is shelved.
 *
 * These drive the private helpers directly rather than through a mocked
 * query runner. The rule they protect — the wallet is credited with the
 * weight the admin confirmed, never the weight the user declared — is
 * arithmetic, and testing it through four layers of transaction mock would
 * test the mock.
 */
const service = () =>
  Reflect.construct(WarehouseRequestService, Array(10).fill({})) as WarehouseRequestService;
const resolve = (data: any, declared: number) =>
  (service() as any).resolveIntakeParts(data, new Decimal(declared)) as { netWeight: Decimal }[];
const total = (parts: { netWeight: Decimal }[]) =>
  parts.reduce((sum, part) => sum.plus(part.netWeight), new Decimal(0));

describe("net weight from the scale", () => {
  it("re-derives net weight from apparent weight and fineness, ignoring the declaration", () => {
    // The user said 100g. 100g apparent at 720 fineness is 96g net of 750
    // gold, and 96 is what is actually in the vault.
    const parts = resolve({ apparentWeight: 100, ayar: 720 }, 100);
    expect(total(parts).toString()).toBe("96");
  });

  it("falls back to the declared weight when nothing was measured", () => {
    // Nothing to re-derive from; the request's own figure is all there is.
    expect(total(resolve({}, 100)).toString()).toBe("100");
  });

  it("prefers the measured figure over a net weight the admin also typed", () => {
    const parts = resolve({ parts: [{ apparentWeight: 100, ayar: 720, pureWeight: 100 }] }, 100);
    expect(total(parts).toString()).toBe("96");
  });

  it("refuses a package that carries no usable weight at all", () => {
    expect(() => resolve({ parts: [{ ang: 1 }] }, 100)).toThrow(BadRequestException);
  });

  it("refuses a package weighed at zero fineness", () => {
    // (apparent x 0) / 750 is zero, which is not a package.
    expect(() => resolve({ parts: [{ apparentWeight: 50, ayar: 0 }] }, 100)).toThrow(BadRequestException);
  });
});

describe("splitting a delivery across packages", () => {
  it("credits the sum of the parts, not the declared weight", () => {
    // 100g declared, shelved as 40 + 56 = 96g net.
    const parts = resolve(
      { parts: [{ apparentWeight: 50, ayar: 600 }, { apparentWeight: 70, ayar: 600 }] },
      100,
    );
    expect(parts).toHaveLength(2);
    expect(total(parts).toString()).toBe("96");
  });

  it("treats a delivery with no parts as a single package", () => {
    expect(resolve({ apparentWeight: 100, ayar: 750 }, 100)).toHaveLength(1);
  });
});

describe("mass conservation at intake", () => {
  const assert = (data: any, parts: number[], wastage: number) =>
    (service() as any).assertIntakeMassConserved(
      data,
      parts.map((weight) => ({ netWeight: new Decimal(weight) })),
      new Decimal(wastage),
    );

  it("accepts parts plus wastage adding up to the consignment", () => {
    // 100g apparent at 750 is 100g net: 60 + 39.5 + 0.5 wastage.
    expect(() => assert({ apparentWeight: 100, ayar: 750, parts: [{}, {}] }, [60, 39.5], 0.5)).not.toThrow();
  });

  it("refuses parts that do not add up to the consignment", () => {
    // 8g unaccounted for is metal that went somewhere unrecorded.
    expect(() => assert({ apparentWeight: 100, ayar: 750, parts: [{}, {}] }, [60, 32], 0)).toThrow(
      BadRequestException,
    );
  });

  it("forgives a difference inside the tolerance threshold", () => {
    // Roadmap §4: under 0.05g is zero.
    expect(() => assert({ apparentWeight: 100, ayar: 750, parts: [{}] }, [99.98], 0)).not.toThrow();
  });

  it("skips the check when the consignment was never weighed as a whole", () => {
    // No parent figure means nothing to conserve against.
    expect(() => assert({ parts: [{}, {}] }, [60, 32], 0)).not.toThrow();
  });
});

describe("completing a deposit without weighing it", () => {
  it("is refused, so the declared weight can never be the credit basis", () => {
    // This path used to credit request.weight while confirm-material credited
    // the scale reading, making the same deposit worth 100g or 96g depending
    // on which button the admin pressed.
    return expect((service() as any).processInputCompletion()).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("computeNetWeight", () => {
  it("is the roadmap formula: (apparent x fineness) / 750", () => {
    expect(computeNetWeight(100, 720)).toBe(96);
    expect(computeNetWeight(100, 750)).toBe(100);
    expect(computeNetWeight(50, 900)).toBe(60);
  });
});
