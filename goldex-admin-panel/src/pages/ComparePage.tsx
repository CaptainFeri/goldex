import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Line } from "react-chartjs-2";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { colorFor, fmtNum, fmtTime, pairLabel } from "../lib/format";
import { gridColor } from "../lib/chart";
import type { CompareResponse, PricePair, HistoryResponse, ProviderSnapshot, ProviderSnapshotItem } from "../api/types";

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

/**
 * A provider's live snapshot. Backs both the snapshot table and the history
 * tab's item picker, so the two always agree on which items exist.
 */
function useProviderSnapshot(provider: string, refetchInterval?: number) {
  return useQuery({
    queryKey: ["mon-snapshot", provider],
    enabled: !!provider,
    refetchInterval,
    queryFn: async () =>
      unwrap<ProviderSnapshot>((await api.get(`/admin/monitoring/current/${provider}`)).data),
  });
}

/** "#101 — طلای آبشده" for the item pickers. */
function itemOptionLabel(it: ProviderSnapshotItem): string {
  return it.name ? `#${it.itemId} — ${it.name}` : `#${it.itemId}`;
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
                    grid: { color: gridColor() },
                    ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 10 },
                  },
                  y: { grid: { color: gridColor() }, ticks: { callback: (v) => fmtNum(v as number) } },
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

  // The provider's items, so the admin picks a name instead of typing a raw id.
  const snapshot = useProviderSnapshot(effectiveProvider);
  const items = snapshot.data?.items ?? [];

  // Keep the chosen item valid when the provider changes.
  const itemExists = items.some((i) => String(i.itemId) === itemId);
  const effectiveItemId = itemExists ? itemId : "";

  const history = useQuery({
    queryKey: ["mon-history", effectiveProvider, effectiveItemId, limit],
    enabled: !!effectiveProvider && !!effectiveItemId,
    refetchInterval: 15_000,
    queryFn: async () =>
      unwrap<HistoryResponse>(
        (await api.get("/admin/monitoring/history", { params: { provider: effectiveProvider, itemId: effectiveItemId, limit } })).data
      ),
  });

  const selected = items.find((i) => String(i.itemId) === effectiveItemId);

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
          <select
            className="select"
            value={effectiveProvider}
            onChange={(e) => {
              setProvider(e.target.value);
              setItemId("");
            }}
          >
            <option value="">انتخاب…</option>
            {providers.data?.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0, minWidth: 280 }}>
          <label>آیتم</label>
          <select
            className="select"
            value={effectiveItemId}
            onChange={(e) => setItemId(e.target.value)}
            disabled={!effectiveProvider || snapshot.isLoading}
          >
            <option value="">
              {snapshot.isLoading
                ? "در حال دریافت آیتم‌ها…"
                : items.length === 0
                  ? "آیتمی برای این تأمین‌کننده نیست"
                  : "انتخاب آیتم…"}
            </option>
            {items.map((it) => (
              <option key={it.itemId} value={String(it.itemId)}>
                {itemOptionLabel(it)}
              </option>
            ))}
          </select>
        </div>
        <div className="field" style={{ margin: 0, minWidth: 130 }}>
          <label>سقف نقاط</label>
          <input className="input mono" dir="ltr" type="number" value={limit} onChange={(e) => setLimit(Number(e.target.value) || 500)} />
        </div>
      </div>

      {selected && (
        <div className="toolbar" style={{ marginBottom: 12, gap: 8, flexWrap: "wrap" }}>
          <Badge kind="gray">گروه: {selected.groupName ?? "—"}</Badge>
          <Badge kind="gray">واحد: {selected.unit ?? "—"}</Badge>
          {selected.mappedPairs.length > 0 ? (
            selected.mappedPairs.map((m) => (
              <Badge key={m.pairId} kind="gold">{m.pairLabel}</Badge>
            ))
          ) : (
            <Badge kind="gray">به هیچ جفت‌ارزی نگاشت نشده</Badge>
          )}
        </div>
      )}

      {snapshot.isError ? (
        <ErrorState message={apiError(snapshot.error)} />
      ) : !effectiveItemId ? (
        <Empty label="یک تأمین‌کننده و آیتم انتخاب کنید" />
      ) : history.isLoading ? (
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
                x: { type: "time", grid: { color: gridColor() } },
                y: { grid: { color: gridColor() }, ticks: { callback: (v) => fmtNum(v as number) } },
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
  const [search, setSearch] = useState("");
  const [onlyMapped, setOnlyMapped] = useState(false);
  const effective = provider || providers.data?.[0] || "";

  const current = useProviderSnapshot(effective, 10_000);
  const snapshot = current.data;

  const items: ProviderSnapshotItem[] = useMemo(() => {
    const all = snapshot?.items ?? [];
    const term = search.trim().toLowerCase();
    return all.filter((it) => {
      if (onlyMapped && it.mappedPairs.length === 0) return false;
      if (!term) return true;
      return (
        String(it.itemId).includes(term) ||
        (it.name ?? "").toLowerCase().includes(term) ||
        (it.groupName ?? "").toLowerCase().includes(term) ||
        it.mappedPairs.some((m) => m.pairLabel.toLowerCase().includes(term))
      );
    });
  }, [snapshot, search, onlyMapped]);

  return (
    <>
      <div className="toolbar" style={{ marginBottom: 16 }}>
        <div className="field" style={{ margin: 0, minWidth: 200 }}>
          <label>تأمین‌کننده</label>
          <select className="select" value={effective} onChange={(e) => setProvider(e.target.value)}>
            <option value="">انتخاب…</option>
            {providers.data?.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0, minWidth: 200 }}>
          <label>جستجو</label>
          <input
            className="input"
            placeholder="نام، گروه، شناسه یا جفت‌ارز…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <label className="row" style={{ gap: 6, alignSelf: "flex-end", fontSize: 12, paddingBottom: 10 }}>
          <input type="checkbox" checked={onlyMapped} onChange={(e) => setOnlyMapped(e.target.checked)} />
          فقط آیتم‌های نگاشت‌شده
        </label>
        <div style={{ marginInlineStart: "auto", alignSelf: "flex-end", paddingBottom: 10 }}>
          {current.isFetching ? <Badge kind="gray">به‌روزرسانی…</Badge> : <Badge kind="green">زنده</Badge>}
        </div>
      </div>

      {snapshot && (
        <div className="toolbar" style={{ marginBottom: 12, gap: 8, fontSize: 12 }}>
          <Badge kind="gray">{snapshot.totalItems} آیتم</Badge>
          <Badge kind="green">{snapshot.pricedItems} دارای قیمت</Badge>
          <Badge kind="gold">{snapshot.mappedItems} نگاشت‌شده</Badge>
          <span className="muted">
            آخرین بروزرسانی:{" "}
            <span className="mono">{snapshot.lastUpdate ? fmtTime(snapshot.lastUpdate) : "—"}</span>
          </span>
        </div>
      )}

      {current.isLoading ? (
        <Loading />
      ) : current.isError ? (
        <ErrorState message={apiError(current.error)} />
      ) : items.length === 0 ? (
        <Empty
          label={
            (snapshot?.items.length ?? 0) > 0
              ? "آیتمی با این فیلترها نیست"
              : "آیتمی برای این تأمین‌کننده موجود نیست"
          }
        />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>شناسه</th>
                <th>نام آیتم</th>
                <th>گروه</th>
                <th>جفت‌ارز نگاشت‌شده</th>
                <th>خرید</th>
                <th>فروش</th>
                <th>اسپرد</th>
                <th>واحد</th>
                <th>وضعیت</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={String(it.itemId)} style={it.stale ? { opacity: 0.6 } : undefined}>
                  <td className="mono">{it.itemId}</td>
                  <td>{it.name ?? <span className="muted">—</span>}</td>
                  <td style={{ fontSize: 12 }}>{it.groupName ?? "—"}</td>
                  <td style={{ whiteSpace: "normal", maxWidth: 220 }}>
                    {it.mappedPairs.length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      it.mappedPairs.map((m) => (
                        <Badge key={m.pairId} kind="gold">{m.pairLabel}</Badge>
                      ))
                    )}
                  </td>
                  <td className="mono" style={{ color: it.canBuy ? undefined : "var(--text-faint)" }}>
                    {it.buyPrice == null ? "—" : fmtNum(it.buyPrice, 2)}
                  </td>
                  <td className="mono" style={{ color: it.canSell ? undefined : "var(--text-faint)" }}>
                    {it.sellPrice == null ? "—" : fmtNum(it.sellPrice, 2)}
                  </td>
                  <td className="mono">{it.spread == null ? "—" : fmtNum(it.spread, 2)}</td>
                  <td>{it.unit ?? "—"}</td>
                  <td>
                    {it.stale ? (
                      <Badge kind="gray">{it.timestamp ? "کهنه" : "بدون قیمت"}</Badge>
                    ) : (
                      <Badge kind="green">{it.timestamp ? fmtTime(it.timestamp) : "زنده"}</Badge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
