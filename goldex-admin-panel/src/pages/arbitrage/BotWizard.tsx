import { useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../../api/client";
import { Badge, Modal, Stat } from "../../components/ui";
import { fmtNum, pairLabel, symbolLabel } from "../../lib/format";
import { useAuth } from "../../auth/auth";
import type { ProviderSnapshot } from "../../api/types";
import { Chips, NumField, OptionCards, Picker, PickerOption, SummaryRow, toggle } from "./wizard-parts";
import {
  ArbitrageBot,
  BotEventType,
  BotExecutionMode,
  BotNotifyChannel,
  CHANNEL_LABEL,
  EVENT_LABEL,
  ManagerAccount,
} from "./bot-types";

type StepKey = "basics" | "scope" | "rules" | "capital" | "alerts" | "review";

const STEPS: { key: StepKey; label: string }[] = [
  { key: "basics", label: "شناسه ربات" },
  { key: "scope", label: "دامنه فعالیت" },
  { key: "rules", label: "شرایط معامله" },
  { key: "capital", label: "سرمایه و حد ضرر" },
  { key: "alerts", label: "اطلاع‌رسانی" },
  { key: "review", label: "مرور و ثبت" },
];

const MARKET_TYPES = [
  { value: "formal", label: "بازار رسمی" },
  { value: "informal", label: "بازار غیررسمی" },
];

const ALL_CHANNELS: BotNotifyChannel[] = ["ADMIN_PANEL", "TELEGRAM", "SMS"];

/**
 * Grouped so the choice reads as "what do I want to hear about", rather than a
 * flat list where the routine and the urgent look alike.
 */
const EVENT_GROUPS: { title: string; events: BotEventType[] }[] = [
  { title: "فرصت‌ها و معاملات", events: ["SIGNAL_MATCHED", "TRADE_SUBMITTED", "TRADE_FILLED", "TRADE_FAILED"] },
  { title: "ریسک", events: ["LOSS_WARNING", "STOP_LOSS_HIT"] },
  { title: "وضعیت ربات", events: ["STATUS_CHANGED", "ERROR"] },
];

/** Starting points, so a first bot does not begin from seven empty boxes. */
const PRESETS: {
  key: string;
  label: string;
  sub: string;
  values: {
    minProfitRial: string;
    minProfitPercent: string;
    maxTradeVolume: string;
    maxOpenTrades: string;
    maxTradesPerHour: string;
    cooldownSeconds: string;
    maxQuoteAgeSeconds: string;
  };
}[] = [
  {
    key: "conservative",
    label: "محافظه‌کارانه",
    sub: "فقط فرصت‌های بزرگ، یک معامله در لحظه",
    values: {
      minProfitRial: "5000000",
      minProfitPercent: "0.5",
      maxTradeVolume: "0",
      maxOpenTrades: "1",
      maxTradesPerHour: "4",
      cooldownSeconds: "120",
      maxQuoteAgeSeconds: "15",
    },
  },
  {
    key: "balanced",
    label: "متعادل",
    sub: "پیش‌فرض پیشنهادی",
    values: {
      minProfitRial: "1000000",
      minProfitPercent: "0.2",
      maxTradeVolume: "0",
      maxOpenTrades: "2",
      maxTradesPerHour: "10",
      cooldownSeconds: "30",
      maxQuoteAgeSeconds: "30",
    },
  },
  {
    key: "aggressive",
    label: "تهاجمی",
    sub: "هر فرصت سودده، با سقف تعداد بالاتر",
    values: {
      minProfitRial: "100000",
      minProfitPercent: "0",
      maxTradeVolume: "0",
      maxOpenTrades: "5",
      maxTradesPerHour: "30",
      cooldownSeconds: "5",
      maxQuoteAgeSeconds: "45",
    },
  },
];

const num = (v: string, fallback = 0) => {
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/** One row of the capital step: an asset and the amount to freeze from it. */
interface CapitalLine {
  key: number;
  symbolId: string;
  amount: string;
}

/** Row identity, so removing a row does not renumber the ones after it. */
let lineKeySeed = 0;
const nextLineKey = () => ++lineKeySeed;

/**
 * Defining an arbitrage bot, one decision at a time.
 *
 * The form is a wizard rather than one long page because the decisions are not
 * equivalent: what it watches, when it acts, what it may lose and who it tells
 * are separate questions, and the capital step in particular deserves to be
 * read rather than scrolled past. Every scope list is searchable and shows what
 * it is choosing between — live providers, real pairs, the provider's own
 * priced items — instead of asking for ids to be typed from memory.
 */
export default function BotWizard({
  initial,
  onClose,
}: {
  initial?: ArbitrageBot;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { admin } = useAuth();
  const editing = !!initial?.id;

  const [step, setStep] = useState<StepKey>("basics");
  // A new bot unlocks steps as it goes, so nothing is skipped by accident.
  // An existing one is already complete, so every step is reachable at once —
  // editing is usually about one field, not a walk through all six.
  const [furthest, setFurthest] = useState(initial?.id ? STEPS.length - 1 : 0);

  // ── Basics ───────────────────────────────────────────────────────────────
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [executionMode, setExecutionMode] = useState<BotExecutionMode>(
    initial?.executionMode ?? "SIGNAL_ONLY",
  );

  // ── Scope ────────────────────────────────────────────────────────────────
  const [pricePairIds, setPricePairIds] = useState<string[]>(initial?.scope?.pricePairIds ?? []);
  const [marketTypes, setMarketTypes] = useState<string[]>(initial?.scope?.marketTypes ?? []);
  const [providerKeys, setProviderKeys] = useState<string[]>(initial?.scope?.providerKeys ?? []);
  const [itemIds, setItemIds] = useState<string[]>(
    (initial?.scope?.itemIds ?? []).map((n) => String(n)),
  );
  const [browseProvider, setBrowseProvider] = useState("");

  // ── Rules ────────────────────────────────────────────────────────────────
  const t = initial?.thresholds;
  const [minProfitRial, setMinProfitRial] = useState(String(t?.minProfitRial ?? 1000000));
  const [minProfitPercent, setMinProfitPercent] = useState(String(t?.minProfitPercent ?? 0.2));
  const [maxTradeVolume, setMaxTradeVolume] = useState(String(t?.maxTradeVolume ?? 0));
  const [maxOpenTrades, setMaxOpenTrades] = useState(String(t?.maxOpenTrades ?? 2));
  const [maxTradesPerHour, setMaxTradesPerHour] = useState(String(t?.maxTradesPerHour ?? 10));
  const [cooldownSeconds, setCooldownSeconds] = useState(String(t?.cooldownSeconds ?? 30));
  const [maxQuoteAgeSeconds, setMaxQuoteAgeSeconds] = useState(String(t?.maxQuoteAgeSeconds ?? 30));

  // ── Capital ──────────────────────────────────────────────────────────────
  /**
   * Funding is a list, because a bot can hold several assets at once — cash to
   * buy first, the metal to sell first. One draft row starts the list so the
   * step is never an empty box the manager has to guess at.
   */
  const [lines, setLines] = useState<CapitalLine[]>([{ key: nextLineKey(), symbolId: "", amount: "" }]);
  const [stopLossPercent, setStopLossPercent] = useState(String(initial?.stopLossPercent ?? 100));

  const setLine = (key: number, patch: Partial<CapitalLine>) =>
    setLines((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const addLine = () =>
    setLines((rows) => [...rows, { key: nextLineKey(), symbolId: "", amount: "" }]);
  const removeLine = (key: number) =>
    setLines((rows) => (rows.length > 1 ? rows.filter((row) => row.key !== key) : rows));

  // ── Alerts ───────────────────────────────────────────────────────────────
  const n = initial?.notifications;
  const [notifyEnabled, setNotifyEnabled] = useState(n?.enabled ?? true);
  const [channels, setChannels] = useState<BotNotifyChannel[]>(n?.channels ?? ["ADMIN_PANEL"]);
  const [events, setEvents] = useState<BotEventType[]>(
    n?.events ?? ["TRADE_SUBMITTED", "TRADE_FILLED", "TRADE_FAILED", "LOSS_WARNING", "STOP_LOSS_HIT", "ERROR"],
  );
  const [lossWarningPercent, setLossWarningPercent] = useState(String(n?.lossWarningPercent ?? 70));
  const [minProfitToNotifyRial, setMinProfitToNotifyRial] = useState(String(n?.minProfitToNotifyRial ?? 0));
  const [throttleSeconds, setThrottleSeconds] = useState(String(n?.throttleSeconds ?? 60));
  const [telegramChatId, setTelegramChatId] = useState(n?.telegramChatId ?? "");
  const [smsPhone, setSmsPhone] = useState(n?.smsPhone ?? "");

  // ── Reference data ───────────────────────────────────────────────────────
  const pairs = useQuery({
    queryKey: ["pairs-for-bot"],
    queryFn: async () => unwrap<any[]>((await api.get("/admin/pair")).data),
  });
  const providers = useQuery({
    queryKey: ["providers-for-bot"],
    queryFn: async () => unwrap<any[]>((await api.get("/admin/providers")).data),
  });
  const symbols = useQuery({
    queryKey: ["symbols-for-bot"],
    queryFn: async () => unwrap<any[]>((await api.get("/admin/symbols/active")).data),
  });
  const accounts = useQuery({
    queryKey: ["manager-accounts"],
    queryFn: async () => unwrap<ManagerAccount[]>((await api.get("/admin/manager-accounts")).data),
  });

  const providerList: any[] = Array.isArray(providers.data) ? providers.data : [];
  const pairList: any[] = Array.isArray(pairs.data) ? pairs.data : [];
  const symbolList: any[] = Array.isArray(symbols.data) ? symbols.data : [];
  const accountList: ManagerAccount[] = Array.isArray(accounts.data) ? accounts.data : [];

  /**
   * Items are browsed one provider at a time: a snapshot is per provider, and
   * fetching every provider's whole catalogue to fill a picker would be a lot
   * of traffic for a list the operator scrolls once.
   */
  const itemSourceKeys = providerKeys.length > 0 ? providerKeys : [];
  const effectiveBrowse =
    browseProvider || itemSourceKeys[0] || providerList.find((p) => p.active)?.key || "";

  const snapshots = useQueries({
    queries: (effectiveBrowse ? [effectiveBrowse] : []).map((key) => ({
      queryKey: ["bot-items", key],
      queryFn: async () =>
        unwrap<ProviderSnapshot>((await api.get(`/admin/monitoring/current/${key}`)).data),
      staleTime: 30_000,
    })),
  });
  const itemsLoading = snapshots.some((s) => s.isLoading);
  const itemOptions: PickerOption[] = useMemo(() => {
    const rows = snapshots.flatMap((s) => s.data?.items ?? []);
    return rows.map((it) => ({
      value: String(it.itemId),
      label: `#${it.itemId} — ${it.name ?? "بدون نام"}`,
      keywords: `${it.groupName ?? ""} ${it.unit ?? ""}`,
      meta: it.buyPrice == null ? "بدون قیمت" : `${fmtNum(it.buyPrice, 0)} ریال`,
    }));
  }, [snapshots.map((s) => s.dataUpdatedAt).join(",")]);

  const providerOptions: PickerOption[] = providerList.map((p) => ({
    value: p.key,
    label: p.persianName || p.key,
    keywords: p.key,
    meta: p.active ? <Badge kind="green">فعال</Badge> : <Badge kind="gray">غیرفعال</Badge>,
  }));
  const pairOptions: PickerOption[] = pairList.map((p) => ({
    value: p.id,
    label: pairLabel(p),
    keywords: `${p.baseSymbol?.name ?? ""} ${p.quoteSymbol?.name ?? ""}`,
    meta: p.isValid ? undefined : <Badge kind="gray">بدون قیمت</Badge>,
  }));

  const ownerId = initial?.ownerAdminId ?? admin?.id;
  /** Free balance of the owner's manager account in one asset. */
  const availableOf = (id: string) =>
    accountList.find((a) => a.symbolId === id && a.adminId === ownerId)?.availableBalance ?? 0;
  const symbolOf = (id: string) => symbolList.find((s) => s.id === id);

  const filled = lines.filter((line) => line.symbolId && num(line.amount) > 0);
  const overdrawn = filled.find((line) => num(line.amount) > availableOf(line.symbolId));
  const duplicated = filled.some(
    (line, i) => filled.findIndex((other) => other.symbolId === line.symbolId) !== i,
  );

  // Editing a funded bot re-derives each allocation's loss budget from the
  // capital it already holds. Dropping the percentage below what an asset has
  // already lost halts the bot the moment the change is saved, so that is said
  // before it is saved.
  const existingAllocations = initial?.allocations ?? [];
  const stopLossWouldHalt =
    editing &&
    existingAllocations.length > 0 &&
    existingAllocations
      .filter((a) => a.allocatedAmount > 0)
      .every((a) => (a.allocatedAmount * num(stopLossPercent, 100)) / 100 <= a.realizedLoss);

  // ── Validation, per step ─────────────────────────────────────────────────
  const stepError: Record<StepKey, string | null> = {
    basics: name.trim() ? null : "نام ربات را وارد کنید.",
    scope: null,
    rules:
      num(maxOpenTrades, 1) >= 1 && num(maxTradesPerHour, 1) >= 1 && num(maxQuoteAgeSeconds, 1) >= 1
        ? null
        : "سقف معاملات و اعتبار قیمت باید دست‌کم ۱ باشد.",
    capital: editing
      ? null
      : duplicated
        ? "هر دارایی فقط یک بار قابل تخصیص است؛ ردیف تکراری را حذف کنید."
        : overdrawn
          ? `مبلغ ${symbolOf(overdrawn.symbolId)?.slug ?? ""} از موجودی آزاد حساب مدیریتی بیشتر است.`
          : null, // Capital is optional at creation; it can be allocated later.
    alerts:
      !notifyEnabled || channels.length > 0 ? null : "دست‌کم یک کانال اطلاع‌رسانی انتخاب کنید.",
    review: null,
  };

  const index = STEPS.findIndex((s) => s.key === step);
  const blocked = stepError[step];

  function go(next: number) {
    const target = STEPS[Math.max(0, Math.min(STEPS.length - 1, next))];
    setStep(target.key);
    setFurthest((f) => Math.max(f, STEPS.findIndex((s) => s.key === target.key)));
  }

  function applyPreset(key: string) {
    const preset = PRESETS.find((p) => p.key === key);
    if (!preset) return;
    setMinProfitRial(preset.values.minProfitRial);
    setMinProfitPercent(preset.values.minProfitPercent);
    setMaxTradeVolume(preset.values.maxTradeVolume);
    setMaxOpenTrades(preset.values.maxOpenTrades);
    setMaxTradesPerHour(preset.values.maxTradesPerHour);
    setCooldownSeconds(preset.values.cooldownSeconds);
    setMaxQuoteAgeSeconds(preset.values.maxQuoteAgeSeconds);
  }

  const save = useMutation({
    mutationFn: (body: any) =>
      editing
        ? api.patch(`/admin/arbitrage/bots/${initial!.id}`, body)
        : api.post("/admin/arbitrage/bots", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arbitrage-bots"] });
      qc.invalidateQueries({ queryKey: ["manager-accounts"] });
      onClose();
    },
  });

  function submit() {
    const body: any = {
      name: name.trim(),
      description: description.trim() || undefined,
      executionMode,
      scope: {
        pricePairIds,
        marketTypes,
        providerKeys,
        itemIds: itemIds.map((v) => Number(v)).filter((v) => Number.isFinite(v)),
      },
      thresholds: {
        minProfitRial: num(minProfitRial),
        minProfitPercent: num(minProfitPercent),
        maxTradeVolume: num(maxTradeVolume),
        maxOpenTrades: Math.max(1, Math.trunc(num(maxOpenTrades, 1))),
        maxTradesPerHour: Math.max(1, Math.trunc(num(maxTradesPerHour, 10))),
        cooldownSeconds: Math.max(0, Math.trunc(num(cooldownSeconds, 30))),
        maxQuoteAgeSeconds: Math.max(1, Math.trunc(num(maxQuoteAgeSeconds, 30))),
      },
      notifications: {
        enabled: notifyEnabled,
        channels,
        events,
        lossWarningPercent: Math.min(100, Math.max(1, num(lossWarningPercent, 70))),
        minProfitToNotifyRial: num(minProfitToNotifyRial),
        throttleSeconds: Math.max(0, Math.trunc(num(throttleSeconds, 60))),
        telegramChatId: telegramChatId.trim() || undefined,
        smsPhone: smsPhone.trim() || undefined,
      },
      stopLossPercent: Math.min(100, Math.max(1, num(stopLossPercent, 100))),
    };
    // Capital moves through the allocate route once a bot exists, so it is only
    // part of the create call.
    if (!editing && filled.length > 0) {
      body.allocations = filled.map((line) => ({
        symbolId: line.symbolId,
        amount: num(line.amount),
      }));
    }
    save.mutate(body);
  }

  const labelOfPair = (id: string) => pairOptions.find((o) => o.value === id)?.label ?? id;
  /** Falls back to the bare id for an item the browsed provider does not list. */
  const labelOfItem = (id: string) => itemOptions.find((o) => o.value === id)?.label ?? `#${id}`;
  const labelOfProvider = (key: string) => providerOptions.find((o) => o.value === key)?.label ?? key;

  return (
    <Modal
      title={editing ? `ویرایش ربات ${initial!.name}` : "ساخت ربات آربیتراژ"}
      onClose={onClose}
      width={940}
    >
      <div className="wiz-steps">
        {STEPS.map((s, i) => (
          <button
            key={s.key}
            type="button"
            className={"wiz-step" + (s.key === step ? " active" : i < index ? " done" : "")}
            disabled={i > furthest && i > index}
            onClick={() => go(i)}
          >
            <span className="wiz-num">{i < index ? "✓" : i + 1}</span>
            {s.label}
          </button>
        ))}
      </div>

      <div className="wiz-body">
        {step === "basics" && (
          <>
            <div className="field">
              <label>نام ربات</label>
              <input
                className="input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="مثلاً آربیتراژ طلای آبشده"
                autoFocus
              />
            </div>
            <div className="field">
              <label>توضیح (اختیاری)</label>
              <textarea
                className="input"
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="این ربات برای چه ساخته شده و چه کسی مسئول آن است"
              />
            </div>
            <div className="field">
              <label>حالت اجرا</label>
              <OptionCards
                value={executionMode}
                onChange={setExecutionMode}
                options={[
                  {
                    value: "SIGNAL_ONLY",
                    title: "فقط اعلام سیگنال",
                    sub: "فرصت‌ها ثبت و اطلاع‌رسانی می‌شوند، اما هیچ سفارشی ارسال نمی‌شود. برای شروع و برای سنجش تنظیمات، این حالت امن است.",
                  },
                  {
                    value: "AUTO",
                    title: "اجرای خودکار سفارش",
                    sub: "ربات هر دو سمت معامله را خودش نزد تأمین‌کنندگان ثبت می‌کند. با پول واقعی معامله می‌شود؛ فقط با تنظیمات آزموده‌شده فعال کنید.",
                  },
                ]}
              />
            </div>
          </>
        )}

        {step === "scope" && (
          <>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              هر فهرست خالی یعنی «بدون محدودیت». محدود کردن هر بخش، فقط فرصت‌هایی را نگه می‌دارد که
              همه شرط‌ها را هم‌زمان داشته باشند.
            </div>

            <div className="field">
              <label>بازارها</label>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {MARKET_TYPES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    className={"btn sm" + (marketTypes.includes(m.value) ? " primary" : " ghost")}
                    onClick={() => setMarketTypes(toggle(marketTypes, m.value))}
                  >
                    {m.label}
                  </button>
                ))}
                {marketTypes.length === 0 && (
                  <span className="muted" style={{ fontSize: 11 }}>هر دو بازار</span>
                )}
              </div>
            </div>

            <div className="grid grid-2" style={{ gap: 14, marginTop: 6 }}>
              <div className="field">
                <label>تأمین‌کنندگان</label>
                <Picker
                  options={providerOptions}
                  selected={providerKeys}
                  onChange={setProviderKeys}
                  placeholder="جستجوی تأمین‌کننده…"
                  loading={providers.isLoading}
                  emptyLabel="تأمین‌کننده‌ای ثبت نشده"
                />
                <Chips
                  values={providerKeys}
                  labelOf={labelOfProvider}
                  onRemove={(v) => setProviderKeys(providerKeys.filter((k) => k !== v))}
                />
                <span className="muted" style={{ fontSize: 11 }}>
                  هر دو سمت معامله باید بین این تأمین‌کنندگان باشد.
                </span>
              </div>

              <div className="field">
                <label>جفت‌ارزها</label>
                <Picker
                  options={pairOptions}
                  selected={pricePairIds}
                  onChange={setPricePairIds}
                  placeholder="جستجوی جفت‌ارز…"
                  loading={pairs.isLoading}
                  emptyLabel="جفت‌ارزی ثبت نشده"
                />
                <Chips
                  values={pricePairIds}
                  labelOf={labelOfPair}
                  onRemove={(v) => setPricePairIds(pricePairIds.filter((k) => k !== v))}
                />
              </div>
            </div>

            <div className="field" style={{ marginTop: 12 }}>
              <label>اقلام تأمین‌کننده</label>
              <div className="row" style={{ gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                <span className="muted" style={{ fontSize: 11 }}>نمایش اقلام از:</span>
                <select
                  className="select"
                  style={{ maxWidth: 220 }}
                  value={effectiveBrowse}
                  onChange={(e) => setBrowseProvider(e.target.value)}
                >
                  {providerList.map((p) => (
                    <option key={p.key} value={p.key}>{p.persianName || p.key}</option>
                  ))}
                </select>
              </div>
              <Picker
                options={itemOptions}
                selected={itemIds}
                onChange={setItemIds}
                placeholder="جستجوی قلم…"
                loading={itemsLoading}
                emptyLabel="این تأمین‌کننده قیمتی منتشر نکرده است"
              />
              {/* Items are the one scope list whose options change as you browse
                  providers, so the chips are what keep a selection made under
                  one provider visible — and removable — under another. */}
              <Chips
                values={itemIds}
                labelOf={labelOfItem}
                onRemove={(v) => setItemIds(itemIds.filter((k) => k !== v))}
              />
              <span className="muted" style={{ fontSize: 11 }}>
                اقلام با شناسه انتخاب می‌شوند و بین تأمین‌کنندگان مشترک‌اند؛ می‌توانید از چند
                تأمین‌کننده انتخاب کنید.
              </span>
            </div>
          </>
        )}

        {step === "rules" && (
          <>
            <div className="field">
              <label>الگوی آماده</label>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    className="btn ghost sm"
                    onClick={() => applyPreset(p.key)}
                    title={p.sub}
                  >
                    {p.label}
                  </button>
                ))}
                <span className="muted" style={{ fontSize: 11 }}>
                  مقادیر را پر می‌کند؛ بعد می‌توانید هرکدام را تغییر دهید.
                </span>
              </div>
            </div>

            <div className="grid grid-2" style={{ gap: 14 }}>
              <NumField
                label="حداقل سود هر فرصت"
                suffix="ریال"
                hint="فرصت با سود کمتر نادیده گرفته می‌شود."
                value={minProfitRial}
                onChange={setMinProfitRial}
                min={0}
              />
              <NumField
                label="حداقل سود درصدی"
                suffix="٪"
                hint="نسبت سود به بهای خرید."
                value={minProfitPercent}
                onChange={setMinProfitPercent}
                min={0}
                step="0.01"
              />
              <NumField
                label="حداکثر حجم هر معامله"
                suffix="واحد قلم"
                hint="۰ یعنی فقط بودجه حد ضرر محدودش می‌کند."
                value={maxTradeVolume}
                onChange={setMaxTradeVolume}
                min={0}
                step="0.0001"
              />
              <NumField
                label="حداکثر معاملات باز هم‌زمان"
                value={maxOpenTrades}
                onChange={setMaxOpenTrades}
                min={1}
              />
              <NumField
                label="حداکثر معامله در ساعت"
                value={maxTradesPerHour}
                onChange={setMaxTradesPerHour}
                min={1}
              />
              <NumField
                label="فاصله بین معاملات"
                suffix="ثانیه"
                value={cooldownSeconds}
                onChange={setCooldownSeconds}
                min={0}
              />
              <NumField
                label="حداکثر سن قیمت"
                suffix="ثانیه"
                hint="فرصتی که قیمتش کهنه‌تر از این باشد رد می‌شود."
                value={maxQuoteAgeSeconds}
                onChange={setMaxQuoteAgeSeconds}
                min={1}
              />
            </div>
          </>
        )}

        {step === "capital" && (
          <>
            <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
              سرمایه از حساب‌های مدیریتی مالک ربات فریز می‌شود — خرج نمی‌شود، اما تا آزادسازی در
              اختیار همین ربات است. می‌توانید چند دارایی را هم‌زمان تخصیص دهید (مثلاً ۱۰ گرم طلا و
              ۱۰۰ میلیارد ریال): ریال به ربات اجازه می‌دهد اول بخرد و طلا اجازه می‌دهد اول بفروشد،
              پس رباتی که هر دو را دارد هر دو جهت فرصت را می‌تواند بگیرد. هر دارایی حد ضرر خودش را
              دارد.
            </div>

            {editing ? (
              <>
                {existingAllocations.length === 0 ? (
                  <div className="ok-text" style={{ marginBottom: 12 }}>
                    این ربات هنوز سرمایه‌ای ندارد. از دکمه «تخصیص سرمایه» در فهرست ربات‌ها استفاده
                    کنید.
                  </div>
                ) : (
                  <div className="table-wrap" style={{ marginBottom: 12 }}>
                    <table>
                      <thead>
                        <tr>
                          <th>دارایی</th>
                          <th>فریزشده</th>
                          <th>زیان محقق‌شده</th>
                          <th>بودجه باقی‌مانده</th>
                        </tr>
                      </thead>
                      <tbody>
                        {existingAllocations.map((a) => (
                          <tr key={a.id}>
                            <td>{a.symbol?.slug ?? "—"}</td>
                            <td className="mono">{fmtNum(a.allocatedAmount, 4)}</td>
                            <td className="mono">{fmtNum(a.realizedLoss, 4)}</td>
                            <td className="mono">
                              {fmtNum(
                                Math.max(
                                  0,
                                  (a.allocatedAmount * num(stopLossPercent, 100)) / 100 -
                                    a.realizedLoss,
                                ),
                                4,
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="ok-text" style={{ marginBottom: 12 }}>
                  برای تغییر سرمایه از دکمه «تخصیص سرمایه» در فهرست ربات‌ها استفاده کنید تا جابه‌جایی
                  در دفتر حساب مدیریتی ثبت شود. در این صفحه فقط درصد حد ضرر قابل ویرایش است.
                </div>
              </>
            ) : (
              <>
                {lines.map((line) => {
                  const free = line.symbolId ? availableOf(line.symbolId) : 0;
                  const slug = symbolOf(line.symbolId)?.slug ?? "";
                  const taken = lines.some(
                    (other) => other.key !== line.key && other.symbolId === line.symbolId,
                  );
                  return (
                    <div key={line.key} className="alloc-row">
                      <div className="field">
                        <label>دارایی</label>
                        <select
                          className="select"
                          value={line.symbolId}
                          onChange={(e) => setLine(line.key, { symbolId: e.target.value })}
                        >
                          <option value="">— انتخاب دارایی —</option>
                          {symbolList.map((sym: any) => (
                            <option key={sym.id} value={sym.id}>{symbolLabel(sym)}</option>
                          ))}
                        </select>
                        {line.symbolId && (
                          <span className={taken ? "error-text" : "muted"} style={{ fontSize: 11 }}>
                            {taken ? (
                              "این دارایی در ردیف دیگری انتخاب شده است."
                            ) : (
                              <>
                                موجودی آزاد: <span className="mono">{fmtNum(free, 4)}</span> {slug}
                              </>
                            )}
                          </span>
                        )}
                      </div>

                      <div className="field">
                        <label>مبلغ فریز شدنی</label>
                        <div className="row" style={{ gap: 6 }}>
                          <input
                            className="input mono"
                            dir="ltr"
                            type="number"
                            step="0.0001"
                            min={0}
                            value={line.amount}
                            onChange={(e) => setLine(line.key, { amount: e.target.value })}
                            disabled={!line.symbolId}
                            style={{ flex: 1 }}
                          />
                          <button
                            type="button"
                            className="btn ghost sm"
                            disabled={!line.symbolId || free <= 0}
                            onClick={() => setLine(line.key, { amount: String(free) })}
                          >
                            حداکثر
                          </button>
                        </div>
                        {line.symbolId && num(line.amount) > free && (
                          <span className="error-text" style={{ fontSize: 11 }}>
                            بیش از موجودی آزاد این حساب است.
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        className="btn ghost sm alloc-remove"
                        disabled={lines.length === 1}
                        onClick={() => removeLine(line.key)}
                        title="حذف این دارایی"
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}

                <button type="button" className="btn ghost sm" onClick={addLine}>
                  + دارایی دیگر
                </button>

                {filled.length === 0 && (
                  <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>
                    می‌توانید ربات را بدون سرمایه بسازید و بعداً تخصیص دهید — ولی تا آن زمان قابل
                    اجرا نیست.
                  </div>
                )}

                {filled.length > 0 && (
                  <div className="ok-text" style={{ marginTop: 10, fontSize: 12 }}>
                    {filled.some((line) => symbolOf(line.symbolId)?.symbolType === "rial") &&
                    filled.some((line) => symbolOf(line.symbolId)?.symbolType !== "rial")
                      ? "با این ترکیب، ربات هم می‌تواند اول بخرد و هم اول بفروشد؛ برای هر فرصت، دارایی مناسب را خودش انتخاب می‌کند."
                      : filled.every((line) => symbolOf(line.symbolId)?.symbolType === "rial")
                        ? "با تخصیص ریال، ربات فقط فرصت‌هایی را می‌گیرد که اول خرید و سپس فروش دارند. برای «فروش سپس خرید» یک دارایی پایه (مثلاً طلا) هم اضافه کنید."
                        : "با این دارایی، ربات روی جفت‌ارزهایی که پایه‌شان همین دارایی است اول می‌فروشد و سپس بازخرید می‌کند. برای «خرید سپس فروش» ریال هم اضافه کنید."}
                  </div>
                )}
              </>
            )}

            <div className="field" style={{ marginTop: 6 }}>
              <label>حد ضرر — {stopLossPercent}٪ از هر دارایی تخصیص‌یافته</label>
              <input
                className="range"
                type="range"
                min={1}
                max={100}
                value={num(stopLossPercent, 100)}
                onChange={(e) => setStopLossPercent(e.target.value)}
              />
              <span className="muted" style={{ fontSize: 11 }}>
                {/* Each asset is measured against its own allocation, so the
                    budget is a list of amounts rather than one number. */}
                {editing
                  ? existingAllocations.length > 0
                    ? `بر مبنای سرمایه فعلی: ${existingAllocations
                        .map(
                          (a) =>
                            `${fmtNum((a.allocatedAmount * num(stopLossPercent, 100)) / 100, 4)} ${
                              a.symbol?.slug ?? ""
                            }`,
                        )
                        .join(" · ")}`
                    : "پس از تخصیص سرمایه، مبلغ حد ضرر از همین درصد حساب می‌شود."
                  : filled.length > 0
                    ? `یعنی ربات تا ${filled
                        .map(
                          (line) =>
                            `${fmtNum((num(line.amount) * num(stopLossPercent, 100)) / 100, 4)} ${
                              symbolOf(line.symbolId)?.slug ?? ""
                            }`,
                        )
                        .join(" و ")} زیان اجازه معامله دارد.`
                    : "پس از تخصیص سرمایه، مبلغ حد ضرر از همین درصد حساب می‌شود."}
              </span>
              {editing && stopLossWouldHalt && (
                <div className="error-text">
                  ⚠ با این درصد، بودجه حد ضرر همه دارایی‌های ربات از زیان محقق‌شده‌شان کمتر است و
                  ربات بلافاصله پس از ذخیره متوقف می‌شود.
                </div>
              )}
            </div>
          </>
        )}

        {step === "alerts" && (
          <>
            <label className="row" style={{ gap: 8, fontSize: 13, marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={notifyEnabled}
                onChange={(e) => setNotifyEnabled(e.target.checked)}
              />
              اطلاع‌رسانی این ربات فعال باشد
            </label>

            <div className="field">
              <label>کانال‌ها</label>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                {ALL_CHANNELS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    disabled={!notifyEnabled}
                    className={"btn sm" + (channels.includes(c) ? " primary" : " ghost")}
                    onClick={() => setChannels(toggle(channels, c))}
                  >
                    {CHANNEL_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>

            <div className="field">
              <label>چه رویدادهایی اطلاع داده شود</label>
              <div className="grid grid-3" style={{ gap: 12 }}>
                {EVENT_GROUPS.map((g) => (
                  <div key={g.title}>
                    <div className="muted" style={{ fontSize: 11, marginBottom: 5 }}>{g.title}</div>
                    {g.events.map((ev) => (
                      <label
                        key={ev}
                        className="row"
                        style={{ gap: 6, fontSize: 12, padding: "3px 0" }}
                      >
                        <input
                          type="checkbox"
                          disabled={!notifyEnabled}
                          checked={events.includes(ev)}
                          onChange={() => setEvents(toggle(events, ev))}
                        />
                        {EVENT_LABEL[ev]}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
              <span className="muted" style={{ fontSize: 11 }}>
                رویدادهای انتخاب‌نشده هم ثبت می‌شوند؛ فقط اعلان نمی‌فرستند.
              </span>
            </div>

            <div className="grid grid-3" style={{ gap: 14 }}>
              <NumField
                label="هشدار زیان در"
                suffix="٪ حد ضرر"
                value={lossWarningPercent}
                onChange={setLossWarningPercent}
                min={1}
                max={100}
              />
              <NumField
                label="حداقل سود برای اعلان"
                suffix="ریال"
                value={minProfitToNotifyRial}
                onChange={setMinProfitToNotifyRial}
                min={0}
              />
              <NumField
                label="فاصله اعلان‌های هم‌نوع"
                suffix="ثانیه"
                value={throttleSeconds}
                onChange={setThrottleSeconds}
                min={0}
              />
            </div>

            {channels.includes("TELEGRAM") && (
              <div className="field">
                <label>شناسه چت تلگرام (اختیاری)</label>
                <input
                  className="input mono"
                  dir="ltr"
                  value={telegramChatId ?? ""}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="خالی بگذارید تا به کانال پیش‌فرض برود"
                />
              </div>
            )}
            {channels.includes("SMS") && (
              <div className="field">
                <label>شماره پیامک (اختیاری)</label>
                <input
                  className="input mono"
                  dir="ltr"
                  value={smsPhone ?? ""}
                  onChange={(e) => setSmsPhone(e.target.value)}
                  placeholder="خالی بگذارید تا به شماره خودتان برود"
                />
              </div>
            )}
          </>
        )}

        {step === "review" && (
          <>
            <SummaryRow label="نام">{name || "—"}</SummaryRow>
            <SummaryRow label="حالت اجرا">
              {executionMode === "AUTO" ? (
                <Badge kind="gold">اجرای خودکار سفارش</Badge>
              ) : (
                <Badge kind="blue">فقط اعلام سیگنال</Badge>
              )}
            </SummaryRow>
            <SummaryRow label="بازارها">
              {marketTypes.length === 0
                ? "هر دو بازار"
                : marketTypes.map((m) => MARKET_TYPES.find((x) => x.value === m)?.label ?? m).join("، ")}
            </SummaryRow>
            <SummaryRow label="تأمین‌کنندگان">
              {providerKeys.length === 0 ? "بدون محدودیت" : providerKeys.map(labelOfProvider).join("، ")}
            </SummaryRow>
            <SummaryRow label="جفت‌ارزها">
              {pricePairIds.length === 0 ? "بدون محدودیت" : pricePairIds.map(labelOfPair).join("، ")}
            </SummaryRow>
            <SummaryRow label="اقلام">
              {itemIds.length === 0 ? "بدون محدودیت" : itemIds.join("، ")}
            </SummaryRow>
            <SummaryRow label="شرط سود">
              حداقل <span className="mono">{fmtNum(num(minProfitRial), 0)}</span> ریال و{" "}
              <span className="mono">{minProfitPercent}</span>٪
            </SummaryRow>
            <SummaryRow label="سقف‌ها">
              <span className="mono">{maxOpenTrades}</span> معامله باز ·{" "}
              <span className="mono">{maxTradesPerHour}</span> در ساعت ·{" "}
              <span className="mono">{cooldownSeconds}</span> ثانیه فاصله
            </SummaryRow>
            <SummaryRow label="سرمایه">
              {editing ? (
                existingAllocations.length > 0 ? (
                  <>
                    {existingAllocations
                      .map((a) => `${fmtNum(a.allocatedAmount, 4)} ${a.symbol?.slug ?? ""}`)
                      .join(" · ")}{" "}
                    (بدون تغییر)
                  </>
                ) : (
                  "بدون تخصیص"
                )
              ) : filled.length > 0 ? (
                <>
                  {filled
                    .map(
                      (line) =>
                        `${fmtNum(num(line.amount), 4)} ${symbolOf(line.symbolId)?.slug ?? ""}`,
                    )
                    .join(" · ")}{" "}
                  فریز می‌شود
                </>
              ) : (
                "بدون تخصیص — ربات تا زمان تخصیص سرمایه قابل اجرا نیست"
              )}
            </SummaryRow>
            <SummaryRow label="حد ضرر">
              <span className="mono">{stopLossPercent}</span>٪ از هر دارایی
              {!editing && filled.length > 0 && (
                <>
                  {" "}
                  (
                  {filled
                    .map(
                      (line) =>
                        `${fmtNum((num(line.amount) * num(stopLossPercent, 100)) / 100, 4)} ${
                          symbolOf(line.symbolId)?.slug ?? ""
                        }`,
                    )
                    .join(" · ")}
                  )
                </>
              )}
            </SummaryRow>
            <SummaryRow label="اطلاع‌رسانی">
              {!notifyEnabled
                ? "غیرفعال"
                : `${channels.map((c) => CHANNEL_LABEL[c]).join("، ")} — ${events.length} رویداد`}
            </SummaryRow>

            {executionMode === "AUTO" && (
              <div className="error-text" style={{ marginTop: 12 }}>
                {/* A running bot picks the change up straight away; telling its
                    operator it needs starting would be plainly wrong. */}
                {initial?.status === "RUNNING"
                  ? "⚠ این ربات با پول واقعی معامله می‌کند و هم‌اکنون در حال اجراست؛ تغییرات بلافاصله پس از ذخیره اعمال می‌شود."
                  : "⚠ این ربات با پول واقعی معامله می‌کند. پس از ثبت، تا زمانی که آن را «شروع» نکنید اجرا نمی‌شود."}
              </div>
            )}
          </>
        )}
      </div>

      {save.isError && <div className="error-text">{apiError(save.error)}</div>}
      {blocked && <div className="error-text">{blocked}</div>}

      <div className="wiz-foot">
        <button type="button" className="btn ghost" onClick={onClose}>
          انصراف
        </button>
        <div className="row" style={{ gap: 8 }}>
          {index > 0 && (
            <button type="button" className="btn ghost" onClick={() => go(index - 1)}>
              قبلی
            </button>
          )}
          {step === "review" ? (
            <button
              type="button"
              className="btn primary"
              disabled={save.isPending || !name.trim()}
              onClick={submit}
            >
              {save.isPending ? <span className="spin" /> : editing ? "ذخیره تغییرات" : "ساخت ربات"}
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={!!blocked}
              onClick={() => go(index + 1)}
            >
              بعدی
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
