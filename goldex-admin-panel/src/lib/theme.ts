import { applyChartTheme } from "./chart";

export type Theme = "dark" | "light";

const KEY = "goldex_theme";

/**
 * The theme lives as a class on <html>, matching how ui-parszargar does it, so
 * the token blocks in index.css can override each other by specificity.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.remove("theme-dark", "theme-light");
  root.classList.add(`theme-${theme}`);
  // Chart.js holds its own copy of the colours; without this the axes stay
  // drawn for the previous theme and light mode is unreadable.
  applyChartTheme();
}

export function storedTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light") return saved;
  } catch {
    // Private windows and blocked site data both throw here; the default is
    // a perfectly good answer.
  }
  return "dark";
}

export function persistTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // A theme that does not survive a reload is better than a crash.
  }
}
