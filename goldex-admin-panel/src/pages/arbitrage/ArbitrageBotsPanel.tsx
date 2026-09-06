import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../../api/client";
import { Loading, ErrorState, Empty, Badge, Modal } from "../../components/ui";
import { fmtNum, fmtDate, symbolLabel } from "../../lib/format";
import BotFormModal from "./BotFormModal";
import {
  ArbitrageBot,
  BOT_STATUS_KIND,
  BOT_STATUS_LABEL,
  CHANNEL_LABEL,
  EVENT_LABEL,
  EXECUTION_MODE_LABEL,
  ManagerAccount,
} from "./bot-types";

/** How much of the stop-loss budget a bot has spent, as a bar. */
function LossBudgetBar({ bot }: { bot: ArbitrageBot }) {
  const used = Math.min(100, Math.max(0, bot.lossBudgetUsedPercent ?? 0));
  const tone = used >= 100 ? "var(--red)" : used >= 70 ? "var(--gold)" : "var(--green)";
  return (
    <div style={{ minWidth: 120 }}>
      <div style={{ height: 6, borderRadius: 3, background: "var(--bg-elev)", overflow: "hidden" }}>
        <div style={{ width: `${used}%`, height: "100%", background: tone }} />
      </div>
      <div className="muted mono" style={{ fontSize: 11, marginTop: 3 }}>
        {fmtNum(bot.realizedLoss, 4)} / {fmtNum(bot.stopLossAmount, 4)} ({used.toFixed(0)}٪)
      </div>
    </div>
  );
}

function AllocateModal({ bot, onClose }: { bot: ArbitrageBot; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [stopLossPercent, setStopLossPercent] = useState(String(bot.stopLossPercent || 100));
  const [symbolId, setSymbolId] = useState(bot.symbolId ?? "");

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
        مبلغ از موجودی آزاد حساب مدیریتی مالک ربات کسر و فریز می‌شود. حد ضرر بر مبنای کل سرمایه فریزشده
        محاسبه می‌گردد.
      </div>
      <div className="field">
        <label>دارایی</label>
        <select
          className="select"
          value={symbolId}
          onChange={(e) => setSymbolId(e.target.value)}
          disabled={!!bot.symbolId}
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
          <label>سرمایه فریزشده</label>
          <div className="mono">{fmtNum(bot.allocatedAmount, 4)} {bot.symbol?.slug ?? ""}</div>
        </div>
        <div className="field">
          <label>سود/زیان محقق‌شده</label>
          <div className="mono">{fmtNum(bot.realizedPnl, 4)}</div>
        </div>
      </div>
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["arbitrage-bots"] }),
  });

  const list = Array.isArray(bots.data) ? bots.data : [];

  return (
    <>
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
                <th>سیگنال / معامله</th>
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
                  <td className="mono">
                    {fmtNum(b.allocatedAmount, 4)} {b.symbol?.slug ?? ""}
                  </td>
                  <td><LossBudgetBar bot={b} /></td>
                  <td className="mono">{fmtNum(b.realizedPnl, 4)}</td>
                  <td className="mono">{b.matchedSignals} / {b.totalTrades}</td>
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

      {form.open && <BotFormModal initial={form.initial} onClose={() => setForm({ open: false })} />}
      {allocateFor && <AllocateModal bot={allocateFor} onClose={() => setAllocateFor(null)} />}
      {detailFor && <BotDetailModal bot={detailFor} onClose={() => setDetailFor(null)} />}
    </>
  );
}
