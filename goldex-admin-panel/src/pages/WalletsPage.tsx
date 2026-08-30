import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Line } from "react-chartjs-2";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import { fmtNum, fmtDate, symbolLabel } from "../lib/format";
import { gridColor } from "../lib/chart";

function toArray(x: any): any[] {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.data)) return x.data;
  if (x && Array.isArray(x.items)) return x.items;
  if (x && Array.isArray(x.wallets)) return x.wallets;
  return [];
}
const num = (...v: any[]) => {
  for (const x of v) if (x !== undefined && x !== null) return Number(x) || 0;
  return 0;
};
const short = (id: string) => (id ? id.slice(0, 8) + "…" : "—");

const ADJUST_TYPES = [
  { value: "INCREASE_FREE", label: "افزایش موجودی آزاد" },
  { value: "DECREASE_FREE", label: "کاهش موجودی آزاد" },
  { value: "INCREASE_LOCKED", label: "افزایش موجودی قفل‌شده" },
  { value: "DECREASE_LOCKED", label: "کاهش موجودی قفل‌شده" },
];

const FREEZE_TYPES = [
  { value: "FREEZE_ENTIRE", label: "فریز کامل کیف‌پول" },
  { value: "UNFREEZE_ENTIRE", label: "رفع فریز کامل" },
  { value: "FREEZE_FREE", label: "فریز فقط آزاد" },
  { value: "UNFREEZE_FREE", label: "رفع فریز فقط آزاد" },
  { value: "FREEZE_LOCKED", label: "فریز فقط قفل‌شده" },
  { value: "UNFREEZE_LOCKED", label: "رفع فریز فقط قفل‌شده" },
];

const WALLET_TYPE_META: Record<string, { label: string; kind: "gold" | "gray" | "green" | "red" }> = {
  DEPOSIT: { label: "Debit (واریز)", kind: "green" },
  CREDIT: { label: "Credit (اعتباری)", kind: "gold" },
  COLLATERAL: { label: "Collateral (وثیقه)", kind: "gray" },
};
const walletTypeMeta = (w: any) =>
  WALLET_TYPE_META[w.walletType] ?? { label: w.walletType || "—", kind: "gray" as const };

function AdjustModal({ wallet, onClose }: { wallet: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [adjustType, setAdjustType] = useState("INCREASE_FREE");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const adjust = useMutation({
    mutationFn: (p: any) => api.post("/admin/wallets/adjust-balance", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallets"] });
      onClose();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (Number.isNaN(n) || n <= 0) return;
    adjust.mutate({
      walletId: wallet.id,
      adjustType,
      amount: n,
      reason: reason || undefined,
    });
  }

  return (
    <Modal title="تعدیل دقیق موجودی" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="kv" style={{ marginBottom: 12 }}>
          <span className="k">کیف‌پول</span>
          <span className="mono" style={{ fontSize: 12 }}>{wallet.id}</span>
          <span className="k">دارایی</span>
          <span>{symbolLabel(wallet.symbol)}</span>
          <span className="k">موجودی فعلی</span>
          <span className="mono">{fmtNum(num(wallet.freeBalance, wallet.free), 6)} / {fmtNum(num(wallet.lockedBalance, wallet.locked), 6)}</span>
        </div>
        <div className="field">
          <label>نوع تعدیل</label>
          <select className="select" value={adjustType} onChange={(e) => setAdjustType(e.target.value)}>
            {ADJUST_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>مقدار</label>
          <input className="input mono" dir="ltr" type="number" step="0.00000001" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="field">
          <label>دلیل</label>
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {adjust.isError && <div className="error-text">{apiError(adjust.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={adjust.isPending}>{adjust.isPending ? <span className="spin" /> : "ثبت"}</button>
        </div>
      </form>
    </Modal>
  );
}

function FreezeModal({ wallet, onClose }: { wallet: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [action, setAction] = useState("FREEZE_ENTIRE");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");

  const freeze = useMutation({
    mutationFn: (p: any) => api.post("/admin/wallets/freeze", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wallets"] });
      onClose();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = { walletId: wallet.id, action };
    if (amount) payload.amount = Number(amount);
    if (reason) payload.reason = reason;
    freeze.mutate(payload);
  }

  return (
    <Modal title="فریز / رفع فریز کیف‌پول" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="kv" style={{ marginBottom: 12 }}>
          <span className="k">کیف‌پول</span>
          <span className="mono" style={{ fontSize: 12 }}>{wallet.id}</span>
          <span className="k">دارایی</span>
          <span>{symbolLabel(wallet.symbol)}</span>
        </div>
        <div className="field">
          <label>اقدام</label>
          <select className="select" value={action} onChange={(e) => setAction(e.target.value)}>
            {FREEZE_TYPES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="field">
          <label>مقدار (اختیاری — برای فریز جزئی)</label>
          <input className="input mono" dir="ltr" type="number" step="0.00000001" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>دلیل</label>
          <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        {freeze.isError && <div className="error-text">{apiError(freeze.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 12 }}>
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={freeze.isPending}>{freeze.isPending ? <span className="spin" /> : "ثبت"}</button>
        </div>
      </form>
    </Modal>
  );
}

function TxModal({ walletId, onClose }: { walletId: string; onClose: () => void }) {
  const [showHistory, setShowHistory] = useState(false);

  const details = useQuery({
    queryKey: ["wallet-detail", walletId],
    queryFn: async () => unwrap<any>((await api.get(`/admin/wallets/${walletId}`)).data),
  });
  const history = useQuery({
    queryKey: ["wallet-history", walletId],
    enabled: showHistory,
    queryFn: async () => unwrap<any>((await api.get(`/admin/wallets/${walletId}/history`)).data),
  });

  const txns: any[] = details.data?.recentTransactions ?? [];
  const stats = details.data?.stats ?? {};
  const histPoints: any[] = Array.isArray(history.data) ? history.data : history.data?.points ?? history.data?.history ?? [];

  return (
    <Modal wide title="جزئیات کیف‌پول" onClose={onClose}>
      {details.isLoading ? (
        <Loading />
      ) : details.isError ? (
        <ErrorState message={apiError(details.error)} />
      ) : (
        <>
          <div className="kv" style={{ marginBottom: 16 }}>
            <span className="k">موجودی کل</span>
            <span className="mono">{fmtNum(stats.totalBalance, 6)}</span>
            <span className="k">قابل برداشت</span>
            <span className="mono">{fmtNum(stats.availableBalance, 6)}</span>
            <span className="k">قفل‌شده</span>
            <span className="mono">{fmtNum(stats.lockedBalance, 6)}</span>
          </div>

          <div className="row spread" style={{ marginBottom: 8 }}>
            <div className="card-title" style={{ padding: 0, border: 0 }}>تراکنش‌های اخیر</div>
            <button className="btn sm ghost" onClick={() => setShowHistory((v) => !v)}>
              {showHistory ? "پنهان کردن نمودار" : "نمودار تاریخچه"}
            </button>
          </div>

          {showHistory && (
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              {history.isLoading ? (
                <Loading />
              ) : history.isError ? (
                <ErrorState message={apiError(history.error)} />
              ) : histPoints.length === 0 ? (
                <Empty label="تاریخچه‌ای موجود نیست" />
              ) : (
                <div className="chart-box" style={{ height: 200 }}>
                  <Line
                    data={{
                      labels: histPoints.map((p) => new Date(p.timestamp ?? p.date)),
                      datasets: [
                        { label: "آزاد", data: histPoints.map((p) => num(p.free)), borderColor: "#2ea861", backgroundColor: "transparent", tension: 0.3, pointRadius: 0 },
                        { label: "قفل‌شده", data: histPoints.map((p) => num(p.locked)), borderColor: "#d4af37", backgroundColor: "transparent", tension: 0.3, pointRadius: 0 },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: false,
                      scales: { x: { type: "time", grid: { color: gridColor } }, y: { grid: { color: gridColor } } },
                      plugins: { legend: { position: "bottom" } },
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {txns.length === 0 ? (
            <Empty label="تراکنشی ثبت نشده" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>نوع</th>
                    <th>مبلغ</th>
                    <th>وضعیت</th>
                    <th>توضیحات</th>
                    <th>تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id}>
                      <td>{t.transactionType ?? "—"}</td>
                      <td className="mono" style={{ color: num(t.amount) < 0 ? "var(--red)" : "var(--green)" }}>
                        {fmtNum(t.amount, 6)}
                      </td>
                      <td>{t.status ?? "—"}</td>
                      <td className="muted" style={{ maxWidth: 220, whiteSpace: "normal" }}>{t.description ?? "—"}</td>
                      <td>{fmtDate(t.createAt ?? t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export default function WalletsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [txWallet, setTxWallet] = useState<string | null>(null);
  const [adjustWallet, setAdjustWallet] = useState<any | null>(null);
  const [freezeWallet, setFreezeWallet] = useState<any | null>(null);

  const list = useQuery({
    queryKey: ["wallets"],
    queryFn: async () => unwrap<any>((await api.get("/admin/wallets/all-wallets")).data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wallets"] });
  // Increase/decrease via update-balance: CREDIT pairs with DEPOSIT, DEBIT with WITHDRAWAL.
  const adjustLegacy = useMutation({
    mutationFn: (p: { walletId: string; actionType: "CREDIT" | "DEBIT"; amount: number; description?: string }) =>
      api.post("/admin/wallets/update-balance", {
        walletId: p.walletId,
        actionType: p.actionType,
        transactionType: p.actionType === "CREDIT" ? "DEPOSIT" : "WITHDRAWAL",
        amount: p.amount,
        description: p.description,
      }),
    onSuccess: invalidate,
  });
  // Freeze/unfreeze via wallet status.
  const setStatus = useMutation({
    mutationFn: (p: { walletId: string; status: string; note?: string }) =>
      api.post("/admin/wallets/update-status", p),
    onSuccess: invalidate,
  });

  let wallets = toArray(list.data);
  if (q) {
    const s = q.toLowerCase();
    wallets = wallets.filter((w) => JSON.stringify(w).toLowerCase().includes(s));
  }

  function onAdjustLegacy(walletId: string, increase: boolean) {
    const raw = window.prompt(`${increase ? "افزایش" : "کاهش"} موجودی — مقدار:`);
    if (raw === null) return;
    const amount = Number(raw);
    if (Number.isNaN(amount) || amount <= 0) return;
    const description = window.prompt("توضیحات:") || undefined;
    adjustLegacy.mutate({ walletId, actionType: increase ? "CREDIT" : "DEBIT", amount, description });
  }

  function isFrozen(w: any) {
    return w.status && w.status !== "ACTIVE";
  }

  return (
    <Card
      title="کیف‌پول‌های کاربران"
      action={
        <input className="input" style={{ width: 220 }} placeholder="جستجو…" value={q} onChange={(e) => setQ(e.target.value)} />
      }
    >
      {(adjustLegacy.isError || setStatus.isError) && <div className="error-text">{apiError(adjustLegacy.error || setStatus.error)}</div>}
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={apiError(list.error)} />
      ) : wallets.length === 0 ? (
        <Empty />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کاربر</th>
                <th>نوع</th>
                <th>دارایی</th>
                <th>قابل برداشت</th>
                <th>مسدود شده</th>
                <th>قفل‌شده</th>
                <th>استفاده‌شده (اعتبار)</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => {
                const frozen = isFrozen(w);
                const wt = walletTypeMeta(w);
                // CREDIT wallets hold a leveraged capacity (creditBalance) rather
                // than real funds — "used" is what's been drawn from that
                // capacity. This should never go negative (wallet-level guards
                // block any debit past it), so a negative reading here flags a
                // data anomaly worth investigating rather than a normal state.
                const isCredit = w.walletType === "CREDIT";
                const used = isCredit
                  ? num(w.creditBalance) - num(w.calculatedStats?.availableBalance, w.freeBalance, w.free) - num(w.lockedBalance, w.locked)
                  : null;
                return (
                  <tr key={w.id}>
                    <td title={w.id}>
                      {w.user ? `${w.user.firstName ?? ""} ${w.user.lastName ?? ""}`.trim() || short(w.userId) : short(w.userId)}
                    </td>
                    <td>
                      <Badge kind={wt.kind}>{wt.label}</Badge>
                    </td>
                    <td>
                      <Badge kind="gold">{symbolLabel(w.symbol)}</Badge>
                    </td>
                    <td className="mono">{fmtNum(num(w.calculatedStats?.availableBalance, w.freeBalance - w.frozenFreeBalance, w.freeBalance, w.free), 6)}</td>
                    <td className="mono" style={{ color: "var(--danger)" }}>{fmtNum(num(w.frozenFreeBalance, 0), 6)}</td>
                    <td className="mono">{fmtNum(num(w.lockedBalance, w.locked), 6)}</td>
                    <td className="mono" style={used !== null && used < 0 ? { color: "var(--danger)", fontWeight: 700 } : undefined}>
                      {used === null ? "—" : fmtNum(used, 6)}
                    </td>
                    <td>{frozen ? <Badge kind="red">{w.status}</Badge> : <Badge kind="green">فعال</Badge>}</td>
                    <td>
                      <div className="row">
                        <button className="btn sm" onClick={() => setTxWallet(w.id)}>
                          تراکنش‌ها
                        </button>
                        <button className="btn sm" onClick={() => setAdjustWallet(w)}>
                          تعدیل دقیق
                        </button>
                        <button className="btn sm" disabled={adjustLegacy.isPending} onClick={() => onAdjustLegacy(w.id, true)}>
                          + افزایش سریع
                        </button>
                        <button className="btn sm" disabled={adjustLegacy.isPending} onClick={() => onAdjustLegacy(w.id, false)}>
                          − کاهش سریع
                        </button>
                        <button
                          className="btn sm"
                          onClick={() => setFreezeWallet(w)}
                          title="فریز / رفع فریز"
                        >
                          فریز
                        </button>
                        <button
                          className={"btn sm " + (frozen ? "" : "danger")}
                          disabled={setStatus.isPending}
                          onClick={() =>
                            setStatus.mutate({ walletId: w.id, status: frozen ? "ACTIVE" : "FROZEN" })
                          }
                        >
                          {frozen ? "رفع فریز" : "فریز کل"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {txWallet && <TxModal walletId={txWallet} onClose={() => setTxWallet(null)} />}
      {adjustWallet && <AdjustModal wallet={adjustWallet} onClose={() => setAdjustWallet(null)} />}
      {freezeWallet && <FreezeModal wallet={freezeWallet} onClose={() => setFreezeWallet(null)} />}
    </Card>
  );
}
