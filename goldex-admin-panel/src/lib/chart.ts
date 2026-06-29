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

ChartJS.defaults.color = "#9aa4b2";
ChartJS.defaults.font.family =
  "Vazirmatn, 'Segoe UI', Tahoma, system-ui, sans-serif";
ChartJS.defaults.borderColor = "rgba(255,255,255,0.06)";

export const gridColor = "rgba(255,255,255,0.06)";

export { ChartJS };
