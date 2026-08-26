import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Badge, Loading, ErrorState, Empty, Modal } from "../components/ui";
import { useNotify } from "../notifications/NotifyProvider";
import type { Credit } from "../api/types";

const STATUS_LABELS: Record<string, string> = {
  PENDING: "در انتظار",
  ACTIVE: "فعال",
  SUSPENDED: "تعلیق شده",
  SETTLED: "تسویه شده",
  EXPIRED: "منقضی شده",
  CANCELLED: "لغو شده",
};
const STATUS_KINDS: Record<string, string> = {
  PENDING: "gold",
  ACTIVE: "green",
  SUSPENDED: "red",
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
  const [settlementFilter, setSettlementFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [modal, setModal] = useState<null | "create" | "settle" | "cancel" | "liquidate" | "extend" | "adjust" | "user" | "detail">(null);
  const [selected, setSelected] = useState<Credit | null>(null);
  const qc = useQueryClient();
  const notify = useNotify().notify;

  const stats = useQuery({
    queryKey: ["credit-stats"],
    queryFn: async () => unwrap<any>((await api.get("/admin/credits/stats")).data),
  });

  const list = useQuery({
    queryKey: ["credits", search, statusFilter, settlementFilter, riskFilter, page],
    queryFn: async () => {
      const params: any = { page, limit: pageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (settlementFilter) params.settlementState = settlementFilter;
      if (riskFilter) params.riskState = riskFilter;
      return unwrap<{ items: Credit[]; total: number; page: number; limit: number }>(
        (await api.get("/admin/credits", { params })).data
      );
    },
  });
  const data = list.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const create = useMutation({
    mutationFn: (body: any) => api.post("/admin/credits", body),
    onSuccess: () => {
      notify({ title: "اعتبار با موفقیت ایجاد شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
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
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
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
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
      setModal(null);
      setSelected(null);
    },
    onError: (e: any) => {
      notify({ title: "خطا در لغو اعتبار", body: apiError(e), kind: "error" });
    },
  });

  const liquidate = useMutation({
    mutationFn: ({ id, ...body }: any) => api.post(`/admin/credits/${id}/liquidate`, body),
    onSuccess: () => {
      notify({ title: "اعتبار با موفقیت نقد شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
      setModal(null);
      setSelected(null);
    },
    onError: (e: any) => {
      notify({ title: "خطا در نقد کردن اعتبار", body: apiError(e), kind: "error" });
    },
  });

  const suspend = useMutation({
    mutationFn: ({ id, reason }: any) => api.post(`/admin/credits/${id}/suspend`, { reason }),
    onSuccess: () => {
      notify({ title: "اعتبار تعلیق شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
    },
    onError: (e: any) => notify({ title: "خطا در تعلیق", body: apiError(e), kind: "error" }),
  });

  const reactivate = useMutation({
    mutationFn: ({ id, reason }: any) => api.post(`/admin/credits/${id}/reactivate`, { reason }),
    onSuccess: () => {
      notify({ title: "اعتبار رفع تعلیق شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
    },
    onError: (e: any) => notify({ title: "خطا در رفع تعلیق", body: apiError(e), kind: "error" }),
  });

  const extend = useMutation({
    mutationFn: ({ id, ...body }: any) => api.post(`/admin/credits/${id}/extend`, body),
    onSuccess: () => {
      notify({ title: "مهلت تسویه تمدید شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
      setModal(null);
      setSelected(null);
    },
    onError: (e: any) => notify({ title: "خطا در تمدید", body: apiError(e), kind: "error" }),
  });

  const adjustLimit = useMutation({
    mutationFn: ({ id, ...body }: any) => api.post(`/admin/credits/${id}/adjust-limit`, body),
    onSuccess: () => {
      notify({ title: "حد اعتبار تغییر کرد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
      setModal(null);
      setSelected(null);
    },
    onError: (e: any) => notify({ title: "خطا در تغییر حد اعتبار", body: apiError(e), kind: "error" }),
  });

  return (
    <Card
      title="مدیریت اعتبارات"
      action={
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <select className="select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">همه وضعیت‌ها</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select className="select" value={settlementFilter} onChange={(e) => { setSettlementFilter(e.target.value); setPage(1); }}>
            <option value="">همه وضعیت تسویه</option>
            {Object.entries(SETTLEMENT_STATE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select className="select" value={riskFilter} onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }}>
            <option value="">همه وضعیت ریسک</option>
            {Object.entries(RISK_STATE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input className="input" placeholder="جستجو (کد / نام / موبایل)…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <button className="btn ghost"
            onClick={() => {
              const p = new URLSearchParams();
              if (search) p.set("search", search);
              if (statusFilter) p.set("status", statusFilter);
              if (settlementFilter) p.set("settlementState", settlementFilter);
              if (riskFilter) p.set("riskState", riskFilter);
              window.open(`/api/admin/credits/export?${p.toString()}`, "_blank");
            }}>
            خروجی CSV
          </button>
          <button className="btn" onClick={() => setModal("create")}>ایجاد اعتبار</button>
        </div>
      }
    >
      {/* ── Dashboard KPIs ─────────────────────────────── */}
      {stats.data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 16 }}>
          <KpiCard label="کل اعتبارات" value={stats.data.totals.credits} tone="blue" />
          <KpiCard label="فعال" value={stats.data.totals.active} tone="green" />
          <KpiCard label="تسویه‌شده" value={stats.data.totals.settled} tone="gray" />
          <KpiCard label="لغو شده" value={stats.data.totals.cancelled} tone="gray" />
          <KpiCard label="حد اعتبار فعال" value={stats.data.exposure.activeCreditLimit} tone="gold" currency />
          <KpiCard label="اعتبار استفاده‌شده" value={stats.data.exposure.activeUsedCredit} tone="gold" currency />
          <KpiCard label="ارزش وثیقه فعال" value={stats.data.exposure.activeCollateralValue} tone="gold" currency />
          <KpiCard label="پیش‌فرض" value={stats.data.risk.inDefault} tone="red" />
          <KpiCard label="فراخوان سرمایه" value={stats.data.risk.marginCall} tone="red" />
          <KpiCard label="هشدار" value={stats.data.risk.warning} tone="gold" />
          <KpiCard label="بررسی ادمین" value={stats.data.risk.adminReview} tone="blue" />
          <KpiCard label="تعلیق شده" value={stats.data.risk.suspended} tone="red" />
        </div>
      )}

      {list.isLoading ? <Loading /> : list.isError ? <ErrorState message={apiError(list.error)} /> :
      !items.length ? <Empty label="هیچ اعتباری یافت نشد" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کد اعتبار</th>
                <th>کاربر</th>
                <th>مبلغ</th>
                <th>اهرم</th>
                <th>حد اعتبار</th>
                <th>استفاده‌شده</th>
                <th>موجود</th>
                <th>وثیقه قفل/آزاد</th>
                <th>محدودیت‌ها</th>
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
              {items.map((c) => (
                <tr key={c.id}>
                  <td><code>{c.creditCode}</code></td>
                  <td>
                    {c.user ? `${c.user.firstName ?? ""} ${c.user.lastName ?? ""}`.trim() || c.user.phone || c.user.email || c.userId : c.userId}
                  </td>
                  <td>{fmtNum(c.amount)}</td>
                  <td className="mono">{c.leverage != null ? `${c.leverage}x` : "—"}</td>
                  <td className="mono">{fmtNum(c.creditLimit)}</td>
                  <td className="mono">{fmtNum(c.usedCredit)}</td>
                  <td className="mono">{fmtNum(c.availableCredit ?? Math.max(0, (c.creditLimit ?? 0) - (c.usedCredit ?? 0)))}</td>
                  <td>
                    {c.collateralLocked != null ? (
                      <span className="mono" style={{ fontSize: 12 }}>
                        {fmtNum(c.collateralLocked)} / {fmtNum(c.collateralAmount ?? 0)}
                      </span>
                    ) : "—"}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {c.maxTradeChainDepth != null || c.maxConcurrentOrders != null || c.maxCreditNotional != null ? (
                      <span className="mono">
                        {[
                          c.maxConcurrentOrders != null ? `موازی ${c.maxConcurrentOrders}` : null,
                          c.maxTradeChainDepth != null ? `عمق ${c.maxTradeChainDepth}` : null,
                          c.maxCreditNotional != null ? `حد ${fmtNum(c.maxCreditNotional)}` : null,
                        ].filter(Boolean).join(" | ")}
                      </span>
                    ) : "—"}
                  </td>
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
                    <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                      <button className="btn sm" onClick={() => { setSelected(c); setModal("detail"); }}>جزئیات</button>
                      <button className="btn sm" onClick={() => { setSelected(c); setModal("user"); }}>کاربر</button>
                      {(c.status === "ACTIVE" || c.status === "SUSPENDED") && (
                        <>
                          <button className="btn sm" onClick={() => { setSelected(c); setModal("settle"); }}>تسویه</button>
                          <button className="btn sm" onClick={() => { setSelected(c); setModal("liquidate"); }}>نقد اجباری</button>
                          <button className="btn sm" onClick={() => { setSelected(c); setModal("extend"); }}>تمدید</button>
                          <button className="btn sm" onClick={() => { setSelected(c); setModal("adjust"); }}>حد اعتبار</button>
                          <button className="btn sm" onClick={() => { setSelected(c); setModal("cancel"); }}>لغو</button>
                        </>
                      )}
                      {c.status === "SUSPENDED"
                        ? <button className="btn sm" onClick={() => reactivate.mutate({ id: c.id, reason: "reactivate" })}>رفع تعلیق</button>
                        : c.status === "ACTIVE" && (
                          <button className="btn sm" onClick={() => suspend.mutate({ id: c.id, reason: "suspend" })}>تعلیق</button>
                        )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > 0 && (
        <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>کل: {total.toLocaleString("fa-IR")}</span>
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>قبلی</button>
          <span style={{ fontSize: 12 }}>{page} / {totalPages}</span>
          <button className="btn sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>بعدی</button>
        </div>
      )}

      {modal === "create" && <CreateCreditModal onClose={() => setModal(null)} onSave={(d) => create.mutate(d)} loading={create.isPending} />}
      {modal === "settle" && selected && (
        <SettleCreditModal credit={selected} onClose={() => { setModal(null); setSelected(null); }} onSave={(d) => settle.mutate({ id: selected.id, creditId: selected.id, ...d })} loading={settle.isPending} />
      )}
      {modal === "cancel" && selected && (
        <CancelCreditModal credit={selected} onClose={() => { setModal(null); setSelected(null); }} onSave={(d) => cancel.mutate({ id: selected.id, creditId: selected.id, ...d })} loading={cancel.isPending} />
      )}
      {modal === "liquidate" && selected && (
        <LiquidateCreditModal credit={selected} onClose={() => { setModal(null); setSelected(null); }} onSave={(d) => liquidate.mutate({ id: selected.id, creditId: selected.id, ...d })} loading={liquidate.isPending} />
      )}
      {modal === "extend" && selected && (
        <ExtendCreditModal credit={selected} onClose={() => { setModal(null); setSelected(null); }} onSave={(d) => extend.mutate({ id: selected.id, creditId: selected.id, ...d })} loading={extend.isPending} />
      )}
      {modal === "adjust" && selected && (
        <AdjustLimitModal credit={selected} onClose={() => { setModal(null); setSelected(null); }} onSave={(d) => adjustLimit.mutate({ id: selected.id, creditId: selected.id, ...d })} loading={adjustLimit.isPending} />
      )}
      {modal === "user" && selected && (
        <UserCreditsModal userId={selected.userId} credit={selected} onClose={() => { setModal(null); setSelected(null); }} />
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

function LiquidateCreditModal({ credit, onClose, onSave, loading }: { credit: Credit; onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
  const [reason, setReason] = useState("");

  return (
    <Modal title={`نقد اجباری اعتبار ${credit.creditCode}`} onClose={onClose}>
      <form className="modal-form" onSubmit={(e) => { e.preventDefault(); onSave({ description: reason }); }}>
        <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, color: "var(--text-faint)", lineHeight: 1.6 }}>
          با نقد اجباری، کل موقعیت اعتباری با قیمت مارک تسویه می‌شود؛ سود به کیف‌پول واریز و در صورت ضرر،
          وثیقه برای پوشش کسری نقد می‌شود. سپس کیف‌پول‌های کاربر رفع انسداد می‌شود.
          {isMarginCalled(credit) && " این اعتبار به‌دلیل فراخوان سرمایه مسدود شده و نقد آن کاربر را رفع انسداد می‌کند."}
        </div>

        <div className="form-grid">
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>دلیل نقد (اختیاری)</label>
            <textarea className="input" rows={3} placeholder="دلیل نقد اجباری…" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button type="submit" className="btn btn-danger" disabled={loading}>
            {loading ? <><span className="spin" /> در حال نقد…</> : "نقد اجباری"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function KpiCard({ label, value, tone, currency }: { label: string; value: any; tone: string; currency?: boolean }) {
  const color = tone === "red" ? "var(--red)" : tone === "gold" ? "var(--gold)" : tone === "green" ? "var(--green)" : tone === "blue" ? "#3b82f6" : "var(--text-muted)";
  return (
    <div className="card" style={{ padding: "12px 14px", borderLeft: `3px solid ${color}` }}>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color, direction: "ltr", textAlign: "right" }}>
        {Number(value ?? 0).toLocaleString("fa-IR")}{currency ? " ریال" : ""}
      </div>
    </div>
  );
}

function ExtendCreditModal({ credit, onClose, onSave, loading }: { credit: Credit; onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
  const [hours, setHours] = useState("24");
  const [reason, setReason] = useState("");
  return (
    <Modal title={`تمدید مهلت تسویه ${credit.creditCode}`} onClose={onClose}>
      <form className="modal-form" onSubmit={(e) => { e.preventDefault(); if (!Number(hours) || Number(hours) <= 0) return; onSave({ hours: Number(hours), reason }); }}>
        <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, color: "var(--text-faint)", lineHeight: 1.6 }}>
          ساعت‌ها به زمان فعال‌سازی افزوده می‌شود و وضعیت تسویه به سبز بازنشانی می‌شود.
        </div>
        <div className="form-grid">
          <div className="field">
            <label>ساعت تمدید</label>
            <input className="input mono" type="number" min={1} value={hours} onChange={(e) => setHours(e.target.value)} />
          </div>
          <div className="field">
            <label>دلیل (اختیاری)</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="دلیل تمدید…" />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button type="submit" className="btn" disabled={loading}>{loading ? <><span className="spin" /> در حال تمدید…</> : "تمدید"}</button>
        </div>
      </form>
    </Modal>
  );
}

function AdjustLimitModal({ credit, onClose, onSave, loading }: { credit: Credit; onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
  const [newLimit, setNewLimit] = useState(String(credit.creditLimit ?? 0));
  const [reason, setReason] = useState("");
  return (
    <Modal title={`تغییر حد اعتبار ${credit.creditCode}`} onClose={onClose}>
      <form className="modal-form" onSubmit={(e) => { e.preventDefault(); if (Number(newLimit) < 0) return; onSave({ newLimit: Number(newLimit), reason }); }}>
        <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, color: "var(--text-faint)", lineHeight: 1.6 }}>
          حد اعتبار فعلی: {fmtNum(credit.creditLimit)} ریال. اختلاف روی کیف‌پول اعتبار (نماد پایه) اعمال می‌شود.
        </div>
        <div className="form-grid">
          <div className="field">
            <label>حد جدید (ریال)</label>
            <input className="input mono" type="number" min={0} value={newLimit} onChange={(e) => setNewLimit(e.target.value)} />
          </div>
          <div className="field">
            <label>دلیل (اختیاری)</label>
            <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="دلیل تغییر…" />
          </div>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button type="submit" className="btn" disabled={loading}>{loading ? <><span className="spin" /> در حال ذخیره…</> : "ذخیره"}</button>
        </div>
      </form>
    </Modal>
  );
}

function UserCreditsModal({ userId, credit, onClose }: { userId: string; credit: Credit; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["user-credits", userId],
    queryFn: async () => unwrap<any>((await api.get(`/admin/credits/user/${userId}`)).data),
  });
  const data = q.data;
  const user = credit.user;
  return (
    <Modal title={`اعتبارات کاربر ${user ? `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.phone || user.email : userId}`} onClose={onClose} wide>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={apiError(q.error)} /> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {data?.activeOverview && (
            <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, border: "1px solid var(--gold)" }}>
              <h4 style={{ margin: "0 0 10px 0", fontSize: 14, color: "var(--gold)" }}>اعتبار فعال</h4>
              <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                <span className="k">حد اعتبار</span><span className="v mono">{fmtNum(data.activeOverview.creditLimit)} ریال</span>
                <span className="k">استفاده‌شده</span><span className="v mono">{fmtNum(data.activeOverview.usedCredit)} ریال</span>
                <span className="k">موجود</span><span className="v mono">{fmtNum(data.activeOverview.availableCredit)} ریال</span>
                <span className="k">ارزش وثیقه</span><span className="v mono">{fmtNum(data.activeOverview.currentCollateralValue)} ریال</span>
                <span className="k">درادون</span><span className="v mono">{Number(data.activeOverview.lastDrawdownPercent ?? 0).toFixed(1)}% / {data.activeOverview.drawdownPercent}%</span>
                <span className="k">ریسک</span>
                <span className="v"><Badge kind={(RISK_STATE_KINDS[data.activeOverview.riskState] || "gray") as any}>{RISK_STATE_LABELS[data.activeOverview.riskState] || data.activeOverview.riskState}</Badge></span>
              </div>
            </div>
          )}
          <div>
            <h4 style={{ margin: "0 0 8px 0", fontSize: 14 }}>سابقه اعتبارات ({data?.credits?.length || 0})</h4>
            {!data?.credits?.length ? <Empty label="بدون اعتبار" /> : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>کد</th><th>مبلغ</th><th>حد</th><th>وضعیت</th><th>تسویه</th><th>ساخته‌شده</th></tr></thead>
                  <tbody>
                    {data.credits.map((c: any) => (
                      <tr key={c.id}>
                        <td><code>{c.creditCode}</code></td>
                        <td className="mono">{fmtNum(c.amount)}</td>
                        <td className="mono">{fmtNum(c.creditLimit)}</td>
                        <td><Badge kind={(STATUS_KINDS[c.status] || "gray") as any}>{STATUS_LABELS[c.status] || c.status}</Badge></td>
                        <td>{fmtDate(c.settledAt)}</td>
                        <td>{fmtDate(c.createAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function CreditDetailModal({ credit, onClose }: { credit: Credit; onClose: () => void }) {
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

  const risk = useQuery({
    queryKey: ["credit-risk", credit.id],
    queryFn: async () => unwrap<any>((await api.get(`/admin/credits/${credit.id}/risk`)).data),
  });

  const riskData = risk.data;

  // Per-trade collateral locks (handoff §13).
  const locks = useQuery({
    queryKey: ["credit-locks", credit.id],
    queryFn: async () => unwrap<{ summary: any; locks: any[] }>((await api.get(`/admin/credits/${credit.id}/locks`)).data),
  });

  // Delivery-based settlement workflows (handoff §7).
  const settlements = useQuery({
    queryKey: ["credit-settlements", credit.id],
    queryFn: async () => unwrap<any[]>((await api.get(`/admin/credits/${credit.id}/settlements`)).data),
  });

  return (
    <Modal title={`جزئیات اعتبار ${c.creditCode}`} onClose={onClose} wide>
      {creditDetail.isLoading ? (
        <Loading />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Risk / Valuation */}
          {riskData && (
            <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
              <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>ارزیابی ریسک (Mark-to-Market)</h4>
              {riskData.stateError ? (
                <div style={{ color: "var(--red)", fontSize: 13 }}>قیمت مارک در دسترس نیست ({riskData.stateError})</div>
              ) : riskData.valuation ? (
                <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                  <span className="k">ارزش خالص</span>
                  <span className="v mono" style={{ color: riskData.valuation.netEquity >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>
                    {fmtNum(riskData.valuation.netEquity)} ریال
                  </span>
                  <span className="k">سرمایه (Equity)</span>
                  <span className="v mono">{fmtNum(riskData.valuation.equity)} ریال</span>
                  <span className="k">نسبت مارجین</span>
                  <span className="v mono">{riskData.valuation.marginRatio != null ? (riskData.valuation.marginRatio * 100).toFixed(2) + "%" : "—"}</span>
                  <span className="k">قرض گرفته (IRR)</span>
                  <span className="v mono">{fmtNum(riskData.valuation.borrowedIr)} ریال</span>
                  <span className="k">ارزش وثیقه</span>
                  <span className="v mono">{fmtNum(riskData.valuation.collateralValue)} ریال</span>
                  <span className="k">در معرض (Exposure)</span>
                  <span className="v mono">{fmtNum(riskData.valuation.exposure)} ریال</span>
                  <span className="k">استفاده‌شده</span>
                  <span className="v mono">{fmtNum(riskData.usedCredit)} ریال</span>
                  <span className="k">موجود</span>
                  <span className="v mono">{fmtNum(riskData.availableCredit)} ریال</span>
                </div>
              ) : null}

              {(riskData.valuation?.positions || []).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>پوزیشن‌ها</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>نماد</th><th>خالص (g)</th><th>قیمت مارک</th></tr></thead>
                      <tbody>
                        {riskData.valuation.positions.map((p: any, i: number) => (
                          <tr key={i}>
                            <td className="mono">{p.baseSymbolSlug}</td>
                            <td className="mono">{fmtNum(p.netXau)}</td>
                            <td className="mono">{fmtNum(p.markPrice)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {riskData.balances?.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>موجودی کیف‌پول اعتبار</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>نماد</th><th>آزاد</th><th>مسدود</th><th>اعتبار</th></tr></thead>
                      <tbody>
                        {riskData.balances.map((b: any, i: number) => (
                          <tr key={i}>
                            <td className="mono">{b.symbolSlug}</td>
                            <td className="mono">{fmtNum(b.freeBalance)}</td>
                            <td className="mono">{fmtNum(b.lockedBalance)}</td>
                            <td className="mono">{fmtNum(b.creditBalance)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
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

            {c.creditLimit != null && (
              <>
                <span className="k">استفاده‌شده / موجود</span>
                <span className="v mono">
                  {fmtNum(c.usedCredit)} / {fmtNum(c.availableCredit ?? Math.max(0, (c.creditLimit ?? 0) - (c.usedCredit ?? 0)))} ریال
                </span>
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

          {/* Collateral Locks (handoff §3, §13) */}
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>قفل وثیقه (Collateral Locks)</h4>
            {locks.isLoading ? <Loading /> : locks.data ? (
              <>
                <div className="kv" style={{ gridTemplateColumns: "1fr 1fr 1fr", marginBottom: 10 }}>
                  <span className="k">وثیقه کل</span>
                  <span className="v mono">{fmtNum(c.collateralAmount ?? 0)}</span>
                  <span className="k">قفل‌شده</span>
                  <span className="v mono" style={{ color: "var(--gold)", fontWeight: 600 }}>{fmtNum(locks.data.summary.totalLocked)}</span>
                  <span className="k">آزاد (Available)</span>
                  <span className="v mono">{fmtNum(locks.data.summary.available)}</span>
                  <span className="k">آزادشده (Released)</span>
                  <span className="v mono">{fmtNum(locks.data.summary.released)}</span>
                  <span className="k">مصرف‌شده (Consumed)</span>
                  <span className="v mono" style={{ color: locks.data.summary.consumed > 0 ? "var(--red)" : "inherit" }}>{fmtNum(locks.data.summary.consumed)}</span>
                </div>
                {(locks.data.locks || []).length === 0 ? (
                  <Empty label="هیچ قفلی ثبت نشده" />
                ) : (
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>مبلغ (g)</th><th>مبلغ اسمی</th><th>وضعیت</th><th>فعال‌شده</th><th>تاریخ</th></tr></thead>
                      <tbody>
                        {locks.data.locks.map((l: any) => (
                          <tr key={l.id}>
                            <td className="mono">{fmtNum(l.amount)}</td>
                            <td className="mono">{fmtNum(l.notionalValue)}</td>
                            <td>
                              <Badge kind={l.status === "ACTIVE" ? "green" : l.status === "RELEASED" ? "gold" : l.status === "CONSUMED" ? "red" : "gray"}>
                                {l.status === "ACTIVE" ? "فعال" : l.status === "RELEASED" ? "آزاد" : l.status === "CONSUMED" ? "مصرف" : l.status}
                              </Badge>
                            </td>
                            <td className="mono">{l.creditOrder ? l.creditOrder.order?.orderCode || l.creditOrder.id?.slice(0, 8) : "—"}</td>
                            <td>{fmtDate(l.activatedAt || l.releasedAt || l.consumedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </div>

          {/* Delivery-based settlement workflows (handoff §7) */}
          <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8 }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: 14 }}>فرآیند تسویه تحویلی (Settlement Workflow)</h4>
            {settlements.isLoading ? <Loading /> : settlements.data?.length === 0 ? (
              <Empty label="هیچ تسویه تحویلی درخواست نشده" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead><tr><th>وضعیت</th><th>دارایی موردنیاز</th><th>موردنیاز</th><th>دریافت‌شده</th><th>درخواست</th></tr></thead>
                  <tbody>
                    {(settlements.data || []).map((s: any) => (
                      <tr key={s.id}>
                        <td><Badge kind={s.status === "CLOSED" ? "green" : s.status === "FAILED" ? "red" : "gold"}>{s.status}</Badge></td>
                        <td className="mono">{s.requiredAssetSymbolId?.slice(0, 8) || "—"}</td>
                        <td className="mono">{fmtNum(s.requiredAmount)}</td>
                        <td className="mono">{fmtNum(s.receivedAmount)}</td>
                        <td>{fmtDate(s.requestedAt)}</td>
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
