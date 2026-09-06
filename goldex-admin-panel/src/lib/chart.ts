// Central Chart.js registration + shared back-office defaults.
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
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
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

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

export const gridColor = "rgba(255,255,255,0.06)";

export { ChartJS };
