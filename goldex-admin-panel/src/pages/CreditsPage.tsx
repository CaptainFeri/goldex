import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Badge, Loading, ErrorState, Empty, Modal } from "../components/ui";
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

const fmtNum = (n: any) => (n ?? 0).toLocaleString("fa-IR");
const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

export default function CreditsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState<null | "create" | "settle" | "cancel">(null);
  const [selected, setSelected] = useState<Credit | null>(null);
  const qc = useQueryClient();

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["credits"] }); setModal(null); },
  });

  const settle = useMutation({
    mutationFn: ({ id, ...body }: any) => api.post(`/admin/credits/${id}/settle`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["credits"] }); setModal(null); setSelected(null); },
  });

  const cancel = useMutation({
    mutationFn: ({ id, ...body }: any) => api.post(`/admin/credits/${id}/cancel`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["credits"] }); setModal(null); setSelected(null); },
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
                <th>وضعیت</th>
                <th>بازه اخطار</th>
                <th>انقضا</th>
                <th>فراخوان سرمایه</th>
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
                  <td><Badge kind={STATUS_KINDS[c.status] as "green" | "red" | "gold" | "gray"}>{STATUS_LABELS[c.status]}</Badge></td>
                  <td>{c.reminderTimerHours}h</td>
                  <td>{fmtDate(c.expireAt)}</td>
                  <td>
                    {c.hasCallMargin
                      ? <Badge kind="gold">{c.callMarginPercent ?? "—"}%</Badge>
                      : <Badge kind="gray">ندارد</Badge>}
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
        <SettleCreditModal credit={selected} onClose={() => { setModal(null); setSelected(null); }} onSave={(d) => settle.mutate({ id: selected.id, ...d })} loading={settle.isPending} />
      )}
      {modal === "cancel" && selected && (
        <CancelCreditModal credit={selected} onClose={() => { setModal(null); setSelected(null); }} onSave={(d) => cancel.mutate({ id: selected.id, ...d })} loading={cancel.isPending} />
      )}
    </Card>
  );
}

function CreateCreditModal({ onClose, onSave, loading }: { onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({
    userId: "", amount: 0, hasCallMargin: false, callMarginPercent: 0,
    reminderTimerHours: 24, expireAt: "", notes: "",
  });
  const [frozenWallets, setFrozenWallets] = useState<Record<string, number>>({});
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
      return list.filter((w: any) =>
        w.userId === form.userId &&
        w.symbol?.symbolType === "material" &&
        Number(w.calculatedStats?.availableBalance ?? w.freeBalance - w.frozenFreeBalance) > 0
      );
    },
    enabled: !!form.userId,
  });

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

  const handle = () => {
    if (!form.userId) { setErr("لطفاً یک کاربر انتخاب کنید"); return; }
    if (form.amount <= 0) { setErr("مبلغ باید بیشتر از صفر باشد"); return; }
    if (!form.expireAt) { setErr("لطفاً تاریخ انقضا را وارد کنید"); return; }
    const fw = Object.entries(frozenWallets).filter(([, v]) => v > 0).map(([walletId, amount]) => ({ walletId, amount }));
    if (fw.length === 0) { setErr("حداقل یک دارایی برای مسدود کردن انتخاب کنید"); return; }
    setErr("");
    onSave({ ...form, amount: Number(form.amount), frozenWallets: fw });
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

          <div className="field">
            <label>مبلغ (ریال)</label>
            <input className="input" type="number" min={0} placeholder="مبلغ به ریال" value={form.amount} onChange={(e) => setForm({ ...form, amount: +e.target.value })} />
          </div>

          <div className="field">
            <label>تاریخ انقضا</label>
            <input className="input" type="datetime-local" value={form.expireAt} onChange={(e) => setForm({ ...form, expireAt: e.target.value })} />
          </div>

          <div className="field">
            <label>مدت زمان یادآوری (ساعت)</label>
            <input className="input" type="number" min={1} placeholder="مثال: 24" value={form.reminderTimerHours} onChange={(e) => setForm({ ...form, reminderTimerHours: +e.target.value })} />
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

          {form.userId && userWallets.data && userWallets.data.length > 0 && (
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: 6 }}>انتخاب دارایی‌هایی که مسدود می‌شوند:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {userWallets.data.map((w: any) => {
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
          با تسویه این اعتبار، تمام کیف‌پول‌های کاربر رفع انسداد شده و موجودی‌های مسدود شده آزاد می‌شوند.
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
