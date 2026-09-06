import { describe, expect, it, beforeEach, vi } from "vitest";
import { persistTheme, storedTheme } from "./theme";

/**
 * The theme is read before React mounts, so a throwing `localStorage` — a
 * private window, or a browser set to block site data — must produce a usable
 * default rather than a blank page.
 */
describe("storedTheme", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("defaults to dark when nothing is stored", () => {
    vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => undefined });
    expect(storedTheme()).toBe("dark");
  });

  it("returns a stored choice", () => {
    vi.stubGlobal("localStorage", { getItem: () => "light", setItem: () => undefined });
    expect(storedTheme()).toBe("light");
  });

  it("ignores a stored value that is not a theme", () => {
    // Someone else's key, or a value from an older version.
    vi.stubGlobal("localStorage", { getItem: () => "solarized", setItem: () => undefined });
    expect(storedTheme()).toBe("dark");
  });

  it("falls back to dark when storage throws", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => undefined,
    });
    expect(storedTheme()).toBe("dark");
  });
});

describe("persistTheme", () => {
  it("does not throw when storage refuses the write", () => {
    // A theme that does not survive a reload beats a crash on every toggle.
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => { throw new Error("quota"); },
    });
    expect(() => persistTheme("light")).not.toThrow();
  });
});
