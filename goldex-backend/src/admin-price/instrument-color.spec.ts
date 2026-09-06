import { fallbackColor, instrumentColor, isHexColor } from "./instrument-color";

describe("isHexColor", () => {
  it("accepts the three CSS hex lengths", () => {
    expect(isHexColor("#abc")).toBe(true);
    expect(isHexColor("#d4af37")).toBe(true);
    expect(isHexColor("#d4af37ff")).toBe(true);
  });

  it("rejects anything that is not one", () => {
    for (const bad of ["", "d4af37", "#zzzzzz", "#abcd", "red", "rgb(1,2,3)", null, undefined]) {
      expect(isHexColor(bad as any)).toBe(false);
    }
  });
});

describe("fallbackColor", () => {
  it("is stable for a key — a series that changed colour reads as a new series", () => {
    expect(fallbackColor("XAU")).toBe(fallbackColor("XAU"));
  });

  it("spreads different keys across the palette", () => {
    const keys = ["XAU", "USD", "EUR", "AED", "BTC", "USDT", "ETH", "TRY"];
    expect(new Set(keys.map(fallbackColor)).size).toBeGreaterThan(1);
  });

  it("always returns a usable hex colour", () => {
    for (const key of ["", "a", "very-long-symbol-slug"]) {
      expect(isHexColor(fallbackColor(key))).toBe(true);
    }
  });
});

describe("instrumentColor", () => {
  it("prefers what the desk configured", () => {
    expect(instrumentColor("#123456", "XAU")).toBe("#123456");
  });

  it("trims a stored value rather than emitting a broken style", () => {
    expect(instrumentColor("  #123456 ", "XAU")).toBe("#123456");
  });

  it("falls back when nothing is stored", () => {
    expect(instrumentColor(null, "XAU")).toBe(fallbackColor("XAU"));
  });

  it("ignores a stored value that is not a colour", () => {
    // It would reach the panel as an inline style and render as whatever the
    // browser made of it.
    expect(instrumentColor("javascript:alert(1)", "XAU")).toBe(fallbackColor("XAU"));
  });
});
