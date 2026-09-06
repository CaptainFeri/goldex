// Central Chart.js registration + shared back-office defaults.
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  LogarithmicScale,
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import "chartjs-adapter-date-fns";

ChartJS.register(
  CategoryScale,
  LinearScale,
  // The price screen falls back to a log axis when the selected instruments
  // are decades apart; an unregistered scale throws at first render.
  LogarithmicScale,
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
);

/**
 * Chart.js cannot read CSS variables, so the theme is pushed into it.
 *
 * Called once at import and again whenever the theme changes — without the
 * second call, switching to light leaves the axes and labels drawn for a dark
 * background and the charts become unreadable.
 */
function token(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    fallback
  );
}
// Charts read left-to-right even though the panel is RTL. Chart.js leaves its
// own `rtl` flag off by default, but for text it falls back to whatever
// direction the canvas inherits from the page — so both are pinned here rather
// than left to the surrounding layout.
ChartJS.defaults.plugins.legend.rtl = false;
ChartJS.defaults.plugins.legend.textDirection = "ltr";
ChartJS.defaults.plugins.tooltip.rtl = false;
ChartJS.defaults.plugins.tooltip.textDirection = "ltr";

ChartJS.defaults.color = "#9aa4b2";
ChartJS.defaults.font.family =
  "Vazirmatn, 'Segoe UI', Tahoma, system-ui, sans-serif";
ChartJS.defaults.borderColor = "rgba(255,255,255,0.06)";

export function applyChartTheme(): void {
  ChartJS.defaults.color = token("--gx-dim", "#8a93ab");
  ChartJS.defaults.borderColor = token("--gx-grid", "rgba(255,255,255,0.06)");
  ChartJS.defaults.font.family = token(
    "--font",
    '"IRANSans", "Vazirmatn", sans-serif',
  );
}

applyChartTheme();

/** Read per-render, so a chart drawn after a theme switch uses the new grid. */
export function gridColor(): string {
  return token("--gx-grid", "rgba(255,255,255,0.06)");
}

export { ChartJS };
