import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar } from "react-chartjs-2";
import { api, unwrap, apiError } from "../api/client";
import { Card, Stat, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { fmtNum, fmtDate, fmtYear } from "../lib/format";
import { fmtBySymbol } from "../lib/money";
import { gridColor } from "../lib/chart";
import { downloadExport, stampedName } from "../lib/download";
import type {
  AccountingGranularity,
  AccountingLedgerRow,
  AccountingMetric,
  AccountingSeries,
  AccountingStats,
  Paginated,
} from "../api/types";

const METRICS: { value: AccountingMetric; label: string }[] = [
  { value: "income", label: "درآمد" },
  { value: "expense", label: "هزینه" },
  { value: "profit", label: "سود خالص" },
  { value: "margin", label: "حاشیه سود" },
];

const metricLabel = (m: AccountingMetric) => METRICS.find((x) => x.value === m)?.label ?? m;

/**
 * Where the chart is drilled to.
 *
 * The three levels are the API's three granularities, and each is reached by
 * clicking a bar: year → month → day. Keeping the whole position in one object
 * makes "go back one level" a single assignment rather than three.
 */
type Drill = { granularity: AccountingGranularity; year?: number; month?: number; day?: number };

/** A margin figure is a percentage; everything else is money in `unit`. */
function fmtMetric(value: string, metric: AccountingMetric, unit: string | null) {
  return metric === "margin" ? `${fmtNum(value, 1)}٪` : fmtBySymbol(value, unit, { digits: 0 });
}

export default function AccountingPage() {
  const [metric, setMetric] = useState<AccountingMetric>("profit");
  const [drill, setDrill] = useState<Drill>({ granularity: "month" });
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // Ledger filters, applied on submit rather than on every keystroke.
  const [form, setForm] = useState({ q: "", minAmount: "", maxAmount: "" });
  const [applied, setApplied] = useState<Record<string, unknown>>({});
  const [page, setPage] = useState(1);

  const stats = useQuery({
    queryKey: ["acc-stats"],
    queryFn: async () => unwrap<AccountingStats>((await api.get("/admin/accounting/stats")).data),
  });

  const series = useQuery({
    queryKey: ["acc-series", metric, drill],
    queryFn: async () =>
      unwrap<AccountingSeries>(
        (await api.get("/admin/accounting/series", { params: { metric, ...drill } })).data,
      ),
  });

  /**
   * The chart's position also filters the ledger.
   *
   * Drilling into مرداد and then the 12th should leave the table showing that
   * day's rows — the API takes the same Jalali year/month/day, so the two
   * panels stay one view of one period instead of two that can disagree.
   */
  const period = useMemo(
    () => ({
      ...(drill.year !== undefined && { year: drill.year }),
      ...(drill.month !== undefined && { month: drill.month }),
      ...(drill.day !== undefined && { day: drill.day }),
    }),
    [drill],
  );

  const ledger = useQuery({
    queryKey: ["acc-ledger", applied, period, page],
    queryFn: async () =>
      unwrap<Paginated<AccountingLedgerRow>>(
        (await api.get("/admin/accounting/ledger", { params: { ...applied, ...period, page, pageSize: 20 } })).data,
      ),
  });

  const s = series.data;
  const chart = useMemo(() => {
    if (!s) return null;
    return {
      labels: s.points.map((p) => p.label),
      datasets: [
        {
          label: metricLabel(s.metric),
          data: s.points.map((p) => Number(p.value)),
          backgroundColor: "#d4af37",
          borderRadius: 3,
        },
      ],
    };
  }, [s]);

  /**
   * Descend one level on click.
   *
   * The bar's index is its position in the Jalali period, so it maps directly
   * to the month or day number the next level needs. Hour is the floor.
   */
  function drillInto(index: number) {
    if (!s) return;
    if (s.granularity === "month") setDrill({ granularity: "day", year: pickYear(s), month: index + 1 });
    else if (s.granularity === "day") setDrill({ ...drill, granularity: "hour", day: index + 1 });
  }

  /** The year the current series covers, taken from a bucket key like `1405/05`. */
  function pickYear(sr: AccountingSeries): number | undefined {
    const key = sr.points[0]?.key ?? "";
    const year = Number(key.split("/")[0]);
    return Number.isFinite(year) ? year : undefined;
  }

  const levelLabel =
    drill.granularity === "month" ? "ماهانه" : drill.granularity === "day" ? "روزانه" : "ساعتی";

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      await downloadExport("/admin/accounting/ledger/export", { ...applied, ...period }, stampedName("accounting-ledger"));
    } catch (err) {
      setExportError(apiError(err));
    } finally {
      setExporting(false);
    }
  }

  const rows = ledger.data?.items ?? [];
  const totalPages = ledger.data?.totalPages ?? 1;
  const st = stats.data;

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        {/*
          The cards report the ledger as a whole and select what the chart
          plots. Margin is a percentage, so it is the one card without a
          currency — the API sends no unit for it either.
        */}
        {(
          [
            ["income", "درآمد", st ? fmtBySymbol(st.income, st.unit, { digits: 0 }) : "…"],
            ["expense", "هزینه", st ? fmtBySymbol(st.expense, st.unit, { digits: 0 }) : "…"],
            ["profit", "سود خالص", st ? fmtBySymbol(st.netProfit, st.unit, { digits: 0 }) : "…"],
            [
              "margin",
              "حاشیه سود",
              st ? (st.marginPercent === null ? "—" : `${fmtNum(st.marginPercent, 1)}٪`) : "…",
            ],
          ] as [AccountingMetric, string, string][]
        ).map(([key, label, value]) => (
          <div
            key={key}
            role="button"
            tabIndex={0}
            onClick={() => setMetric(key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setMetric(key);
            }}
            style={{
              cursor: "pointer",
              outline: metric === key ? "1px solid var(--gold)" : undefined,
              borderRadius: "var(--radius)",
            }}
          >
            <Stat
              label={label}
              value={value}
              sub={key === "margin" && st?.marginPercent === null ? "درآمدی ثبت نشده" : undefined}
            />
          </div>
        ))}
      </div>

      <Card
        title={`${metricLabel(metric)} — نمای ${levelLabel}`}
        action={
          <div className="row" style={{ gap: 8 }}>
            {drill.granularity !== "month" && (
              <button
                className="btn sm ghost"
                onClick={() =>
                  setDrill(
                    drill.granularity === "hour"
                      ? { granularity: "day", year: drill.year, month: drill.month }
                      : { granularity: "month", year: drill.year },
                  )
                }
              >
                ← بازگشت
              </button>
            )}
            {drill.granularity !== "hour" && (
              <span className="muted" style={{ fontSize: 11 }}>
                برای جزئیات روی ستون کلیک کنید
              </span>
            )}
          </div>
        }
      >
        {series.isLoading ? (
          <Loading />
        ) : series.isError ? (
          <ErrorState message={apiError(series.error)} />
        ) : !chart ? (
          <Empty />
        ) : (
          <div className="chart-box">
            <Bar
              data={chart}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                onClick: (_e, els) => {
                  if (els.length > 0) drillInto(els[0].index);
                },
                scales: { x: { grid: { color: gridColor } }, y: { grid: { color: gridColor } } },
                plugins: {
                  legend: { display: false },
                  tooltip: {
                    callbacks: {
                      label: (i: any) =>
                        fmtMetric(String(i.parsed.y), metric, s?.unit ?? null),
                    },
                  },
                },
              }}
            />
          </div>
        )}
      </Card>

      <Card
        title={
          drill.month
            ? `دفتر سیستم — ${fmtYear(drill.year)}/${fmtNum(drill.month)}${drill.day ? `/${fmtNum(drill.day)}` : ""}`
            : "دفتر سیستم"
        }
        action={
          <button className="btn sm" disabled={exporting} onClick={onExport}>
            {exporting ? <span className="spin" /> : "خروجی اکسل"}
          </button>
        }
      >
        <div className="toolbar" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
          <div className="field" style={{ margin: 0, minWidth: 180 }}>
            <label>جستجو در شرح</label>
            <input
              className="input"
              value={form.q}
              onChange={(e) => setForm({ ...form, q: e.target.value })}
            />
          </div>
          <div className="field" style={{ margin: 0, minWidth: 140 }}>
            <label>حداقل مبلغ</label>
            <input
              className="input mono"
              dir="ltr"
              value={form.minAmount}
              onChange={(e) => setForm({ ...form, minAmount: e.target.value })}
            />
          </div>
          <div className="field" style={{ margin: 0, minWidth: 140 }}>
            <label>حداکثر مبلغ</label>
            <input
              className="input mono"
              dir="ltr"
              value={form.maxAmount}
              onChange={(e) => setForm({ ...form, maxAmount: e.target.value })}
            />
          </div>
          <button
            className="btn primary"
            onClick={() => {
              // The amount bounds are on the magnitude, so an operator asking
              // for "over ten million" gets both directions, as the API does.
              const next: Record<string, unknown> = {};
              if (form.q) next.q = form.q;
              if (form.minAmount) next.minAmount = form.minAmount;
              if (form.maxAmount) next.maxAmount = form.maxAmount;
              setApplied(next);
              setPage(1);
            }}
          >
            اعمال فیلتر
          </button>
        </div>

        {exportError && <div className="error-text" style={{ marginBottom: 8 }}>{exportError}</div>}

        {ledger.isLoading ? (
          <Loading />
        ) : ledger.isError ? (
          <ErrorState message={apiError(ledger.error)} />
        ) : rows.length === 0 ? (
          <Empty label="ردیفی با این فیلتر نیست" />
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>شناسه</th><th>نوع</th><th>شرح</th><th>مبلغ</th>
                    <th>تأمین‌کننده</th><th>تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const negative = Number(r.amount) < 0;
                    return (
                      <tr key={r.id}>
                        <td className="mono" style={{ fontSize: 12 }}>{r.id.slice(0, 8)}</td>
                        <td><Badge kind={negative ? "red" : "green"}>{r.type}</Badge></td>
                        <td style={{ whiteSpace: "normal", maxWidth: 320 }}>{r.description || "—"}</td>
                        {/*
                          The sign is the direction, so it is kept and coloured
                          rather than shown as a magnitude — a ledger that hid
                          which way money moved would be unreadable.
                        */}
                        <td
                          className="mono"
                          style={{ color: negative ? "var(--red)" : "var(--green)" }}
                        >
                          {fmtBySymbol(r.amount, r.unit, { digits: 0 })}
                        </td>
                        <td>{r.providerKey || "—"}</td>
                        <td style={{ fontSize: 12 }}>{fmtDate(r.date)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="row" style={{ justifyContent: "center", gap: 10, marginTop: 12 }}>
                <button className="btn sm ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                  قبلی
                </button>
                <span className="muted" style={{ fontSize: 12 }}>
                  صفحه {fmtNum(page)} از {fmtNum(totalPages)}
                </span>
                <button className="btn sm ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                  بعدی
                </button>
              </div>
            )}
          </>
        )}
      </Card>
    </>
  );
}
