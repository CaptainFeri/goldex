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
  const [modal, setModal] = useState<null | "create" | "settle" | "cancel">(null);
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
                      <span style={{ color: (c.lastDrawdownPercent ?? 0) >= (c.drawdownPercent ?? 100) ? "var(--red)" : "inherit" }}>
                        {c.lastDrawdownPercent?.toFixed(1) ?? "0"}% / {c.drawdownPercent}%
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
    </Card>
  );
}

function CreateCreditModal({ onClose, onSave, loading }: { onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({
    userId: "", amount: 0, hasCallMargin: false, callMarginPercent: 0,
    reminderTimerHours: 24, expireAt: "", notes: "", maxExecutionTradeLevel: 0,
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
    if (!form.expireAt) { setErr("لطفاً تاریخ انقضا را وارد کنید"); return; }
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
            <label>تاریخ انقضا</label>
            <input className="input" type="datetime-local" value={form.expireAt} onChange={(e) => setForm({ ...form, expireAt: e.target.value })} />
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
