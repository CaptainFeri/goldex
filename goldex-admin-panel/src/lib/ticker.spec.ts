import { describe, expect, it } from "vitest";
import { directionOf, isGoldCategory, marqueeDuration, SECONDS_PER_ITEM } from "./ticker";

describe("directionOf", () => {
  it("reports a rise and a fall", () => {
    expect(directionOf(100, 101)).toBe("up");
    expect(directionOf(101, 100)).toBe("down");
  });

  it("reports no movement when the price is unchanged", () => {
    expect(directionOf(100, 100)).toBe("neutral");
  });

  it("shows no arrow on the first value seen", () => {
    // Nothing to compare against yet; an arrow here would be invented.
    expect(directionOf(null, 100)).toBe("neutral");
  });

  it("does not read a dropped quote as a fall", () => {
    // A null price means the feed lost the quote. Treating it as a fall to
    // zero would paint the whole strip red the moment a feed hiccups.
    expect(directionOf(100, null)).toBe("neutral");
  });

  it("handles a price returning after a gap", () => {
    expect(directionOf(null, null)).toBe("neutral");
  });
});

describe("isGoldCategory", () => {
  it("accents the desk's own product", () => {
    for (const c of ["طلا", "سکه", "نقره"]) expect(isGoldCategory(c)).toBe(true);
  });

  it("leaves currencies plain", () => {
    expect(isGoldCategory("ارز")).toBe(false);
    expect(isGoldCategory("کریپتو")).toBe(false);
  });

  it("treats a missing category as not gold", () => {
    expect(isGoldCategory(null)).toBe(false);
    expect(isGoldCategory(undefined)).toBe(false);
  });
});

describe("marqueeDuration", () => {
  it("scales with the number of instruments so the pace stays readable", () => {
    expect(marqueeDuration(4)).toBe(`${4 * SECONDS_PER_ITEM}s`);
    expect(marqueeDuration(40)).toBe(`${40 * SECONDS_PER_ITEM}s`);
  });

  it("never yields a zero-length animation", () => {
    // A 0s duration makes the track jump rather than scroll.
    expect(marqueeDuration(0)).toBe(`${SECONDS_PER_ITEM}s`);
  });
});
