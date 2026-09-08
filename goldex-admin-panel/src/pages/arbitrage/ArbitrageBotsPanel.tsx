import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../../api/client";
import { Loading, ErrorState, Empty, Badge, Modal } from "../../components/ui";
import { fmtNum, fmtDate, symbolLabel } from "../../lib/format";
import BotWizard from "./BotWizard";
import {
  ArbitrageBot,
  ArbitrageBotSummary,
  BOT_STATUS_KIND,
  BOT_STATUS_LABEL,
  CHANNEL_LABEL,
  EVENT_LABEL,
  DIRECTION_LABEL,
  EXECUTION_MODE_LABEL,
  ManagerAccount,
} from "./bot-types";

/** One KPI tile. `hint` carries the number's caveat, not decoration. */
function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "green" | "red" | "gold";
}) {
  const color =
    tone === "green" ? "var(--green)" : tone === "red" ? "var(--red)" : tone === "gold" ? "var(--gold)" : undefined;
  return (
    <div className="kpi-tile" title={hint}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value mono" style={color ? { color } : undefined}>{value}</div>
      <div className="kpi-hint">{hint ?? "\u00a0"}</div>
    </div>
  );
}

/**
 * Section KPIs.
 *
 * Trades and transactions are shown side by side on purpose: one opportunity
 * is one cycle but two provider orders, and reading the cycle count as the
 * number of orders understates what the providers actually saw.
 */
function BotKpis() {
  const summary = useQuery({
    queryKey: ["arbitrage-bots-summary"],
    queryFn: async () =>
      unwrap<ArbitrageBotSummary>((await api.get("/admin/arbitrage/bots/summary")).data),
    refetchInterval: 30_000,
  });

  if (summary.isLoading) return <Loading />;
  if (summary.isError) return <ErrorState message={apiError(summary.error)} />;

  const s = summary.data;
  if (!s) return null;

  const pnlTone = s.totalProfitRial > 0 ? "green" : s.totalProfitRial < 0 ? "red" : undefined;
  const dayTone = s.profitLastDayRial > 0 ? "green" : s.profitLastDayRial < 0 ? "red" : undefined;

  return (
    <div className="kpi-grid" style={{ marginBottom: 16 }}>
      <Kpi
        label="ربات‌های فعال"
        value={`${s.running} / ${s.totalBots}`}
        hint={`${s.autoExecuting} اجرای خودکار · ${s.paused} موقتاً متوقف`}
        tone={s.running > 0 ? "green" : undefined}
      />
      <Kpi
        label="توقف اضطراری (حد ضرر)"
        value={String(s.halted)}
        hint={s.halted > 0 ? "نیازمند بررسی مدیر" : "بدون مورد"}
        tone={s.halted > 0 ? "red" : undefined}
      />
      <Kpi
        label="سرمایه فریزشده (ریال)"
        value={fmtNum(s.allocatedRial, 0)}
        hint={
          s.unpricedAssets.length > 0
            ? `بدون نرخ زنده: ${s.unpricedAssets.join("، ")}`
            : s.allocations.map((a) => `${fmtNum(a.amount, 4)} ${a.symbol}`).join(" · ") || "بدون تخصیص"
        }
      />
      <Kpi
        label="دارایی‌های تأمین‌کننده"
        value={String(s.fundedAssets)}
        hint={
          s.exhaustedAllocations > 0
            ? `${s.exhaustedAllocations} تخصیص با حد ضرر مصرف‌شده`
            : "هیچ تخصیصی حد ضررش را تمام نکرده است"
        }
        tone={s.exhaustedAllocations > 0 ? "gold" : undefined}
      />
      <Kpi
        label="سود/زیان محقق‌شده (ریال)"
        value={fmtNum(s.totalProfitRial, 0)}
        hint={`۲۴ ساعت اخیر: ${fmtNum(s.profitLastDayRial, 0)}`}
        tone={pnlTone}
      />
      <Kpi
        label="میانگین سود هر معامله (ریال)"
        value={s.settledLastDay > 0 ? fmtNum(s.profitLastDayRial / s.settledLastDay, 0) : "—"}
        hint={
          s.settledLastDay > 0
            ? `بر پایه ${s.settledLastDay} معامله تسویه‌شده در ۲۴ ساعت`
            : "معامله‌ای در ۲۴ ساعت اخیر تسویه نشده"
        }
        tone={dayTone}
      />
      <Kpi
        label="معامله / تراکنش"
        value={`${fmtNum(s.totalTrades, 0)} / ${fmtNum(s.totalTransactions, 0)}`}
        hint="هر معامله دو سفارش نزد تأمین‌کننده دارد"
      />
      <Kpi
        label="۲۴ ساعت اخیر"
        value={`${s.tradesLastDay} / ${s.transactionsLastDay}`}
        hint={`${s.openTrades} معامله باز`}
      />
      <Kpi
        label="نرخ موفقیت ۲۴ ساعت"
        value={s.fillRateLastDay === null ? "—" : `${s.fillRateLastDay.toFixed(0)}٪`}
        hint={
          s.fillRateLastDay === null
            ? "معامله‌ای تسویه نشده است"
            : `${s.filledLastDay} موفق · ${s.failedLastDay} ناموفق`
        }
        tone={
          s.fillRateLastDay === null ? undefined : s.fillRateLastDay >= 80 ? "green" : s.fillRateLastDay >= 50 ? "gold" : "red"
        }
      />
      <Kpi
        label="فرصت‌های منطبق"
        value={fmtNum(s.matchedSignals, 0)}
        hint={s.lastSignalAt ? `آخرین: ${fmtDate(s.lastSignalAt)}` : "سیگنالی دریافت نشده"}
      />
    </div>
  );
}

/**
 * Stop-loss consumption, one bar per funded asset.
 *
 * A bot holding gold and Rial has two independent budgets, and averaging them
 * would hide the one that is nearly spent — which is the only one that decides
 * whether the bot keeps trading that side.
 */
function LossBudgetBars({ bot }: { bot: ArbitrageBot }) {
  const funded = (bot.allocations ?? []).filter((a) => a.allocatedAmount > 0);
  if (funded.length === 0) return <span className="muted">—</span>;

  return (
    <div style={{ minWidth: 140, display: "grid", gap: 6 }}>
      {funded.map((a) => {
        const used = Math.min(100, Math.max(0, a.lossBudgetUsedPercent ?? 0));
        const tone = used >= 100 ? "var(--red)" : used >= 70 ? "var(--gold)" : "var(--green)";
        return (
          <div key={a.id}>
            <div
              style={{ height: 6, borderRadius: 3, background: "var(--bg-elev)", overflow: "hidden" }}
            >
              <div style={{ width: `${used}%`, height: "100%", background: tone }} />
            </div>
            <div className="muted mono" style={{ fontSize: 11, marginTop: 3 }}>
              {a.symbol?.slug ?? ""} {fmtNum(a.realizedLoss, 4)} / {fmtNum(a.stopLossAmount, 4)} (
              {used.toFixed(0)}٪)
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The assets a bot holds, as one compact cell. */
function AllocationCell({ bot }: { bot: ArbitrageBot }) {
  const funded = (bot.allocations ?? []).filter((a) => a.allocatedAmount > 0);
  if (funded.length === 0) return <span className="muted">بدون تخصیص</span>;
  return (
    <div style={{ display: "grid", gap: 2 }}>
      {funded.map((a) => (
        <div key={a.id} className="mono" style={{ whiteSpace: "nowrap" }}>
          {fmtNum(a.allocatedAmount, 4)} {a.symbol?.slug ?? ""}
        </div>
      ))}
    </div>
  );
}

function AllocateModal({ bot, onClose }: { bot: ArbitrageBot; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [stopLossPercent, setStopLossPercent] = useState(String(bot.stopLossPercent || 100));
  const [symbolId, setSymbolId] = useState(bot.allocations?.[0]?.symbolId ?? "");

  const symbols = useQuery({
    queryKey: ["symbols-for-bot"],
    queryFn: async () => unwrap<any[]>((await api.get("/admin/symbols/active")).data),
  });
  const accounts = useQuery({
    queryKey: ["manager-accounts"],
    queryFn: async () => unwrap<ManagerAccount[]>((await api.get("/admin/manager-accounts")).data),
  });

  const allocate = useMutation({
    mutationFn: () =>
      api.post(`/admin/arbitrage/bots/${bot.id}/allocate`, {
        symbolId,
        amount: Number(amount),
        stopLossPercent: Number(stopLossPercent),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arbitrage-bots"] });
      qc.invalidateQueries({ queryKey: ["arbitrage-bots-summary"] });
      qc.invalidateQueries({ queryKey: ["manager-accounts"] });
      onClose();
    },
  });

  const symbolList = Array.isArray(symbols.data) ? symbols.data : [];
  const accountList = Array.isArray(accounts.data) ? accounts.data : [];
  const account = accountList.find((a) => a.symbolId === symbolId && a.adminId === bot.ownerAdminId);

  return (
    <Modal title={`تخصیص سرمایه به ${bot.name}`} onClose={onClose}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        مبلغ از موجودی آزاد حساب مدیریتی مالک ربات کسر و فریز می‌شود. انتخاب دارایی جدید یک بودجه
        تازه به ربات اضافه می‌کند و انتخاب دارایی موجود، همان تخصیص را افزایش می‌دهد. حد ضرر هر
        دارایی جدا از بقیه محاسبه می‌شود.
      </div>
      <div className="field">
        <label>دارایی</label>
        <select
          className="select"
          value={symbolId}
          onChange={(e) => setSymbolId(e.target.value)}
        >
          <option value="">انتخاب دارایی</option>
          {symbolList.map((s: any) => (
            <option key={s.id} value={s.id}>{symbolLabel(s)}</option>
          ))}
        </select>
      </div>
      {account && (
        <div className="muted mono" style={{ fontSize: 12, marginBottom: 10 }}>
          موجودی آزاد حساب مدیریتی: {fmtNum(account.availableBalance, 4)}
        </div>
      )}
      <div className="field">
        <label>مبلغ فریز شدنی</label>
        <input className="input mono" dir="ltr" type="number" step="0.0001" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </div>
      <div className="field">
        <label>حد ضرر (٪ از کل سرمایه فریزشده)</label>
        <input className="input mono" dir="ltr" type="number" min={1} max={100} value={stopLossPercent} onChange={(e) => setStopLossPercent(e.target.value)} />
      </div>
      {allocate.isError && <div className="error-text">{apiError(allocate.error)}</div>}
      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button className="btn ghost" onClick={onClose}>انصراف</button>
        <button
          className="btn primary"
          disabled={allocate.isPending || !symbolId || !(Number(amount) > 0)}
          onClick={() => allocate.mutate()}
        >
          {allocate.isPending ? <span className="spin" /> : "تخصیص و فریز"}
        </button>
      </div>
    </Modal>
  );
}

function BotDetailModal({ bot, onClose }: { bot: ArbitrageBot; onClose: () => void }) {
  const [tab, setTab] = useState<"trades" | "events">("trades");

  const trades = useQuery({
    queryKey: ["bot-trades", bot.id],
    queryFn: async () => unwrap<any>((await api.get(`/admin/arbitrage/bots/${bot.id}/trades`)).data),
  });
  const events = useQuery({
    queryKey: ["bot-events", bot.id],
    queryFn: async () => unwrap<any>((await api.get(`/admin/arbitrage/bots/${bot.id}/events`)).data),
  });

  const active = tab === "trades" ? trades : events;
  const rows: any[] = active.data?.items ?? [];

  return (
    <Modal title={`ربات ${bot.name}`} onClose={onClose} wide>
      <div className="grid grid-3" style={{ marginBottom: 14 }}>
        <div className="field">
          <label>وضعیت</label>
          <div>
            <Badge kind={BOT_STATUS_KIND[bot.status]}>{BOT_STATUS_LABEL[bot.status]}</Badge>
          </div>
        </div>
        <div className="field">
          <label>دارایی‌های تخصیص‌یافته</label>
          <div><AllocationCell bot={bot} /></div>
        </div>
        <div className="field">
          <label>معامله / تراکنش</label>
          <div className="mono">
            {fmtNum(bot.totalTrades, 0)} / {fmtNum(bot.totalTransactions ?? 0, 0)}
          </div>
        </div>
        <div className="field">
          <label>فرصت‌های منطبق</label>
          <div className="mono">{fmtNum(bot.matchedSignals, 0)}</div>
        </div>
        <div className="field">
          <label>آخرین معامله</label>
          <div style={{ fontSize: 12 }}>{bot.lastTradeAt ? fmtDate(bot.lastTradeAt) : "—"}</div>
        </div>
      </div>
      {(bot.allocations ?? []).length > 0 && (
        <div className="table-wrap" style={{ marginBottom: 12 }}>
          <table>
            <thead>
              <tr>
                <th>دارایی</th>
                <th>فریزشده</th>
                <th>حد ضرر</th>
                <th>زیان محقق‌شده</th>
                <th>سود/زیان</th>
                <th>بودجه باقی‌مانده</th>
              </tr>
            </thead>
            <tbody>
              {bot.allocations.map((a) => (
                <tr key={a.id}>
                  <td>{a.symbol?.slug ?? "—"}</td>
                  <td className="mono">{fmtNum(a.allocatedAmount, 4)}</td>
                  <td className="mono">
                    {fmtNum(a.stopLossAmount, 4)}{" "}
                    <span className="muted">({fmtNum(a.stopLossPercent, 0)}٪)</span>
                  </td>
                  <td className="mono">{fmtNum(a.realizedLoss, 4)}</td>
                  <td className="mono">{fmtNum(a.realizedPnl, 4)}</td>
                  <td className="mono">{fmtNum(a.lossBudgetRemaining, 4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {bot.haltReason && (
        <div className="error-text" style={{ marginBottom: 12 }}>{bot.haltReason}</div>
      )}
      <div className="field" style={{ marginBottom: 12 }}>
        <label>اطلاع‌رسانی</label>
        <div style={{ fontSize: 13 }}>
          {bot.notifications?.enabled ? (
            <>
              کانال‌ها: {(bot.notifications.channels ?? []).map((c) => CHANNEL_LABEL[c]).join("، ") || "—"}
              {" · "}
              رویدادها: {(bot.notifications.events ?? []).map((e) => EVENT_LABEL[e]).join("، ") || "—"}
            </>
          ) : (
            <span className="muted">غیرفعال</span>
          )}
        </div>
      </div>

      <div className="toolbar" style={{ marginBottom: 12 }}>
        <button className={`tab-btn${tab === "trades" ? " active" : ""}`} onClick={() => setTab("trades")}>
          معاملات
        </button>
        <button className={`tab-btn${tab === "events" ? " active" : ""}`} onClick={() => setTab("events")}>
          رویدادها
        </button>
      </div>

      {active.isLoading ? (
        <Loading />
      ) : active.isError ? (
        <ErrorState message={apiError(active.error)} />
      ) : rows.length === 0 ? (
        <Empty label={tab === "trades" ? "معامله‌ای ثبت نشده است" : "رویدادی ثبت نشده است"} />
      ) : tab === "trades" ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>قلم</th>
                <th>جهت</th>
                <th>خرید از</th>
                <th>فروش به</th>
                <th>حجم</th>
                <th>سود تخمینی (ریال)</th>
                <th>نتیجه (ریال)</th>
                <th>وضعیت</th>
                <th>زمان</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr key={t.id}>
                  <td>{t.itemName ?? t.itemId ?? "—"}</td>
                  <td style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                    {DIRECTION_LABEL[t.direction as keyof typeof DIRECTION_LABEL] ?? "—"}
                  </td>
                  <td className="mono">{t.buyProviderKey}</td>
                  <td className="mono">{t.sellProviderKey}</td>
                  <td className="mono">{fmtNum(t.volume, 4)}</td>
                  <td className="mono">{fmtNum(t.expectedProfitRial, 0)}</td>
                  <td className="mono">
                    {t.realizedProfitRial === null || t.realizedProfitRial === undefined
                      ? "—"
                      : fmtNum(t.realizedProfitRial, 0)}
                  </td>
                  <td>{t.status}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmtDate(t.createdAt ?? t.createAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>رویداد</th>
                <th>شرح</th>
                <th>اطلاع‌رسانی شد</th>
                <th>زمان</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{EVENT_LABEL[e.type as keyof typeof EVENT_LABEL] ?? e.type}</td>
                  <td style={{ fontSize: 13 }}>
                    <div>{e.title}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{e.message}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {(e.notifiedChannels ?? []).length === 0
                      ? "—"
                      : e.notifiedChannels
                          .map((c: string) => CHANNEL_LABEL[c as keyof typeof CHANNEL_LABEL] ?? c)
                          .join("، ")}
                  </td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmtDate(e.createdAt ?? e.createAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/**
 * The bots tab of the arbitrage page: define bots, fund them from a manager
 * account, and watch what they do with that capital.
 */
export default function ArbitrageBotsPanel() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ open: boolean; initial?: ArbitrageBot }>({ open: false });
  const [allocateFor, setAllocateFor] = useState<ArbitrageBot | null>(null);
  const [detailFor, setDetailFor] = useState<ArbitrageBot | null>(null);

  const bots = useQuery({
    queryKey: ["arbitrage-bots"],
    queryFn: async () => unwrap<ArbitrageBot[]>((await api.get("/admin/arbitrage/bots")).data),
  });

  const act = useMutation({
    mutationFn: ({ id, action, body }: { id: string; action: string; body?: any }) =>
      api.post(`/admin/arbitrage/bots/${id}/${action}`, body ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arbitrage-bots"] });
      qc.invalidateQueries({ queryKey: ["manager-accounts"] });
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/arbitrage/bots/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["arbitrage-bots"] });
      qc.invalidateQueries({ queryKey: ["arbitrage-bots-summary"] });
    },
  });

  const list = Array.isArray(bots.data) ? bots.data : [];

  return (
    <>
      <BotKpis />

      <div className="row spread" style={{ marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          هر ربات روی جفت‌ارزها، بازارها و تأمین‌کنندگان دلخواه تنظیم می‌شود و با سرمایه فریزشده از حساب
          مدیریتی مالکش معامله می‌کند؛ با رسیدن زیان به حد ضرر، ربات خودکار متوقف می‌شود.
        </span>
        <button className="btn primary sm" onClick={() => setForm({ open: true })}>+ ربات جدید</button>
      </div>

      {(act.isError || remove.isError) && (
        <div className="error-text" style={{ marginBottom: 12 }}>
          {apiError(act.error ?? remove.error)}
        </div>
      )}

      {bots.isLoading ? (
        <Loading />
      ) : bots.isError ? (
        <ErrorState message={apiError(bots.error)} />
      ) : list.length === 0 ? (
        <Empty label="هنوز رباتی تعریف نشده است" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>نام</th>
                <th>وضعیت</th>
                <th>حالت اجرا</th>
                <th>سرمایه فریزشده</th>
                <th>مصرف حد ضرر</th>
                <th>سود/زیان</th>
                <th>سیگنال / معامله / تراکنش</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id}>
                  <td>
                    <div>{b.name}</div>
                    <div className="muted" style={{ fontSize: 11 }}>{b.description ?? ""}</div>
                  </td>
                  <td>
                    <Badge kind={BOT_STATUS_KIND[b.status]}>{BOT_STATUS_LABEL[b.status]}</Badge>
                  </td>
                  <td style={{ fontSize: 12 }}>{EXECUTION_MODE_LABEL[b.executionMode]}</td>
                  <td><AllocationCell bot={b} /></td>
                  <td><LossBudgetBars bot={b} /></td>
                  <td className="mono">
                    {(b.allocations ?? []).filter((a) => a.allocatedAmount > 0).length === 0 ? (
                      <span className="muted">—</span>
                    ) : (
                      <div style={{ display: "grid", gap: 2 }}>
                        {b.allocations
                          .filter((a) => a.allocatedAmount > 0)
                          .map((a) => (
                            <div key={a.id} style={{ whiteSpace: "nowrap" }}>
                              {fmtNum(a.realizedPnl, 4)} {a.symbol?.slug ?? ""}
                            </div>
                          ))}
                      </div>
                    )}
                  </td>
                  <td className="mono" title="فرصت منطبق / معامله / سفارش نزد تأمین‌کننده">
                    {b.matchedSignals} / {b.totalTrades} / {b.totalTransactions ?? 0}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                      <button className="btn ghost sm" onClick={() => setDetailFor(b)}>جزئیات</button>
                      <button className="btn ghost sm" onClick={() => setForm({ open: true, initial: b })}>ویرایش</button>
                      <button className="btn ghost sm" onClick={() => setAllocateFor(b)}>تخصیص سرمایه</button>
                      {b.status === "RUNNING" ? (
                        <button className="btn sm" disabled={act.isPending} onClick={() => act.mutate({ id: b.id, action: "pause" })}>
                          توقف موقت
                        </button>
                      ) : (
                        <button className="btn sm" disabled={act.isPending} onClick={() => act.mutate({ id: b.id, action: "start" })}>
                          شروع
                        </button>
                      )}
                      {b.status !== "STOPPED" && (
                        <button
                          className="btn sm danger"
                          disabled={act.isPending}
                          onClick={() =>
                            window.confirm(`توقف ربات ${b.name} و آزادسازی سرمایه فریزشده؟`) &&
                            act.mutate({ id: b.id, action: "stop" })
                          }
                        >
                          توقف و آزادسازی
                        </button>
                      )}
                      <button
                        className="btn ghost sm"
                        disabled={remove.isPending || b.status === "RUNNING"}
                        onClick={() => window.confirm(`حذف ربات ${b.name}؟`) && remove.mutate(b.id)}
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {form.open && <BotWizard initial={form.initial} onClose={() => setForm({ open: false })} />}
      {allocateFor && <AllocateModal bot={allocateFor} onClose={() => setAllocateFor(null)} />}
      {detailFor && <BotDetailModal bot={detailFor} onClose={() => setDetailFor(null)} />}
    </>
  );
}
