import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Badge, Loading, ErrorState, Empty, Modal } from "../components/ui";
import { useNotify } from "../notifications/NotifyProvider";
import type { Credit } from "../api/types";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار",
  ACTIVE: "فعال",
  SETTLED: "تسویه شده",
  EXPIRED: "منقضی شده",
  CANCELLED: "لغو شده",
};
const STATUS_KINDS: Record<string, string> = {
  PENDING: "gold",
  ACTIVE: "green",
  SETTLED: "blue",
  EXPIRED: "gray",
  CANCELLED: "red",
};

const SETTLEMENT_STATE_LABELS: Record<string, string> = {
  GREEN: "سبز",
  YELLOW: "زرد",
  RED: "قرمز",
  ADMIN_REVIEW: "بررسی ادمین",
  AUTO_LIQUIDATION: "نقد خودکار",
  SETTLED: "تسویه شده",
};
const SETTLEMENT_STATE_KINDS: Record<string, string> = {
  GREEN: "green",
  YELLOW: "gold",
  RED: "red",
  ADMIN_REVIEW: "blue",
  AUTO_LIQUIDATION: "gray",
  SETTLED: "blue",
};

const RISK_STATE_LABELS: Record<string, string> = {
  NORMAL: "عادی",
  WARNING: "هشدار",
  MARGIN_CALL: "فراخوان سرمایه",
  REDUCING: "کاهش",
  LIQUIDATING: "نقد شدن",
  LIQUIDATED: "نقد شده",
  SETTLED: "تسویه شده",
  DEFAULT: "پیش‌فرض",
};
const RISK_STATE_KINDS: Record<string, string> = {
  NORMAL: "green",
  WARNING: "gold",
  MARGIN_CALL: "red",
  REDUCING: "gold",
  LIQUIDATING: "red",
  LIQUIDATED: "gray",
  SETTLED: "blue",
  DEFAULT: "red",
};

const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار",
  PARTIALLY_COMPLETED: "نیمه انجام",
  COMPLETED: "انجام شده",
  CANCELLED: "لغو شده",
  REJECTED: "رد شده",
};

const CREDIT_ORDER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: "فعال",
  MARGIN_CALLED: "فراخوان",
  COMPLETED: "انجام شده",
  CANCELLED: "لغو شده",
};

const fmtNum = (n: any) => (n ?? 0).toLocaleString("fa-IR");
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

// A credit that triggered a margin call stays ACTIVE but all the user's wallets
// are frozen (blocked) until the admin settles/cancels it. Detect it from the
// linked credit orders.
const isMarginCalled = (c: Credit) =>
  c.status === "ACTIVE" && (c.creditOrders || []).some((o) => o?.status === "MARGIN_CALLED");

export default function CreditsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState<null | "create" | "settle" | "cancel" | "detail">(null);
  const [selected, setSelected] = useState<Credit | null>(null);
  const qc = useQueryClient();
  const notify = useNotify().notify;

  const list = useQuery({
    queryKey: ["credits", search, statusFilter],
    queryFn: async () => {
      const params: any = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      return unwrap<Credit[]>((await api.get("/admin/credits", { params })).data);
    },
  });

  const create = useMutation({
    mutationFn: (body: any) => api.post("/admin/credits", body),
    onSuccess: () => {
      notify({ title: "اعتبار با موفقیت ایجاد شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      setModal(null);
    },
    onError: (e: any) => {
      notify({ title: "خطا در ایجاد اعتبار", body: apiError(e), kind: "error" });
    },
  });

  const settle = useMutation({
    mutationFn: ({ id, ...body }: any) => api.post(`/admin/credits/${id}/settle`, body),
    onSuccess: () => {
      notify({ title: "اعتبار با موفقیت تسویه شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      setModal(null);
      setSelected(null);
    },
    onError: (e: any) => {
      notify({ title: "خطا در تسویه اعتبار", body: apiError(e), kind: "error" });
    },
  });

  const cancel = useMutation({
    mutationFn: ({ id, ...body }: any) => api.post(`/admin/credits/${id}/cancel`, body),
    onSuccess: () => {
      notify({ title: "اعتبار با موفقیت لغو شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      setModal(null);
      setSelected(null);
    },
    onError: (e: any) => {
      notify({ title: "خطا در لغو اعتبار", body: apiError(e), kind: "error" });
    },
  });

  return (
    <Card
      title="مدیریت اعتبارات"
      action={
        <div className="row" style={{ gap: 8 }}>
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">همه وضعیت‌ها</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input className="input" placeholder="جستجو (کد یا کاربر)…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <button className="btn" onClick={() => setModal("create")}>ایجاد اعتبار</button>
        </div>
      }
    >
      {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={apiError(list.error)} /> :
      !list.data?.length ? <Empty label="هیچ اعتباری یافت نشد" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کد اعتبار</th>
                <th>کاربر</th>
                <th>مبلغ</th>
                <th>اهرم</th>
                <th>حد اعتبار</th>
                <th>درادون</th>
                <th>وضعیت</th>
                <th>وضعیت تسویه</th>
                <th>وضعیت ریسک</th>
                <th>بازه اخطار</th>
                <th>انقضا</th>
                <th>فراخوان سرمایه</th>
                <th>سطح اجرا</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {(list.data as Credit[]).map((c) => (
                <tr key={c.id}>
                  <td><code>{c.creditCode}</code></td>
                  <td>
                    {c.user ? `${c.user.firstName ?? ""} ${c.user.lastName ?? ""}`.trim() || c.user.phone || c.user.email || c.userId : c.userId}
                  </td>
                  <td>{fmtNum(c.amount)}</td>
                  <td className="mono">{c.leverage != null ? `${c.leverage}x` : "—"}</td>
                  <td className="mono">{fmtNum(c.creditLimit)}</td>
                  <td>
                    {c.drawdownPercent != null ? (
                      <span style={{ color: Number(c.lastDrawdownPercent ?? 0) >= Number(c.drawdownPercent ?? 100) ? "var(--red)" : "inherit" }}>
                        {Number(c.lastDrawdownPercent ?? 0).toFixed(1)}% / {c.drawdownPercent}%
                      </span>
                    ) : "—"}
                  </td>
                  <td>
                    <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                      <Badge kind={STATUS_KINDS[c.status] as "green" | "red" | "gold" | "gray"}>{STATUS_LABELS[c.status]}</Badge>
                      {isMarginCalled(c) && <Badge kind="red">مسدود / فراخوان</Badge>}
                    </div>
                  </td>
                  <td>
                    <Badge kind={(SETTLEMENT_STATE_KINDS[c.settlementState] || "gray") as any}>
                      {SETTLEMENT_STATE_LABELS[c.settlementState] || c.settlementState || "—"}
                    </Badge>
                  </td>
                  <td>
                    <Badge kind={(RISK_STATE_KINDS[c.riskState] || "gray") as any}>
                      {RISK_STATE_LABELS[c.riskState] || c.riskState || "—"}
                    </Badge>
                  </td>
                  <td>{c.reminderTimerHours}h</td>
                  <td>{fmtDate(c.expireAt)}</td>
                  <td>
                    {c.hasCallMargin
                      ? <Badge kind="gold">{c.callMarginPercent ?? "—"}%</Badge>
                      : <Badge kind="gray">ندارد</Badge>}
                  </td>
                  <td>
                    {c.maxExecutionTradeLevel != null
                      ? `${c.executedTradeLevel ?? 0}/${c.maxExecutionTradeLevel}`
                      : "—"}
                  </td>
                  <td>
                    <div className="row" style={{ gap: 4 }}>
                      <button className="btn sm" onClick={() => { setSelected(c); setModal("detail"); }}>جزئیات</button>
                      {c.status === "ACTIVE" && (
                        <>
                          <button className="btn sm" onClick={() => { setSelected(c); setModal("settle"); }}>تسویه</button>
                          <button className="btn sm" onClick={() => { setSelected(c); setModal("cancel"); }}>لغو</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal === "create" && <CreateCreditModal onClose={() => setModal(null)} onSave={(d) => create.mutate(d)} loading={create.isPending} />}
      {modal === "settle" && selected && (
        <SettleCreditModal credit={selected} onClose={() => { setModal(null); setSelected(null); }} onSave={(d) => settle.mutate({ id: selected.id, creditId: selected.id, ...d })} loading={settle.isPending} />
      )}
      {modal === "cancel" && selected && (
        <CancelCreditModal credit={selected} onClose={() => { setModal(null); setSelected(null); }} onSave={(d) => cancel.mutate({ id: selected.id, creditId: selected.id, ...d })} loading={cancel.isPending} />
      )}
      {modal === "detail" && selected && (
        <CreditDetailModal credit={selected} onClose={() => { setModal(null); setSelected(null); }} />
      )}
    </Card>
  );
}

function CreateCreditModal({ onClose, onSave, loading }: { onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({
    userId: "", amount: 0, hasCallMargin: false, callMarginPercent: 0,
    reminderTimerHours: 24, notes: "", maxExecutionTradeLevel: 0,
  });
  const [frozenWallets, setFrozenWallets] = useState<Record<string, number>>({});
  const [increasedWallets, setIncreasedWallets] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");

  const users = useQuery({
    queryKey: ["users-dropdown"],
    queryFn: async () => {
      const res = await api.get("/admin/users/users", { params: { pageSize: 999, pageNumber: 1 } });
      return (res.data?.data?.userList ?? []) as any[];
    },
  });

  const userWallets = useQuery({
    queryKey: ["user-wallets", form.userId],
    queryFn: async () => {
      const res = await api.get("/admin/wallets/all-wallets");
      const payload = res.data?.data ?? {};
      const list = Array.isArray(payload.data) ? payload.data : [];
      return list.filter((w: any) => w.userId === form.userId);
    },
    enabled: !!form.userId,
  });

  // Material wallets that can be frozen as collateral.
  const materialWallets = (userWallets.data ?? []).filter((w: any) => w.symbol?.symbolType === "material");
  // All wallets (incl. RIAL) eligible to receive the credit amount.
  const creditWalletOptions = (userWallets.data ?? []).filter((w: any) => w.symbol?.symbolType !== "material" || true);

  const avail = (w: any) => Number(w.calculatedStats?.availableBalance ?? w.freeBalance - w.frozenFreeBalance);

  const toggleWallet = (w: any) => {
    const copy = { ...frozenWallets };
    if (copy[w.id] !== undefined) {
      delete copy[w.id];
    } else {
      copy[w.id] = avail(w);
    }
    setFrozenWallets(copy);
  };

  const updateAmount = (walletId: string, val: number, maxAvail: number) => {
    setFrozenWallets({ ...frozenWallets, [walletId]: Math.max(0, Math.min(maxAvail, val || 0)) });
  };

  const toggleIncrease = (w: any) => {
    const copy = { ...increasedWallets };
    if (copy[w.id] !== undefined) delete copy[w.id];
    else copy[w.id] = 0;
    setIncreasedWallets(copy);
  };

  const updateIncrease = (walletId: string, val: number) => {
    setIncreasedWallets({ ...increasedWallets, [walletId]: Math.max(0, val || 0) });
  };

  const handle = () => {
    if (!form.userId) { setErr("لطفاً یک کاربر انتخاب کنید"); return; }
    const fw = Object.entries(frozenWallets).filter(([, v]) => v > 0).map(([walletId, amount]) => ({ walletId, amount }));
    if (fw.length === 0) { setErr("حداقل یک دارایی برای مسدود کردن انتخاب کنید"); return; }
    const inc = Object.entries(increasedWallets).filter(([, v]) => v > 0).map(([walletId, amount]) => ({ walletId, amount }));
    if (inc.length === 0) { setErr("حداقل یک کیف‌پول برای دریافت اعتبار انتخاب کنید"); return; }
    const totalAmount = inc.reduce((s, x) => s + x.amount, 0);
    setErr("");
    onSave({
      ...form,
      amount: totalAmount,
      maxExecutionTradeLevel: form.maxExecutionTradeLevel > 0 ? form.maxExecutionTradeLevel : undefined,
      increasedWallets: inc,
      frozenWallets: fw,
    });
  };

  return (
    <Modal title="ایجاد اعتبار جدید" onClose={onClose} wide>
      <form className="modal-form" onSubmit={(e) => { e.preventDefault(); handle(); }}>
        {err && <div className="form-err">{err}</div>}

        <div className="form-grid">
          <div className="field">
            <label>کاربر</label>
            <select className="select" value={form.userId} onChange={(e) => { setForm({ ...form, userId: e.target.value }); setFrozenWallets({}); }}>
              <option value="">— انتخاب کاربر —</option>
              {users.isLoading && <option disabled>در حال بارگذاری…</option>}
              {(users.data ?? []).map((u: any) => (
                <option key={u.id} value={u.id}>
                  {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.phone || u.email || u.id}
                </option>
              ))}
            </select>
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 6 }}>کیف‌پول‌هایی که اعتبار به آن‌ها اضافه می‌شود (دریافت اعتبار):</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {form.userId && creditWalletOptions.map((w: any) => {
                const checked = increasedWallets[w.id] !== undefined;
                return (
                  <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--bg)", borderRadius: 6, fontSize: "0.85rem" }}>
                    <input type="checkbox" checked={checked} onChange={() => toggleIncrease(w)} />
                    <span style={{ fontWeight: 600 }}>{w.symbol?.slug || w.symbol?.name}</span>
                    {checked && (
                      <>
                        <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>مبلغ:</span>
                        <input type="number" className="input mono" min={0} dir="ltr"
                          style={{ width: 120 }} value={increasedWallets[w.id]}
                          onChange={(e) => updateIncrease(w.id, Number(e.target.value))} />
                        <span style={{ color: "var(--text-muted)" }}>واحد</span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>مبلغ کل اعتبار</label>
            <div style={{ fontSize: "0.85rem", fontWeight: 700 }} dir="ltr">
              {Object.values(increasedWallets).filter((v) => v > 0).reduce((s, v) => s + v, 0).toLocaleString("fa-IR")}
            </div>
          </div>

          <div className="field">
            <label>مدت زمان یادآوری (ساعت)</label>
            <input className="input" type="number" min={1} placeholder="مثال: 24" value={form.reminderTimerHours} onChange={(e) => setForm({ ...form, reminderTimerHours: +e.target.value })} />
          </div>

          <div className="field">
            <label>حداکثر سطح اجرا (پوزیشن باز همزمان)</label>
            <input className="input" type="number" min={0} placeholder="0 = نامحدود" value={form.maxExecutionTradeLevel} onChange={(e) => setForm({ ...form, maxExecutionTradeLevel: +e.target.value })} />
          </div>

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label className="checkbox-label">
              <input type="checkbox" checked={form.hasCallMargin} onChange={(e) => setForm({ ...form, hasCallMargin: e.target.checked })} />
              <span>فعالسازی فراخوان سرمایه (Call Margin)</span>
            </label>
          </div>

          {form.hasCallMargin && (
            <div className="field">
              <label>درصد فراخوان</label>
              <input className="input" type="number" min={0} max={100} placeholder="مثال: 10" value={form.callMarginPercent} onChange={(e) => setForm({ ...form, callMarginPercent: +e.target.value })} />
            </div>
          )}

          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>یادداشت (اختیاری)</label>
            <textarea className="input" rows={3} placeholder="توضیحات اضافی…" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          {form.userId && materialWallets.length > 0 && (
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 6 }}>انتخاب دارایی‌هایی که مسدود می‌شوند (وثیقه):</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {materialWallets.map((w: any) => {
                  const a = avail(w);
                  const checked = frozenWallets[w.id] !== undefined;
                  return (
                    <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", background: "var(--bg)", borderRadius: 6, fontSize: "0.85rem" }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleWallet(w)} />
                      <span style={{ fontWeight: 600 }}>{w.symbol?.slug || w.symbol?.name}</span>
                      <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>موجودی:</span>
                      <span className="mono">{a.toLocaleString("fa-IR")}</span>
                      {checked && (
                        <>
                          <span style={{ color: "var(--text-muted)", marginRight: 4 }}>مسدود:</span>
                          <input type="number" className="input mono" min={0} step="0.001" dir="ltr"
                            style={{ width: 100 }} value={frozenWallets[w.id]}
                            onChange={(e) => updateAmount(w.id, Number(e.target.value), a)} />
                          <span style={{ color: "var(--text-muted)" }}>g</span>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? <><span className="spin" /> در حال ایجاد…</> : "ایجاد اعتبار"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SettleCreditModal({ credit, onClose, onSave, loading }: { credit: Credit; onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
  const [desc, setDesc] = useState("");
  const [imgPath, setImgPath] = useState("");

  return (
    <Modal title={`تسویه اعتبار ${credit.creditCode}`} onClose={onClose}>
      <form className="modal-form" onSubmit={(e) => { e.preventDefault(); onSave({ description: desc, imagePath: imgPath || undefined }); }}>
        <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, color: "var(--text-faint)", lineHeight: 1.6 }}>
          با تسویه این اعتبار، مبلغ قرض‌گرفته‌شده از کیف‌پول اعتبار بازپس‌گرفته می‌شود؛ در صورت کمبود،
          دارایی‌های مسدودشده (وثیقه) برای پوشش آن نقد می‌شوند. سپس کیف‌پول‌های کاربر رفع انسداد شده و
          کاربر می‌تواند دوباره معامله کند. {isMarginCalled(credit) && "این اعتبار به‌دلیل فراخوان سرمایه مسدود شده و تسویه آن کاربر را رفع انسداد می‌کند."}
        </div>

        <div className="form-grid">
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>توضیحات (اختیاری)</label>
            <textarea className="input" rows={3} placeholder="دلیل تسویه را وارد کنید…" value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>تصویر (اختیاری)</label>
            <input className="input" placeholder="مسیر تصویر یا آدرس فایل" value={imgPath} onChange={(e) => setImgPath(e.target.value)} />
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? <><span className="spin" /> در حال تسویه…</> : "تسویه اعتبار"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CancelCreditModal({ credit, onClose, onSave, loading }: { credit: Credit; onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
  const [reason, setReason] = useState("");

  return (
    <Modal title={`لغو اعتبار ${credit.creditCode}`} onClose={onClose}>
      <form className="modal-form" onSubmit={(e) => { e.preventDefault(); onSave({ reason }); }}>
        <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, color: "var(--text-faint)", lineHeight: 1.6 }}>
          با لغو این اعتبار، تمام موجودی‌های مسدود شده آزاد شده و کیف‌پول‌ها به حالت عادی باز می‌گردند.
        </div>

        <div className="form-grid">
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>دلیل لغو</label>
            <textarea className="input" rows={3} placeholder="دلیل لغو اعتبار را وارد کنید…" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? <><span className="spin" /> در حال لغو…</> : "لغو اعتبار"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function CreditDetailModal({ credit, onClose }: { credit: Credit; onClose: () => void }) {
  // Fetch full credit details with orders
  const creditDetail = useQuery({
    queryKey: ["credit-detail", credit.id],
    queryFn: async () => unwrap<Credit>((await api.get(`/admin/credits/${credit.id}`)).data),
  });

  // Fetch PnL calculation
  const pnl = useQuery({
    queryKey: ["credit-pnl", credit.id],
    queryFn: async () => unwrap<{
      totalPnL: number;
      realizedPnL: number;
      unrealizedPnL: number;
      orders: Array<{
        orderId: string;
        side: string;
        entryPrice: number;
        currentPrice: number | null;
        quantity: number;
        executedQuantity: number;
        pnl: number;
        status: string;
        pairKey: string;
      }>;
    }>((await api.get(`/admin/credits/${credit.id}/pnl`)).data),
  });

  const c = creditDetail.data || credit;
  const pnlData = pnl.data;

  return (
    <Modal title={`جزئیات اعتبار ${c.creditCode}`} onClose={onClose} wide>
      {creditDetail.isLoading ? (
        <Loading />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Credit Info */}
          <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
            <span className="k">کاربر</span>
            <span className="v" style={{ gridColumn: "2 / -1" }}>
              {c.user ? `${c.user.firstName ?? ""} ${c.user.lastName ?? ""}`.trim() || c.user.phone || c.user.email : c.userId}
            </span>

            <span className="k">وضعیت</span>
            <span className="v">
              <Badge kind={STATUS_KINDS[c.status] as any}>{STATUS_LABELS[c.status]}</Badge>
            </span>

            <span className="k">مبلغ اعتبار</span>
            <span className="v mono">{fmtNum(c.amount)} ریال</span>

            {c.leverage != null && (
              <>
                <span className="k">اهرم</span>
                <span className="v mono">{c.leverage}x</span>
              </>
            )}

            {c.creditLimit != null && (
              <>
                <span className="k">حد اعتبار</span>
                <span className="v mono">{fmtNum(c.creditLimit)} ریال</span>
              </>
            )}

            {c.collateralAmount != null && (
              <>
                <span className="k">وثیقه</span>
                <span className="v mono">{fmtNum(c.collateralAmount)}</span>
              </>
            )}

            {c.drawdownPercent != null && (
              <>
                <span className="k">درادون</span>
                <span className="v">
                  <span style={{ color: Number(c.lastDrawdownPercent ?? 0) >= Number(c.drawdownPercent ?? 100) ? "var(--red)" : "inherit" }}>
                    {Number(c.lastDrawdownPercent ?? 0).toFixed(1)}% / {c.drawdownPercent}%
                  </span>
                </span>
              </>
            )}

            <span className="k">وضعیت ریسک</span>
            <span className="v">
              <Badge kind={RISK_STATE_KINDS[c.riskState] as any}>{RISK_STATE_LABELS[c.riskState] || c.riskState}</Badge>
            </span>

            <span className="k">وضعیت تسویه</span>
            <span className="v">
              <Badge kind={SETTLEMENT_STATE_KINDS[c.settlementState] as any}>{SETTLEMENT_STATE_LABELS[c.settlementState] || c.settlementState}</Badge>
            </span>

            <span className="k">ایجاد</span>
            <span className="v">{fmtDate(c.createAt)}</span>

            <span className="k">انقضا</span>
            <span className="v">{fmtDate(c.expireAt)}</span>

            {c.settledAt && (
              <>
                <span className="k">تسویه</span>
                <span className="v">{fmtDate(c.settledAt)}</span>
              </>
            )}
          </div>

          {/* PnL Section */}
          {pnl.isLoading ? (
            <Loading />
          ) : pnlData ? (
            <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
              <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>سود و زیان</h4>
              <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <span className="k">کل سود/زیان</span>
                <span className="v mono" style={{ color: pnlData.totalPnL >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                  {pnlData.totalPnL >= 0 ? "+" : ""}{fmtNum(pnlData.totalPnL)} ریال
                </span>

                <span className="k">سود/زیان محقق شده</span>
                <span className="v mono" style={{ color: pnlData.realizedPnL >= 0 ? "var(--green)" : "var(--red)" }}>
                  {pnlData.realizedPnL >= 0 ? "+" : ""}{fmtNum(pnlData.realizedPnL)} ریال
                </span>

                <span className="k">سود/زیان محقق نشده</span>
                <span className="v mono" style={{ color: pnlData.unrealizedPnL >= 0 ? "var(--green)" : "var(--red)" }}>
                  {pnlData.unrealizedPnL >= 0 ? "+" : ""}{fmtNum(pnlData.unrealizedPnL)} ریال
                </span>
              </div>
            </div>
          ) : null}

          {/* Orders Section */}
          <div>
            <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>سفارشات اعتباری ({pnlData?.orders.length || 0})</h4>
            {pnlData?.orders.length === 0 ? (
              <Empty label="هیچ سفارشی ثبت نشده" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>جفت</th>
                      <th>جهت</th>
                      <th>قیمت ورود</th>
                      <th>قیمت فعلی</th>
                      <th>مقدار</th>
                      <th>انجام شده</th>
                      <th>سود/زیان</th>
                      <th>وضعیت سفارش</th>
                      <th>وضعیت اعتبار</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pnlData?.orders.map((o) => (
                      <tr key={o.orderId}>
                        <td className="mono">{o.pairKey}</td>
                        <td>
                          <Badge kind={o.side === "BUY" ? "green" : "red"}>
                            {o.side === "BUY" ? "خرید" : "فروش"}
                          </Badge>
                        </td>
                        <td className="mono">{fmtNum(o.entryPrice)}</td>
                        <td className="mono">{o.currentPrice ? fmtNum(o.currentPrice) : "—"}</td>
                        <td className="mono">{fmtNum(o.quantity)}</td>
                        <td className="mono">{fmtNum(o.executedQuantity)}</td>
                        <td className="mono" style={{ color: o.pnl >= 0 ? "var(--green)" : "var(--red)", fontWeight: 500 }}>
                          {o.pnl >= 0 ? "+" : ""}{fmtNum(o.pnl)}
                        </td>
                        <td>
                          <Badge kind={o.status === "COMPLETED" ? "green" : o.status === "CANCELLED" ? "gray" : "gold"}>
                            {ORDER_STATUS_LABELS[o.status] || o.status}
                          </Badge>
                        </td>
                        <td>
                          <Badge kind={
                            c.creditOrders?.find(co => co.orderId === o.orderId)?.status === "ACTIVE" ? "green" :
                            c.creditOrders?.find(co => co.orderId === o.orderId)?.status === "MARGIN_CALLED" ? "red" :
                            c.creditOrders?.find(co => co.orderId === o.orderId)?.status === "COMPLETED" ? "gold" : "gray"
                          }>
                            {CREDIT_ORDER_STATUS_LABELS[c.creditOrders?.find(co => co.orderId === o.orderId)?.status || ""] || "—"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Metadata */}
          {c.metadata && Object.keys(c.metadata).length > 0 && (
            <details style={{ fontSize: 12 }}>
              <summary style={{ cursor: "pointer", color: "var(--text-muted)" }}>متادیتا</summary>
              <pre style={{ background: "var(--bg)", padding: 8, borderRadius: 4, overflow: "auto", fontSize: 11, direction: "ltr" }}>
                {JSON.stringify(c.metadata, null, 2)}
              </pre>
            </details>
          )}

          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>بستن</button>
          </div>
        </div>
      )}
    </Modal>
  );
}
