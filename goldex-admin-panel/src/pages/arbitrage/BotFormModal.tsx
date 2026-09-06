import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../../api/client";
import { Modal } from "../../components/ui";
import { pairLabel, symbolLabel } from "../../lib/format";
import {
  ArbitrageBot,
  BotEventType,
  BotExecutionMode,
  BotNotifyChannel,
  CHANNEL_LABEL,
  EVENT_LABEL,
} from "./bot-types";

const MARKET_TYPES = [
  { value: "formal", label: "بازار رسمی" },
  { value: "informal", label: "بازار غیررسمی" },
];

const ALL_CHANNELS: BotNotifyChannel[] = ["ADMIN_PANEL", "TELEGRAM", "SMS"];
const ALL_EVENTS: BotEventType[] = [
  "SIGNAL_MATCHED",
  "TRADE_SUBMITTED",
  "TRADE_FILLED",
  "TRADE_FAILED",
  "LOSS_WARNING",
  "STOP_LOSS_HIT",
  "STATUS_CHANGED",
  "ERROR",
];

/** Toggles one value in a list, keeping the caller's array immutable. */
function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

const num = (v: string, fallback: number) => {
  const parsed = Number(v);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Create or edit a bot. Capital is only editable while creating: once a bot is
 * funded, moving its allocation goes through the allocate/release actions so
 * the movement lands on the manager account's ledger.
 */
export default function BotFormModal({
  initial,
  onClose,
}: {
  initial?: ArbitrageBot;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!initial?.id;

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [executionMode, setExecutionMode] = useState<BotExecutionMode>(
    initial?.executionMode ?? "SIGNAL_ONLY"
  );

  const [pricePairIds, setPricePairIds] = useState<string[]>(initial?.scope?.pricePairIds ?? []);
  const [marketTypes, setMarketTypes] = useState<string[]>(initial?.scope?.marketTypes ?? []);
  const [providerKeys, setProviderKeys] = useState<string[]>(initial?.scope?.providerKeys ?? []);
  const [itemIds, setItemIds] = useState((initial?.scope?.itemIds ?? []).join(", "));

  const t = initial?.thresholds;
  const [minProfitRial, setMinProfitRial] = useState(String(t?.minProfitRial ?? 0));
  const [minProfitPercent, setMinProfitPercent] = useState(String(t?.minProfitPercent ?? 0));
  const [maxTradeVolume, setMaxTradeVolume] = useState(String(t?.maxTradeVolume ?? 0));
  const [maxOpenTrades, setMaxOpenTrades] = useState(String(t?.maxOpenTrades ?? 1));
  const [maxTradesPerHour, setMaxTradesPerHour] = useState(String(t?.maxTradesPerHour ?? 10));
  const [cooldownSeconds, setCooldownSeconds] = useState(String(t?.cooldownSeconds ?? 30));
  const [maxQuoteAgeSeconds, setMaxQuoteAgeSeconds] = useState(String(t?.maxQuoteAgeSeconds ?? 30));

  const n = initial?.notifications;
  const [notifyEnabled, setNotifyEnabled] = useState(n?.enabled ?? true);
  const [channels, setChannels] = useState<BotNotifyChannel[]>(n?.channels ?? ["ADMIN_PANEL"]);
  const [events, setEvents] = useState<BotEventType[]>(
    n?.events ?? ["TRADE_SUBMITTED", "TRADE_FILLED", "TRADE_FAILED", "LOSS_WARNING", "STOP_LOSS_HIT", "ERROR"]
  );
  const [lossWarningPercent, setLossWarningPercent] = useState(String(n?.lossWarningPercent ?? 70));
  const [minProfitToNotifyRial, setMinProfitToNotifyRial] = useState(
    String(n?.minProfitToNotifyRial ?? 0)
  );
  const [throttleSeconds, setThrottleSeconds] = useState(String(n?.throttleSeconds ?? 60));
  const [telegramChatId, setTelegramChatId] = useState(n?.telegramChatId ?? "");
  const [smsPhone, setSmsPhone] = useState(n?.smsPhone ?? "");

  const [symbolId, setSymbolId] = useState(initial?.symbolId ?? "");
  const [allocatedAmount, setAllocatedAmount] = useState("");
  const [stopLossPercent, setStopLossPercent] = useState(String(initial?.stopLossPercent ?? 100));

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

  const save = useMutation({
    mutationFn: (body: any) =>
      editing ? api.patch(`/admin/arbitrage/bots/${initial!.id}`, body) : api.post("/admin/arbitrage/bots", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arbitrage-bots"] });
      qc.invalidateQueries({ queryKey: ["manager-accounts"] });
      onClose();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const body: any = {
      name: name.trim(),
      description: description.trim() || undefined,
      executionMode,
      scope: {
        pricePairIds,
        marketTypes,
        providerKeys,
        itemIds: itemIds
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((v) => Number.isFinite(v)),
      },
      thresholds: {
        minProfitRial: num(minProfitRial, 0),
        minProfitPercent: num(minProfitPercent, 0),
        maxTradeVolume: num(maxTradeVolume, 0),
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
        minProfitToNotifyRial: num(minProfitToNotifyRial, 0),
        throttleSeconds: Math.max(0, Math.trunc(num(throttleSeconds, 60))),
        telegramChatId: telegramChatId.trim() || undefined,
        smsPhone: smsPhone.trim() || undefined,
      },
      stopLossPercent: Math.min(100, Math.max(1, num(stopLossPercent, 100))),
    };

    if (!editing && symbolId && num(allocatedAmount, 0) > 0) {
      body.symbolId = symbolId;
      body.allocatedAmount = num(allocatedAmount, 0);
    }

    save.mutate(body);
  }

  const pairList = Array.isArray(pairs.data) ? pairs.data : [];
  const providerList = Array.isArray(providers.data) ? providers.data : [];
  const symbolList = Array.isArray(symbols.data) ? symbols.data : [];

  return (
    <Modal title={editing ? `ویرایش ربات ${initial!.name}` : "ربات آربیتراژ جدید"} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="row" style={{ gap: 12 }}>
          <div className="field grow">
            <label>نام ربات</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="field">
            <label>حالت اجرا</label>
            <select
              className="select"
              value={executionMode}
              onChange={(e) => setExecutionMode(e.target.value as BotExecutionMode)}
            >
              <option value="SIGNAL_ONLY">فقط اعلام سیگنال</option>
              <option value="AUTO">اجرای خودکار سفارش</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>توضیحات</label>
          <textarea className="input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <h4 style={{ margin: "18px 0 8px" }}>دامنه فعالیت</h4>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          هر فهرست خالی یعنی «بدون محدودیت»؛ ربات همه موارد آن دسته را رصد می‌کند.
        </div>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="field grow">
            <label>جفت‌ارزها</label>
            <select
              className="select"
              multiple
              size={5}
              value={pricePairIds}
              onChange={(e) =>
                setPricePairIds(Array.from(e.target.selectedOptions).map((o) => o.value))
              }
            >
              {pairList.map((p: any) => (
                <option key={p.id} value={p.id}>{pairLabel(p)}</option>
              ))}
            </select>
          </div>
          <div className="field grow">
            <label>تأمین‌کنندگان</label>
            <select
              className="select"
              multiple
              size={5}
              value={providerKeys}
              onChange={(e) =>
                setProviderKeys(Array.from(e.target.selectedOptions).map((o) => o.value))
              }
            >
              {providerList.map((p: any) => (
                <option key={p.key} value={p.key}>{p.persianName || p.key}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="field grow">
            <label>بازارها</label>
            <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
              {MARKET_TYPES.map((m) => (
                <label key={m.value} className="row" style={{ gap: 5, fontSize: 13 }}>
                  <input
                    type="checkbox"
                    checked={marketTypes.includes(m.value)}
                    onChange={() => setMarketTypes(toggle(marketTypes, m.value))}
                  />
                  {m.label}
                </label>
              ))}
            </div>
          </div>
          <div className="field grow">
            <label>شناسه اقلام تأمین‌کننده (با کاما)</label>
            <input
              className="input mono"
              dir="ltr"
              placeholder="مثلاً 101, 205"
              value={itemIds}
              onChange={(e) => setItemIds(e.target.value)}
            />
          </div>
        </div>

        <h4 style={{ margin: "18px 0 8px" }}>شرایط معامله</h4>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="field">
            <label>حداقل سود (ریال)</label>
            <input className="input mono" dir="ltr" type="number" value={minProfitRial} onChange={(e) => setMinProfitRial(e.target.value)} />
          </div>
          <div className="field">
            <label>حداقل سود (٪)</label>
            <input className="input mono" dir="ltr" type="number" step="0.01" value={minProfitPercent} onChange={(e) => setMinProfitPercent(e.target.value)} />
          </div>
          <div className="field">
            <label>حداکثر حجم هر معامله (واحد قلم معامله)</label>
            <input className="input mono" dir="ltr" type="number" step="0.0001" value={maxTradeVolume} onChange={(e) => setMaxTradeVolume(e.target.value)} />
          </div>
          <div className="field">
            <label>حداکثر معاملات باز</label>
            <input className="input mono" dir="ltr" type="number" min={1} value={maxOpenTrades} onChange={(e) => setMaxOpenTrades(e.target.value)} />
          </div>
          <div className="field">
            <label>حداکثر معامله در ساعت</label>
            <input className="input mono" dir="ltr" type="number" min={1} value={maxTradesPerHour} onChange={(e) => setMaxTradesPerHour(e.target.value)} />
          </div>
          <div className="field">
            <label>فاصله بین معاملات (ثانیه)</label>
            <input className="input mono" dir="ltr" type="number" min={0} value={cooldownSeconds} onChange={(e) => setCooldownSeconds(e.target.value)} />
          </div>
          <div className="field">
            <label>حداکثر سن قیمت (ثانیه)</label>
            <input className="input mono" dir="ltr" type="number" min={1} value={maxQuoteAgeSeconds} onChange={(e) => setMaxQuoteAgeSeconds(e.target.value)} />
          </div>
        </div>

        <h4 style={{ margin: "18px 0 8px" }}>سرمایه و حد ضرر</h4>
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          سرمایه از حساب مدیریتی شما فریز می‌شود و تا زمانی که زیان محقق‌شده از حد ضرر عبور نکند،
          ربات اجازه معامله دارد.
        </div>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="field grow">
            <label>دارایی</label>
            <select className="select" value={symbolId} onChange={(e) => setSymbolId(e.target.value)} disabled={editing}>
              <option value="">انتخاب دارایی</option>
              {symbolList.map((s: any) => (
                <option key={s.id} value={s.id}>{symbolLabel(s)}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>مبلغ فریز شده</label>
            <input
              className="input mono"
              dir="ltr"
              type="number"
              step="0.0001"
              value={allocatedAmount}
              onChange={(e) => setAllocatedAmount(e.target.value)}
              disabled={editing}
              placeholder={editing ? String(initial?.allocatedAmount ?? 0) : ""}
            />
          </div>
          <div className="field">
            <label>حد ضرر (٪ از سرمایه فریزشده)</label>
            <input className="input mono" dir="ltr" type="number" min={1} max={100} value={stopLossPercent} onChange={(e) => setStopLossPercent(e.target.value)} />
          </div>
        </div>
        {editing && (
          <div className="muted" style={{ fontSize: 12 }}>
            برای تغییر سرمایه، از دکمه‌های «تخصیص سرمایه» و «آزادسازی» در فهرست ربات‌ها استفاده کنید.
          </div>
        )}

        <h4 style={{ margin: "18px 0 8px" }}>اطلاع‌رسانی</h4>
        <label className="row" style={{ gap: 6, fontSize: 13, marginBottom: 8 }}>
          <input type="checkbox" checked={notifyEnabled} onChange={(e) => setNotifyEnabled(e.target.checked)} />
          اطلاع‌رسانی این ربات فعال باشد
        </label>
        <div className="field">
          <label>کانال‌ها</label>
          <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
            {ALL_CHANNELS.map((c) => (
              <label key={c} className="row" style={{ gap: 5, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={channels.includes(c)}
                  onChange={() => setChannels(toggle(channels, c))}
                />
                {CHANNEL_LABEL[c]}
              </label>
            ))}
          </div>
        </div>
        <div className="field">
          <label>رویدادهایی که اطلاع‌رسانی می‌شوند</label>
          <div className="row" style={{ gap: 14, flexWrap: "wrap" }}>
            {ALL_EVENTS.map((ev) => (
              <label key={ev} className="row" style={{ gap: 5, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={events.includes(ev)}
                  onChange={() => setEvents(toggle(events, ev))}
                />
                {EVENT_LABEL[ev]}
              </label>
            ))}
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="field">
            <label>هشدار در چند درصد از حد ضرر</label>
            <input className="input mono" dir="ltr" type="number" min={1} max={100} value={lossWarningPercent} onChange={(e) => setLossWarningPercent(e.target.value)} />
          </div>
          <div className="field">
            <label>حداقل سود برای اطلاع‌رسانی (ریال)</label>
            <input className="input mono" dir="ltr" type="number" value={minProfitToNotifyRial} onChange={(e) => setMinProfitToNotifyRial(e.target.value)} />
          </div>
          <div className="field">
            <label>فاصله بین اعلان‌های هم‌نوع (ثانیه)</label>
            <input className="input mono" dir="ltr" type="number" min={0} value={throttleSeconds} onChange={(e) => setThrottleSeconds(e.target.value)} />
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
          <div className="field grow">
            <label>شناسه چت تلگرام (اختیاری)</label>
            <input className="input mono" dir="ltr" value={telegramChatId ?? ""} onChange={(e) => setTelegramChatId(e.target.value)} />
          </div>
          <div className="field grow">
            <label>شماره پیامک (پیش‌فرض: شماره خودتان)</label>
            <input className="input mono" dir="ltr" value={smsPhone ?? ""} onChange={(e) => setSmsPhone(e.target.value)} />
          </div>
        </div>

        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={save.isPending}>
            {save.isPending ? <span className="spin" /> : "ذخیره"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
