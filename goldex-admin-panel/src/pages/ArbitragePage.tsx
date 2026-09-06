import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import {
  Card,
  Loading,
  ErrorState,
  Empty,
  Badge,
  Stat,
  Modal,
} from "../components/ui";
import {
  fmtNum,
  fmtDuration,
  fmtTime,
  colorFor,
  fmtIrrFromToman,
  irrToToman,
  IRR_PER_TOMAN,
} from "../lib/format";
import ArbitrageBotsPanel from "./arbitrage/ArbitrageBotsPanel";
import type {
  ArbitrageSignal,
  ArbitrageStatus,
  ArbitrageConfig,
  ArbitrageConfigResponse,
} from "../api/types";

const REFRESH_MS = 5000;

type Tab = "live" | "alerts" | "history" | "bots";
type SortKey = "profitRial" | "profitPercent" | "itemName" | "deadline";

const TABS: { key: Tab; label: string }[] = [
  { key: "live", label: "فرصت‌های فعال" },
  { key: "alerts", label: "هشدارهای جدید" },
  { key: "history", label: "تاریخچه" },
  { key: "bots", label: "ربات‌ها" },
];

const toArray = <T,>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

/** Remaining life of a signal, as a countdown that ticks in the table. */
function deadlineState(deadline: string | undefined, now: number) {
  if (!deadline) return { kind: "gray" as const, label: "—", expired: false };
  const ms = new Date(deadline).getTime() - now;
  if (Number.isNaN(ms))
    return { kind: "gray" as const, label: "—", expired: false };
  if (ms <= 0) return { kind: "gray" as const, label: "منقضی", expired: true };
  const s = Math.floor(ms / 1000);
  return {
    kind:
      ms < 30_000
        ? ("red" as const)
        : ms < 120_000
          ? ("gold" as const)
          : ("green" as const),
    label: `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
    expired: false,
  };
}

/** One banner that explains what the page is currently showing, and why. */
function SourceBanner({ status }: { status?: ArbitrageStatus }) {
  if (!status) return null;

  const tone =
    status.source === "none"
      ? "red"
      : status.source === "pricing-redis" || status.stale
        ? "gold"
        : "green";
  const sourceLabel =
    status.source === "bus"
      ? "جریان زنده (RabbitMQ)"
      : status.source === "pricing-redis"
        ? "خوانده‌شده از Redis موتور قیمت"
        : "بدون داده";

  const explain =
    status.source === "none"
      ? status.engineRedisReachable
        ? "موتور قیمت در دسترس است اما هنوز هیچ اسکنی منتشر نکرده."
        : "Redis موتور قیمت در دسترس نیست — هیچ داده آربیتراژی قابل خواندن نیست."
      : status.source === "pricing-redis"
        ? "جریان RabbitMQ آربیتراژ نمی‌رسد؛ داده مستقیم از Redis موتور خوانده می‌شود."
        : status.stale
          ? `آخرین اسکن ${fmtDuration(status.ageSeconds)} پیش بوده — ممکن است موتور اسکن را متوقف کرده باشد.`
          : "";

  return (
    <div
      className="row spread"
      style={{
        gap: 12,
        padding: "10px 14px",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: "var(--bg-elev)",
        flexWrap: "wrap",
      }}
    >
      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <Badge kind={tone}>{sourceLabel}</Badge>
        {explain && (
          <span className="muted" style={{ fontSize: 12 }}>
            {explain}
          </span>
        )}
      </div>
      <div className="row" style={{ gap: 14, fontSize: 12 }}>
        <span className="muted">
          آخرین اسکن:{" "}
          <span className="mono">
            {status.scannedAt ? fmtTime(status.scannedAt) : "—"}
          </span>
        </span>
        <span className="muted">
          سن داده:{" "}
          <span className="mono">{fmtDuration(status.ageSeconds)}</span>
        </span>
        <span className="muted">
          موتور:{" "}
          {status.engineRedisReachable ? (
            <Badge kind="green">متصل</Badge>
          ) : (
            <Badge kind="red">قطع</Badge>
          )}
        </span>
      </div>
    </div>
  );
}

const CONFIG_FIELDS: {
  key: keyof ArbitrageConfig;
  label: string;
  hint: string;
}[] = [
  {
    key: "minProfitRial",
    label: "حداقل سود (ریال)",
    hint: "سیگنال با سود کمتر منتشر نمی‌شود",
  },
  { key: "minProfitPercent", label: "حداقل سود (٪)", hint: "۰ تا ۱۰۰" },
  { key: "maxSignals", label: "حداکثر تعداد سیگنال", hint: "۱ تا ۱۰۰۰" },
  {
    key: "quoteFreshnessMs",
    label: "اعتبار قیمت (ms)",
    hint: "قیمت قدیمی‌تر نادیده گرفته می‌شود",
  },
  { key: "signalTtlMs", label: "عمر سیگنال (ms)", hint: "مهلت اجرای فرصت" },
  {
    key: "scanIntervalMs",
    label: "فاصله اسکن دوره‌ای (ms)",
    hint: "۱۰۰۰ تا ۶۰۰۰۰۰",
  },
  {
    key: "recomputeDebounceMs",
    label: "تجمیع محاسبه مجدد (ms)",
    hint: "پنجره ادغام تیک‌های قیمت",
  },
];

function ConfigModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["arbitrage-config"],
    queryFn: async () =>
      unwrap<ArbitrageConfigResponse>(
        (await api.get("/admin/arbitrage/config")).data,
      ),
  });

  const [draft, setDraft] = useState<Record<string, string>>({});
  const config = q.data?.config ?? null;

  useEffect(() => {
    if (!config) return;
    const next: Record<string, string> = {};
    for (const f of CONFIG_FIELDS) {
      const v = config[f.key];
      if (v === undefined || v === null) {
        next[f.key] = "";
        continue;
      }
      next[f.key] = String(f.irrFromToman ? v * IRR_PER_TOMAN : v);
    }
    setDraft(next);
  }, [config]);

  const save = useMutation({
    mutationFn: (body: Partial<ArbitrageConfig>) =>
      api.patch("/admin/arbitrage/config", body),
    onSuccess: () => {
      // The engine echoes the values it applied; re-read rather than assume.
      setTimeout(
        () => qc.invalidateQueries({ queryKey: ["arbitrage-config"] }),
        800,
      );
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, number> = {};
    for (const f of CONFIG_FIELDS) {
      const raw = draft[f.key];
      if (raw === undefined || raw === "") continue;
      const n = Number(raw);
      if (!Number.isFinite(n)) continue;
      body[f.key] = f.irrFromToman ? n / IRR_PER_TOMAN : n;
    }
    save.mutate(body);
  }

  return (
    <Modal wide title="تنظیمات موتور آربیتراژ" onClose={onClose}>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={apiError(q.error)} />
      ) : (
        <form onSubmit={submit}>
          <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
            این مقادیر روی موتور قیمت اعمال می‌شوند. پس از ذخیره، موتور مقادیر
            واقعیِ اعمال‌شده را بازمی‌گرداند — اگر عددی خارج از محدوده مجاز باشد
            نادیده گرفته می‌شود.
            {q.data?.reportedAt && (
              <>
                {" "}
                آخرین گزارش موتور:{" "}
                <span className="mono">{fmtTime(q.data.reportedAt)}</span>
              </>
            )}
          </div>
          {!config && (
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              موتور هنوز تنظیماتش را گزارش نکرده است. مقادیر را وارد کنید تا
              ارسال شود.
            </div>
          )}
          <div className="grid grid-2">
            {CONFIG_FIELDS.map((f) => (
              <div className="field" key={f.key}>
                <label>{f.label}</label>
                <input
                  className="input mono"
                  dir="ltr"
                  inputMode="numeric"
                  value={draft[f.key] ?? ""}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, [f.key]: e.target.value }))
                  }
                />
                <span className="muted" style={{ fontSize: 11 }}>
                  {f.hint}
                </span>
              </div>
            ))}
          </div>
          {save.isError && (
            <div className="error-text">{apiError(save.error)}</div>
          )}
          {save.isSuccess && !save.isPending && (
            <div className="muted" style={{ fontSize: 12 }}>
              ارسال شد — در انتظار تأیید موتور…
            </div>
          )}
          <div
            className="row"
            style={{ justifyContent: "flex-end", gap: 10, marginTop: 12 }}
          >
            <button type="button" className="btn ghost" onClick={onClose}>
              بستن
            </button>
            <button className="btn primary" disabled={save.isPending}>
              {save.isPending ? <span className="spin" /> : "اعمال روی موتور"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

function SignalTable({
  signals,
  now,
  emptyLabel,
  showDetected,
}: {
  signals: ArbitrageSignal[];
  now: number;
  emptyLabel: string;
  showDetected?: boolean;
}) {
  if (signals.length === 0) return <Empty label={emptyLabel} />;

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>قلم</th>
            <th>خرید از (ارزان‌ترین)</th>
            <th>فروش به (گران‌ترین)</th>
            <th>سود (ریال)</th>
            <th>سود ٪</th>
            <th>سود (گرم طلا)</th>
            <th>{showDetected ? "زمان کشف" : "مهلت"}</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s) => {
            const ds = deadlineState(s.deadline, now);
            return (
              <tr
                key={s.id ?? s.key}
                style={ds.expired ? { opacity: 0.55 } : undefined}
              >
                <td>
                  <b>{s.itemName}</b>
                  <div className="muted" style={{ fontSize: 11 }}>
                    {[s.groupName, s.unit].filter(Boolean).join(" • ") || "—"}
                  </div>
                </td>
                <td>
                  <span
                    className="mono"
                    style={{
                      color: colorFor(s.buyLeg?.providerKey ?? ""),
                      fontWeight: 600,
                    }}
                  >
                    {s.buyLeg?.providerKey ?? "—"}
                  </span>
                  <div className="muted mono" style={{ fontSize: 11 }}>
                    {fmtIrrFromToman(s.buyLeg?.price)} ریال
                  </div>
                </td>
                <td>
                  <span
                    className="mono"
                    style={{
                      color: colorFor(s.sellLeg?.providerKey ?? ""),
                      fontWeight: 600,
                    }}
                  >
                    {s.sellLeg?.providerKey ?? "—"}
                  </span>
                  <div className="muted mono" style={{ fontSize: 11 }}>
                    {fmtIrrFromToman(s.sellLeg?.price)} ریال
                  </div>
                </td>
                <td
                  className="mono"
                  style={{ color: "var(--green)", fontWeight: 600 }}
                >
                  +{fmtNum(s.profitRial)}
                </td>
                <td className="mono" style={{ color: "var(--gold-soft)" }}>
                  {fmtNum(s.profitPercent, 2)}٪
                </td>
                <td className="mono muted">{fmtNum(s.profitGold, 4)}</td>
                <td>
                  {showDetected ? (
                    <span className="mono muted">
                      {s.detectedAt ? fmtTime(s.detectedAt) : "—"}
                    </span>
                  ) : (
                    <Badge kind={ds.kind}>{ds.label}</Badge>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ArbitragePage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>("live");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [configOpen, setConfigOpen] = useState(false);
  const [minProfit, setMinProfit] = useState("");
  const [provider, setProvider] = useState("");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("profitRial");
  const [now, setNow] = useState(() => Date.now());

  // Deadlines are relative, so the countdown column has to tick on its own —
  // the 5s poll alone would make it jump.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const refetchInterval = autoRefresh ? REFRESH_MS : undefined;

  const opp = useQuery({
    queryKey: ["arbitrage-opportunities"],
    queryFn: async () =>
      unwrap<ArbitrageSignal[]>(
        (await api.get("/admin/arbitrage/opportunities")).data,
      ),
    refetchInterval,
  });
  const alerts = useQuery({
    queryKey: ["arbitrage-alerts"],
    queryFn: async () =>
      unwrap<ArbitrageSignal[]>(
        (await api.get("/admin/arbitrage/alerts")).data,
      ),
    refetchInterval,
  });
  const status = useQuery({
    queryKey: ["arbitrage-status"],
    queryFn: async () =>
      unwrap<ArbitrageStatus>((await api.get("/admin/arbitrage/status")).data),
    refetchInterval,
  });
  const history = useQuery({
    queryKey: ["arbitrage-history"],
    queryFn: async () =>
      unwrap<ArbitrageSignal[]>(
        (await api.get("/admin/arbitrage/history?limit=100")).data,
      ),
    enabled: tab === "history",
    refetchInterval: tab === "history" ? refetchInterval : undefined,
  });

  const scanNow = useMutation({
    mutationFn: () => api.post("/admin/arbitrage/scan", {}),
    onSuccess: () => {
      // Give the engine a moment to scan and publish before re-reading.
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["arbitrage-opportunities"] });
        qc.invalidateQueries({ queryKey: ["arbitrage-status"] });
        qc.invalidateQueries({ queryKey: ["arbitrage-alerts"] });
      }, 1200);
    },
  });

  const opps = toArray<ArbitrageSignal>(opp.data);
  const alertList = toArray<ArbitrageSignal>(alerts.data);
  const historyList = toArray<ArbitrageSignal>(history.data);

  const providers = useMemo(() => {
    const set = new Set<string>();
    for (const s of opps) {
      if (s.buyLeg?.providerKey) set.add(s.buyLeg.providerKey);
      if (s.sellLeg?.providerKey) set.add(s.sellLeg.providerKey);
    }
    return [...set].sort();
  }, [opps]);

  const visible = useMemo(() => {
    const minToman = irrToToman(minProfit) ?? 0;
    const term = search.trim().toLowerCase();
    const filtered = opps.filter((s) => {
      if ((s.profitRial ?? 0) < min) return false;
      if (
        provider &&
        s.buyLeg?.providerKey !== provider &&
        s.sellLeg?.providerKey !== provider
      )
        return false;
      if (term && !(s.itemName ?? "").toLowerCase().includes(term))
        return false;
      return true;
    });
    return filtered.sort((a, b) => {
      switch (sortKey) {
        case "profitPercent":
          return (b.profitPercent ?? 0) - (a.profitPercent ?? 0);
        case "itemName":
          return (a.itemName ?? "").localeCompare(b.itemName ?? "");
        case "deadline":
          return (
            new Date(a.deadline ?? 0).getTime() -
            new Date(b.deadline ?? 0).getTime()
          );
        default:
          return (b.profitRial ?? 0) - (a.profitRial ?? 0);
      }
    });
  }, [opps, minProfit, provider, search, sortKey]);

  const st = status.data;
  const best = opps.reduce((m, s) => Math.max(m, s.profitRial ?? 0), 0);
  const live = opps.filter(
    (s) => !deadlineState(s.deadline, now).expired,
  ).length;

  const loading = opp.isLoading || status.isLoading;
  const error = opp.error || status.error;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <SourceBanner status={st} />

      <div className="grid grid-4">
        <Stat
          label="فرصت فعال"
          value={live}
          sub={
            opps.length !== live ? `${opps.length} کل (شامل منقضی)` : undefined
          }
        />
        <Stat label="بهترین سود (ریال)" value={fmtNum(best)} />
        <Stat label="هشدارهای جدید" value={alertList.length} />
        <Stat
          label="پوشش اسکن"
          value={`${st?.totalProviders ?? 0} / ${st?.totalItems ?? 0}`}
          sub="تأمین‌کننده / قلم"
        />
      </div>

      <Card
        title="آربیتراژ بین تأمین‌کنندگان"
        action={
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <label className="row" style={{ gap: 5, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
              />
              بروزرسانی خودکار
            </label>
            <button
              className="btn sm"
              disabled={scanNow.isPending}
              onClick={() => scanNow.mutate()}
            >
              {scanNow.isPending ? <span className="spin" /> : "اسکن فوری"}
            </button>
            <button className="btn sm" onClick={() => setConfigOpen(true)}>
              تنظیمات موتور
            </button>
          </div>
        }
      >
        {scanNow.isError && (
          <div className="error-text">{apiError(scanNow.error)}</div>
        )}

        <div className="toolbar" style={{ marginBottom: 14 }}>
          {TABS.map((t) => (
            <button
              key={t.key}
              className={`tab-btn${tab === t.key ? " active" : ""}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              {t.key === "alerts" && alertList.length > 0 && (
                <Badge kind="red">{alertList.length}</Badge>
              )}
            </button>
          ))}
        </div>

        {tab === "live" && (
          <div className="toolbar" style={{ marginBottom: 14 }}>
            <input
              className="input"
              style={{ maxWidth: 200 }}
              placeholder="جستجوی قلم…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <input
              className="input mono"
              dir="ltr"
              style={{ maxWidth: 160 }}
              inputMode="numeric"
              placeholder="حداقل سود (ریال)"
              value={minProfit}
              onChange={(e) => setMinProfit(e.target.value)}
            />
            <select
              className="select"
              style={{ maxWidth: 200 }}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="">همه تأمین‌کنندگان</option>
              {providers.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select
              className="select"
              style={{ maxWidth: 180 }}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
            >
              <option value="profitRial">مرتب‌سازی: سود ریالی</option>
              <option value="profitPercent">مرتب‌سازی: سود درصدی</option>
              <option value="deadline">مرتب‌سازی: نزدیک‌ترین مهلت</option>
              <option value="itemName">مرتب‌سازی: نام قلم</option>
            </select>
            {visible.length !== opps.length && (
              <span className="muted" style={{ fontSize: 12 }}>
                {visible.length} از {opps.length}
              </span>
            )}
          </div>
        )}

        {tab === "bots" ? (
          <ArbitrageBotsPanel />
        ) : loading ? (
          <Loading label="در حال دریافت فرصت‌های آربیتراژ…" />
        ) : error ? (
          <ErrorState message={apiError(error)} />
        ) : tab === "live" ? (
          <SignalTable
            signals={visible}
            now={now}
            emptyLabel={
              opps.length > 0
                ? "هیچ فرصتی با این فیلترها نیست."
                : st?.source === "none"
                  ? "هیچ داده‌ای از موتور قیمت نرسیده است."
                  : "در حال حاضر فرصت فعالی وجود ندارد."
            }
          />
        ) : tab === "alerts" ? (
          <SignalTable
            signals={alertList}
            now={now}
            showDetected
            emptyLabel="هشدار تازه‌ای ثبت نشده است."
          />
        ) : history.isLoading ? (
          <Loading />
        ) : history.isError ? (
          <ErrorState message={apiError(history.error)} />
        ) : (
          <SignalTable
            signals={historyList}
            now={now}
            showDetected
            emptyLabel="تاریخچه‌ای در Redis موتور قیمت موجود نیست."
          />
        )}
      </Card>

      {configOpen && <ConfigModal onClose={() => setConfigOpen(false)} />}
    </div>
  );
}
