import { bucketStarts, buildWindow, carryForward, parseSlugs } from "./history-buckets";

describe("buildWindow", () => {
  it("covers the whole requested span, including spans that do not divide evenly", () => {
    // 1 hour over 7 points is 514.28s a bucket. Rounding the width down would
    // leave the window 14 seconds short of the hour that was asked for.
    for (const [hours, points] of [
      [24, 30],
      [1, 7],
      [3, 11],
      [720, 499],
    ] as const) {
      const w = buildWindow(1_000_000_000_000, hours, points);
      expect(w.toMs - w.fromMs).toBeGreaterThanOrEqual(hours * 3_600_000);
    }
  });

  it("ends at now, so the last bucket is the current one", () => {
    const now = 1_000_000_000_000;
    expect(buildWindow(now, 6, 12).toMs).toBe(now);
  });

  it("keeps the bucket width a whole number of seconds", () => {
    // Reported to the client as `bucketSeconds` and handed to Postgres as a
    // divisor; a fractional width makes those two disagree.
    for (const [hours, points] of [
      [24, 30],
      [1, 7],
      [720, 500],
      [1, 2],
    ] as const) {
      const w = buildWindow(1_700_000_000_000, hours, points);
      expect(w.widthMs % 1000).toBe(0);
    }
  });

  it("never collapses to a zero-width bucket", () => {
    // 1 hour over 500 points is 7.2s; the floor is what stops a pathological
    // request from producing buckets narrower than a second.
    expect(buildWindow(0, 1, 5000).widthMs).toBeGreaterThanOrEqual(1000);
  });
});

describe("bucketStarts", () => {
  it("returns one ascending start per point", () => {
    const w = buildWindow(1_700_000_000_000, 2, 4);
    const starts = bucketStarts(w);
    expect(starts).toHaveLength(4);
    expect(starts[0]).toBe(w.fromMs);
    expect(starts[3]).toBe(w.fromMs + 3 * w.widthMs);
  });
});

describe("carryForward", () => {
  it("holds the last reported price across a gap", () => {
    expect(carryForward([null, 10, null, null, 12])).toEqual([null, 10, 10, 10, 12]);
  });

  it("leaves buckets before the first reading null, not zero", () => {
    // Drawing an unknown price as zero is how a chart lies about a feed outage.
    expect(carryForward([null, null, 5])).toEqual([null, null, 5]);
  });

  it("starts from the seed when one is given", () => {
    expect(carryForward([null, null, 7], 3)).toEqual([3, 3, 7]);
  });

  it("does not mutate its input", () => {
    const input = [null, 4, null];
    carryForward(input);
    expect(input).toEqual([null, 4, null]);
  });

  it("treats zero as a real value, not a gap", () => {
    expect(carryForward([0, null, 5])).toEqual([0, 0, 5]);
  });
});

describe("parseSlugs", () => {
  it("splits, trims and drops blanks", () => {
    expect(parseSlugs(" XAU , USD ,, EUR ")).toEqual(["XAU", "USD", "EUR"]);
  });

  it("de-duplicates while keeping the requested order", () => {
    expect(parseSlugs("USD,XAU,USD")).toEqual(["USD", "XAU"]);
  });

  it("returns nothing for an empty string", () => {
    expect(parseSlugs("")).toEqual([]);
    expect(parseSlugs("  , ,")).toEqual([]);
  });
});
