import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line } from "react-chartjs-2";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { colorFor, fmtNum, pairLabel } from "../lib/format";
import { gridColor } from "../lib/chart";
import type { CompareResponse, PricePair, HistoryResponse, CurrentProviderResponse, ProviderSnapshotItem } from "../api/types";

const MIN = 60_000;
const HOUR = 60 * MIN;
const RANGES: { key: string; label: string; ms?: number }[] = [
  { key: "15m", label: "۱۵ دقیقه", ms: 15 * MIN },
  { key: "1h", label: "۱ ساعت", ms: HOUR },
  { key: "6h", label: "۶ ساعت", ms: 6 * HOUR },
  { key: "24h", label: "۲۴ ساعت", ms: 24 * HOUR },
  { key: "7d", label: "۷ روز", ms: 7 * 24 * HOUR },
  { key: "all", label: "همه" },
];

type Metric = "buyPrice" | "sellPrice" | "spread";
const METRIC_LABEL: Record<Metric, string> = {
  buyPrice: "قیمت خرید",
  sellPrice: "قیمت فروش",
  spread: "اسپرد",
};

const TABS = [
  { key: "compare", label: "مقایسه تأمین‌کنندگان" },
  { key: "history", label: "تاریخچه یک آیتم" },
  { key: "current", label: "اسنپ‌شات فعلی" },
];

export default function ComparePage() {
  const [tab, setTab] = useState<"compare" | "history" | "current">("compare");
  return (
    <Card
      title={
        <div className="toolbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={"btn sm " + (tab === t.key ? "primary" : "ghost")}
              onClick={() => setTab(t.key as any)}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
    >
      {tab === "compare" && <CompareTab />}
      {tab === "history" && <HistoryTab />}
      {tab === "current" && <CurrentTab />}
    </Card>
  );
}

function CompareTab() {
  const [pairId, setPairId] = useState<string>("");
  const [metric, setMetric] = useState<Metric>("buyPrice");
  const [range, setRange] = useState("1h");

  const pairs = useQuery({
    queryKey: ["pairs"],
    queryFn: async () => unwrap<PricePair[]>((await api.get("/admin/pair")).data),
  });

  const activeProviders = useQuery({
    queryKey: ["mon-providers"],
    queryFn: async () => unwrap<string[]>((await api.get("/admin/monitoring/providers")).data),
    refetchInterval: 30_000,
  });

  const effectivePairId = pairId || pairs.data?.[0]?.id || "";

  const compare = useQuery({
    queryKey: ["compare", effectivePairId, range],
    enabled: !!effectivePairId,
    refetchInterval: 15_000,
    queryFn: async () => {
      const ms = RANGES.find((r) => r.key === range)?.ms;
      const params: Record<string, any> = { limit: 5000 };
      if (ms) {
        params.from = Date.now() - ms;
        params.to = Date.now();
      }
      return unwrap<CompareResponse>(
        (await api.get(`/admin/monitoring/pairs/${effectivePairId}/compare`, { params })).data
      );
    },
  });

  const chart = useMemo(() => {
    const series = compare.data?.series ?? [];
    const allTs = Array.from(
      new Set(series.flatMap((s) => s.points.map((p) => p.timestamp)))
    ).sort();
    const datasets = series.map((s) => {
      const map = new Map(s.points.map((p) => [p.timestamp, p[metric]]));
      const c = colorFor(s.providerKey);
      return {
        label: `${s.providerKey} (#${s.providerItemId})`,
        data: allTs.map((t) => (map.has(t) ? Number(map.get(t)) : null)),
        borderColor: c,
        backgroundColor: c + "20",
        spanGaps: true,
        tension: 0.25,
        pointRadius: 0,
        borderWidth: 2,
      };
    });
    return { labels: allTs.map((t) => new Date(t)), datasets, n: allTs.length };
  }, [compare.data, metric]);

  const series = compare.data?.series ?? [];

  const seriesKeys = new Set(series.map((s) => s.providerKey));

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 4 }}>
        <div className="field" style={{ margin: 0, minWidth: 220 }}>
          <label>جفت‌ارز</label>
          <select
            className="select"
            value={effectivePairId}
            onChange={(e) => setPairId(e.target.value)}
            disabled={pairs.isLoading}
          >
            {pairs.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {pairLabel(p)}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0, minWidth: 150 }}>
          <label>شاخص</label>
          <select className="select" value={metric} onChange={(e) => setMetric(e.target.value as Metric)}>
            <option value="buyPrice">قیمت خرید</option>
            <option value="sellPrice">قیمت فروش</option>
            <option value="spread">اسپرد</option>
          </select>
        </div>
        <div className="field" style={{ margin: 0, minWidth: 140 }}>
          <label>بازه زمانی</label>
          <select className="select" value={range} onChange={(e) => setRange(e.target.value)}>
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
        <div style={{ marginInlineStart: "auto", alignSelf: "flex-end" }}>
          {compare.isFetching ? <Badge kind="gray">به‌روزرسانی…</Badge> : <Badge kind="green">زنده</Badge>}
        </div>
      </div>

      {activeProviders.data && activeProviders.data.length > 0 && (
        <div className="toolbar" style={{ marginTop: 8, marginBottom: 4, flexWrap: "wrap", gap: 6 }}>
          <label style={{ fontSize: 12, color: "var(--muted)" }}>تأمین‌کنندگان فعال:</label>
          {activeProviders.data.map((p) => {
            const hasData = seriesKeys.has(p);
            return (
              <span
                key={p}
                className={`badge ${hasData ? "green" : "gray"}`}
                style={{ opacity: hasData ? 1 : 0.5, cursor: "default" }}
                title={hasData ? "داده در این جفت‌ارز دارد" : "در این جفت‌ارز نگاشت نشده"}
              >
                {hasData ? "●" : "○"} {p}
              </span>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        {pairs.isLoading || compare.isLoading ? (
          <Loading />
        ) : compare.isError ? (
          <ErrorState message="عدم دریافت داده مقایسه (موتور قیمت‌گذاری در دسترس است؟)" />
        ) : chart.n === 0 ? (
          <Empty label="برای این جفت‌ارز نگاشت یا داده تاریخی موجود نیست" />
        ) : (
          <div className="chart-box" style={{ height: 420 }}>
            <Line
              data={chart as any}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: "index", intersect: false },
                scales: {
                  x: {
                    type: "time",
                    time: {
                      tooltipFormat: range === "7d" || range === "all" ? "MM/dd HH:mm" : "HH:mm:ss",
                    },
                    grid: { color: gridColor },
                    ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
                  },
                  y: { grid: { color: gridColor }, ticks: { callback: (v) => fmtNum(v as number) } },
                },
                plugins: { legend: { position: "bottom" } },
              }}
            />
          </div>
        )}
      </div>

      {series.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>تأمین‌کننده</th>
                  <th>آیتم</th>
                  <th>آخرین خرید</th>
                  <th>آخرین فروش</th>
                  <th>اسپرد</th>
                  <th>نقاط</th>
                </tr>
              </thead>
              <tbody>
                {series.map((s) => {
                  const last = s.points[s.points.length - 1];
                  return (
                    <tr key={s.providerKey + s.providerItemId}>
                      <td>
                        <span style={{ color: colorFor(s.providerKey), fontWeight: 700 }}>●</span>{" "}
                        {s.providerKey}
                      </td>
                      <td className="mono">{s.providerItemId}</td>
                      <td className="mono">{last ? fmtNum(last.buyPrice) : "—"}</td>
                      <td className="mono">{last ? fmtNum(last.sellPrice) : "—"}</td>
                      <td className="mono">{last ? fmtNum(last.spread) : "—"}</td>
                      <td className="mono">{s.points.length}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

function HistoryTab() {
  const providers = useQuery({
    queryKey: ["mon-providers"],
    queryFn: async () => unwrap<string[]>((await api.get("/admin/monitoring/providers")).data),
  });
  const [provider, setProvider] = useState<string>("");
  const [itemId, setItemId] = useState<string>("");
  const [limit, setLimit] = useState<number>(500);

  const effectiveProvider = provider || providers.data?.[0] || "";
  const effectiveItemId = itemId || (providers.data?.[0] ? "" : ""); // no default — user picks

  const history = useQuery({
    queryKey: ["mon-history", effectiveProvider, effectiveItemId, limit],
    enabled: !!effectiveProvider && !!effectiveItemId,
    refetchInterval: 15_000,
    queryFn: async () =>
      unwrap<HistoryResponse>(
        (await api.get("/admin/monitoring/history", { params: { provider: effectiveProvider, itemId: effectiveItemId, limit } })).data
      ),
  });

  const chart = useMemo(() => {
    const points = history.data?.points ?? [];
    const labels = points.map((p) => new Date(p.timestamp));
    const datasets = [
      { label: "خرید", data: points.map((p) => p.buyPrice), borderColor: "#2ea861", backgroundColor: "transparent", tension: 0.25, pointRadius: 0 },
      { label: "فروش", data: points.map((p) => p.sellPrice), borderColor: "#e5544b", backgroundColor: "transparent", tension: 0.25, pointRadius: 0 },
    ];
    return { labels, datasets, n: points.length };
  }, [history.data]);

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="field" style={{ margin: 0, minWidth: 200 }}>
          <label>تأمین‌کننده</label>
          <select className="select" value={effectiveProvider} onChange={(e) => setProvider(e.target.value)}>
            <option value="">انتخاب…</option>
            {providers.data?.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0, minWidth: 150 }}>
          <label>شناسه آیتم</label>
          <input className="input mono" dir="ltr" value={effectiveItemId} onChange={(e) => setItemId(e.target.value)} placeholder="101" />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 130 }}>
          <label>سقف نقاط</label>
          <input className="input mono" dir="ltr" type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value) || 500)} />
        </div>
      </div>

      {history.isLoading ? (
        <Loading />
      ) : history.isError ? (
        <ErrorState message={apiError(history.error)} />
      ) : chart.n === 0 ? (
        <Empty label="برای این آیتم داده‌ای موجود نیست" />
      ) : (
        <div className="chart-box" style={{ height: 420 }}>
          <Line
            data={chart as any}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              interaction: { mode: "index", intersect: false },
              scales: {
                x: { type: "time", grid: { color: gridColor } },
                y: { grid: { color: gridColor }, ticks: { callback: (v) => fmtNum(v as number) } },
              },
              plugins: { legend: { position: "bottom" } },
            }}
          />
        </div>
      )}
    </>
  );
}

function CurrentTab() {
  const providers = useQuery({
    queryKey: ["mon-providers"],
    queryFn: async () => unwrap<string[]>((await api.get("/admin/monitoring/providers")).data),
  });
  const [provider, setProvider] = useState<string>("");
  const effective = provider || providers.data?.[0] || "";

  const current = useQuery({
    queryKey: ["mon-current", effective],
    enabled: !!effective,
    refetchInterval: 10_000,
    queryFn: async () =>
      unwrap<CurrentProviderResponse>((await api.get(`/admin/monitoring/current/${effective}`)).data),
  });

  const items: ProviderSnapshotItem[] = useMemo(() => {
    const d: any = current.data;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.items)) return d.items;
    if (d.snapshot && typeof d.snapshot === "object") {
      return Object.entries(d.snapshot).map(([k, v]: [string, any]) => ({ itemId: Number(k), ...v }));
    }
    if (typeof d === "object") {
      return Object.entries(d).map(([k, v]: [string, any]) => ({
        itemId: Number(k),
        name: v?.name ?? v?.slug,
        buyPrice: v?.buyPrice ?? v?.buy,
        sellPrice: v?.sellPrice ?? v?.sell,
        unit: v?.unit,
      }));
    }
    return [];
  }, [current.data]);

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="field" style={{ margin: 0, minWidth: 220 }}>
          <label>تأمین‌کننده</label>
          <select className="select" value={effective} onChange={(e) => setProvider(e.target.value)}>
            <option value="">انتخاب…</option>
            {providers.data?.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{ marginInlineStart: "auto", alignSelf: "flex-end" }}>
          {current.isFetching ? <Badge kind="gray">به‌روزرسانی…</Badge> : <Badge kind="green">زنده</Badge>}
        </div>
      </div>

      {current.isLoading ? (
        <Loading />
      ) : current.isError ? (
        <ErrorState message={apiError(current.error)} />
      ) : items.length === 0 ? (
        <Empty label="آیتمی برای این تأمین‌کننده موجود نیست" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>شناسه</th>
                <th>نام</th>
                <th>نماد</th>
                <th>خرید</th>
                <th>فروش</th>
                <th>واحد</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={String(it.itemId)}>
                  <td className="mono">{it.itemId}</td>
                  <td>{it.name ?? "—"}</td>
                  <td>{it.slug ? <Badge kind="gold">{it.slug}</Badge> : "—"}</td>
                  <td className="mono">{fmtNum(it.buyPrice, 2)}</td>
                  <td className="mono">{fmtNum(it.sellPrice, 2)}</td>
                  <td>{it.unit ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
