import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Line } from "react-chartjs-2";
import { api, apiError, unwrap } from "../api/client";
import { Badge, Card, Empty, ErrorState, Loading, Modal, Toggle } from "../components/ui";
import { gridColor } from "../lib/chart";
import { fmtDate, fmtNum } from "../lib/format";
import { fmtBySymbol } from "../lib/money";
import {
  buildDatasets,
  CHART_MODES,
  needsLogScale,
  chartLabels,
  confirmMarketMessage,
  filterGroups,
  flatten,
  LEGEND_LIMIT,
  marketLabel,
  missingLabel,
  pollMs,
  reasonLabel,
  toggleId,
  type ChartMode,
} from "../lib/price";
import type {
  PriceEngineConfig,
  PriceHistory,
  PriceInstrument,
  PriceInstruments,
} from "../api/types";

/** How far back the chart reaches. The server buckets the window it is given. */
const RANGES = [
  { hours: 6, label: "۶ ساعت" },
  { hours: 24, label: "۲۴ ساعت" },
  { hours: 24 * 7, label: "۷ روز" },
];

/** The server's own cap; asking for more is a 400, so the picker stops here. */
const MAX_SELECTED = 25;

export default function PricePage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [mode, setMode] = useState<ChartMode>("all");
  const [hours, setHours] = useState(24);
  const [confirm, setConfirm] = useState<{ instrument: PriceInstrument; next: boolean } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const config = useQuery({
    queryKey: ["price-engine-config"],
    queryFn: async () => unwrap<PriceEngineConfig>((await api.get("/admin/price/engine-config")).data),
  });

  // The server says how often to poll; a hardcoded interval here would drift
  // from whatever the desk set on this very screen.
  const refetchInterval = pollMs(config.data?.refreshIntervalSec);

  const instruments = useQuery({
    queryKey: ["price-instruments"],
    queryFn: async () => unwrap<PriceInstruments>((await api.get("/admin/price/instruments")).data),
    refetchInterval,
  });

  const all = useMemo(() => flatten(instruments.data), [instruments.data]);
  const chosen = useMemo(
    () => selected.map((id) => all.find((i) => i.id === id)).filter(Boolean) as PriceInstrument[],
    [selected, all],
  );
  const slugs = chosen.map((i) => i.slug).join(",");

  const history = useQuery({
    queryKey: ["price-history", slugs, hours],
    queryFn: async () =>
      unwrap<PriceHistory>(
        (await api.get("/admin/price/history", { params: { symbols: slugs, points: 30, hours } })).data,
      ),
    enabled: slugs.length > 0,
    refetchInterval,
  });

  const setMarket = useMutation({
    mutationFn: ({ id, open }: { id: string; open: boolean }) =>
      api.patch(`/admin/price/instruments/${id}/market-status`, { open }),
    onSuccess: () => {
      setConfirm(null);
      setActionError(null);
      qc.invalidateQueries({ queryKey: ["price-instruments"] });
      qc.invalidateQueries({ queryKey: ["market-status"] });
    },
    onError: (err) => setActionError(apiError(err)),
  });

  return (
    <div className="grid" style={{ gap: 16 }}>
      <InstrumentPicker
        data={instruments.data}
        loading={instruments.isLoading}
        error={instruments.isError ? apiError(instruments.error) : null}
        selected={selected}
        onToggle={(id) => setSelected((prev) => toggleId(prev, id))}
        onClear={() => setSelected([])}
        onSelectAll={(ids) => setSelected(ids.slice(0, MAX_SELECTED))}
      />

      <Card
        title="نمادهای انتخاب‌شده"
        action={
          chosen.length > 0 ? (
            <button className="btn ghost sm" onClick={() => setSelected([])}>
              پاک کردن انتخاب
            </button>
          ) : undefined
        }
      >
        {chosen.length === 0 ? (
          <Empty label="نمادی انتخاب نشده — از فهرست بالا نماد مورد نظر را انتخاب کنید." />
        ) : (
          <div className="price-cards">
            {chosen.map((item) => (
              <InstrumentCard
                key={item.id}
                item={item}
                busy={setMarket.isPending && confirm?.instrument.id === item.id}
                onToggleMarket={(next) => {
                  setActionError(null);
                  setConfirm({ instrument: item, next });
                }}
                onRemove={() => setSelected((prev) => prev.filter((x) => x !== item.id))}
              />
            ))}
          </div>
        )}
      </Card>

      <Card
        title={
          chosen.length === 1 ? `قیمت زندهٔ ${chosen[0].name}` : `نمودار قیمت — ${fmtNum(chosen.length)} نماد`
        }
        action={
          <div className="toolbar">
            {CHART_MODES.map((m) => (
              <button
                key={m.id}
                className={"btn sm " + (mode === m.id ? "primary" : "ghost")}
                onClick={() => setMode(m.id)}
              >
                {m.label}
              </button>
            ))}
            {RANGES.map((r) => (
              <button
                key={r.hours}
                className={"btn sm " + (hours === r.hours ? "primary" : "ghost")}
                onClick={() => setHours(r.hours)}
              >
                {r.label}
              </button>
            ))}
          </div>
        }
      >
        <PriceChart
          chosen={chosen}
          history={history.data}
          mode={mode}
          loading={history.isLoading}
          error={history.isError ? apiError(history.error) : null}
        />
      </Card>

      <EngineConfigCard query={config} />

      {confirm && (
        <Modal title="تأیید تغییر وضعیت بازار" onClose={() => setConfirm(null)}>
          <p>{confirmMarketMessage(confirm.instrument, confirm.next)}</p>
          {actionError && <ErrorState message={actionError} />}
          <div className="toolbar" style={{ marginTop: 16 }}>
            <button
              className="btn primary"
              disabled={setMarket.isPending}
              onClick={() => setMarket.mutate({ id: confirm.instrument.id, open: confirm.next })}
            >
              {setMarket.isPending ? "در حال اعمال…" : "تأیید"}
            </button>
            <button className="btn ghost" onClick={() => setConfirm(null)}>
              انصراف
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function InstrumentPicker({
  data,
  loading,
  error,
  selected,
  onToggle,
  onClear,
  onSelectAll,
}: {
  data: PriceInstruments | undefined;
  loading: boolean;
  error: string | null;
  selected: string[];
  onToggle: (id: string) => void;
  onClear: () => void;
  onSelectAll: (ids: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => filterGroups(data, query), [data, query]);
  const total = data?.total ?? 0;
  const atLimit = selected.length >= MAX_SELECTED;

  return (
    <Card
      title="انتخاب نمادها"
      action={
        <div className="toolbar">
          <span className="muted">{fmtNum(selected.length)} از {fmtNum(total)}</span>
          <button
            className="btn ghost sm"
            disabled={!data || total === 0}
            onClick={() => onSelectAll(flatten(data).map((i) => i.id))}
          >
            انتخاب همه
          </button>
          <button className="btn ghost sm" disabled={selected.length === 0} onClick={onClear}>
            هیچ‌کدام
          </button>
        </div>
      }
    >
      <input
        className="input"
        placeholder="جستجو در نام، نماد یا دسته‌بندی…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorState message={error} />
      ) : groups.length === 0 ? (
        <Empty label="نمادی با این جستجو پیدا نشد" />
      ) : (
        <div style={{ marginTop: 12 }}>
          {atLimit && (
            <p className="muted">
              حداکثر {fmtNum(MAX_SELECTED)} نماد هم‌زمان قابل نمایش است؛ برای انتخاب نماد دیگر، یکی
              را بردارید.
            </p>
          )}
          {groups.map((g) => (
            <div key={g.category} style={{ marginBottom: 12 }}>
              <div className="muted" style={{ marginBottom: 6 }}>{g.category}</div>
              <div className="price-chips">
                {g.items.map((item) => {
                  const on = selected.includes(item.id);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="checkbox"
                      aria-checked={on}
                      disabled={!on && atLimit}
                      className={"btn sm " + (on ? "primary" : "ghost")}
                      onClick={() => onToggle(item.id)}
                      title={`${item.slug} — ${item.sell === null ? "بدون قیمت" : fmtBySymbol(item.sell, item.quoteSlug, { digits: 0 })}`}
                    >
                      <span
                        aria-hidden
                        className="price-dot"
                        style={{ background: item.color, marginInlineEnd: 6 }}
                      />
                      {item.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function InstrumentCard({
  item,
  busy,
  onToggleMarket,
  onRemove,
}: {
  item: PriceInstrument;
  busy: boolean;
  onToggleMarket: (next: boolean) => void;
  onRemove: () => void;
}) {
  const price = (v: number | null) =>
    v === null ? "—" : fmtBySymbol(v, item.quoteSlug, { digits: 0 });

  return (
    <div className="price-card">
      <div className="kv">
        <span>نام نماد</span>
        <b>
          {item.name} <span className="muted">({item.slug})</span>
        </b>
      </div>
      <div className="kv">
        <span style={{ color: "var(--green)" }}>خرید</span>
        <b className="mono">{price(item.buy)}</b>
      </div>
      <div className="kv">
        <span style={{ color: "var(--red)" }}>فروش</span>
        <b className="mono">{price(item.sell)}</b>
      </div>
      {item.buyGram !== null && (
        <div className="kv">
          <span>هر گرم (خرید)</span>
          <b className="mono">{price(item.buyGram)}</b>
        </div>
      )}
      {item.sellGram !== null && (
        <div className="kv">
          <span>هر گرم (فروش)</span>
          <b className="mono">{price(item.sellGram)}</b>
        </div>
      )}
      <div className="kv">
        <span>{marketLabel(item)}</span>
        {/*
          An instrument with no pair has nothing to open or close — the server
          answers 400 — so the toggle is disabled rather than offered and then
          refused.
        */}
        <Toggle
          on={item.marketOpen === true}
          disabled={busy || item.pairId === null}
          label={`${marketLabel(item)} — ${item.name}`}
          onChange={(next) => onToggleMarket(next)}
        />
      </div>
      <div className="kv">
        <span>وضعیت</span>
        <span>
          {item.stale && <Badge kind="gray">نرخ قدیمی</Badge>}{" "}
          {item.marketOverridden && <Badge kind="gold">اعمال دستی</Badge>}{" "}
          {item.pairId === null && <Badge kind="red">بدون جفت‌ارز</Badge>}{" "}
          {/* The badge above already says an admin forced it; repeating the
              reason would read as two separate facts. */}
          {!item.marketOverridden && reasonLabel(item.marketStatusReason) && (
            <span className="muted">{reasonLabel(item.marketStatusReason)}</span>
          )}
        </span>
      </div>
      <div className="kv">
        <span>آخرین به‌روزرسانی</span>
        <span className="muted">{fmtDate(item.lastUpdated)}</span>
      </div>
      <button className="btn ghost sm" onClick={onRemove}>
        حذف از انتخاب
      </button>
    </div>
  );
}

function PriceChart({
  chosen,
  history,
  mode,
  loading,
  error,
}: {
  chosen: PriceInstrument[];
  history: PriceHistory | undefined;
  mode: ChartMode;
  loading: boolean;
  error: string | null;
}) {
  const labels = useMemo(() => chartLabels(history), [history]);
  const logScale = useMemo(() => needsLogScale(history), [history]);
  // The mode is a view of rows already fetched, not a different request — so it
  // rebuilds the datasets and never refetches.
  const datasets = useMemo(() => buildDatasets(history, mode), [history, mode]);

  if (chosen.length === 0) return <Empty label="برای نمایش نمودار، حداقل یک نماد انتخاب کنید." />;
  if (loading) return <Loading />;
  if (error) return <ErrorState message={error} />;
  if (!history || history.series.length === 0) {
    return <Empty label="برای نمادهای انتخاب‌شده تاریخچهٔ قیمتی ثبت نشده است." />;
  }

  return (
    <>
      {logScale && (
        <p className="muted">
          به دلیل اختلاف زیاد قیمت نمادهای انتخاب‌شده، مقیاس محور عمودی لگاریتمی است.
        </p>
      )}
      {history.missing.length > 0 && (
        <p className="muted">
          بدون نمودار:{" "}
          {history.missing.map((m) => `${m.slug} (${missingLabel(m.reason)})`).join("، ")}
        </p>
      )}
      <div className="chart-box" style={{ height: 380 }}>
        <Line
          data={{ labels, datasets } as any}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            scales: {
              x: { grid: { color: gridColor() }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
              y: {
                // Instruments quoted decades apart cannot share a linear axis;
                // see `needsLogScale`. Values stay true either way.
                type: logScale ? "logarithmic" : "linear",
                grid: { color: gridColor() },
                ticks: {
                  // A log axis emits a tick per decade *and* per step within
                  // it, which crowds the labels off the plot.
                  maxTicksLimit: 8,
                  callback: (v) => fmtBySymbol(v as number, history.quoteSlug, { digits: 0 }),
                },
              },
            },
            plugins: {
              legend: { display: history.series.length <= LEGEND_LIMIT, position: "bottom" },
              tooltip: {
                callbacks: {
                  // Null is a gap, not a zero — say so rather than drawing «۰».
                  label: (ctx: any) =>
                    `${ctx.dataset.label}: ${
                      ctx.parsed.y === null || ctx.parsed.y === undefined
                        ? "—"
                        : fmtBySymbol(ctx.parsed.y, history.quoteSlug, { digits: 0 })
                    }`,
                },
              },
            },
          }}
        />
      </div>
    </>
  );
}

function EngineConfigCard({ query }: { query: ReturnType<typeof useQuery<PriceEngineConfig>> }) {
  const qc = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch("/admin/price/engine-config", body),
    onSuccess: () => {
      setError(null);
      qc.invalidateQueries({ queryKey: ["price-engine-config"] });
      // Same rows the providers screen shows — a toggle here must not leave it stale.
      qc.invalidateQueries({ queryKey: ["providers-admin"] });
    },
    onError: (err) => setError(apiError(err)),
  });

  if (query.isLoading) return <Card title="پیکربندی موتور قیمت"><Loading /></Card>;
  if (query.isError || !query.data) {
    return (
      <Card title="پیکربندی موتور قیمت">
        <ErrorState message={apiError(query.error)} />
      </Card>
    );
  }

  const cfg = query.data;

  return (
    <Card title="پیکربندی موتور قیمت">
      {error && <ErrorState message={error} />}

      <div className="muted" style={{ marginBottom: 8 }}>منابع قیمت</div>
      {cfg.sources.length === 0 ? (
        <Empty label="هیچ تأمین‌کننده‌ای ثبت نشده است" />
      ) : (
        cfg.sources.map((s) => (
          <div className="kv" key={s.key}>
            <span>
              {s.label ?? s.key} <span className="muted">({s.key})</span>{" "}
              <Badge kind={s.status === "connected" ? "green" : s.active ? "gold" : "gray"}>
                {s.status}
              </Badge>
            </span>
            <Toggle
              on={s.active}
              disabled={save.isPending}
              label={`منبع ${s.label ?? s.key}`}
              onChange={(active) => save.mutate({ sources: [{ key: s.key, active }] })}
            />
          </div>
        ))
      )}

      <div className="kv">
        <span>
          اعمال اسپرد خودکار
          {/*
            Read-only on purpose: the spread is the pair commission and the
            symbol gain — the desk's margin on every quote — and a global switch
            would zero it in one click. The server reports it and says where to
            change it.
          */}
        </span>
        <span>
          <Badge kind={cfg.autoSpread.enabled ? "green" : "gray"}>
            {cfg.autoSpread.enabled ? "فعال" : "غیرفعال"}
          </Badge>
        </span>
      </div>
      <p className="muted">
        اسپرد از کارمزد جفت‌ارز و سود نماد ساخته می‌شود؛ از صفحهٔ «جفت‌ارزها» و «نمادها» قابل تغییر
        است. هم‌اکنون {fmtNum(cfg.autoSpread.pairsWithCommission)} جفت‌ارز دارای کارمزد و{" "}
        {fmtNum(cfg.autoSpread.symbolsWithGain)} نماد دارای سود است.
      </p>

      <div className="kv">
        <span>فاصلهٔ به‌روزرسانی پنل (ثانیه)</span>
        <span className="toolbar">
          {[3, 5, 10, 30].map((sec) => (
            <button
              key={sec}
              className={"btn sm " + (cfg.refreshIntervalSec === sec ? "primary" : "ghost")}
              disabled={save.isPending}
              onClick={() => save.mutate({ refreshIntervalSec: sec })}
            >
              {fmtNum(sec)}
            </button>
          ))}
        </span>
      </div>
      <p className="muted">
        این مقدار فقط فاصلهٔ به‌روزرسانی پنل است؛ فاصلهٔ دریافت قیمت در موتور، به‌ازای هر
        تأمین‌کننده در صفحهٔ تأمین‌کنندگان تنظیم می‌شود.
      </p>
      {cfg.updateAt && <p className="muted">آخرین تغییر: {fmtDate(cfg.updateAt)}</p>}
    </Card>
  );
}
