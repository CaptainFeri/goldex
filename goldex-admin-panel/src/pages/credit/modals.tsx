import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../../api/client";
import { Modal } from "../../components/ui";
import type { Credit, SettlementEligibility } from "../../api/types";
import { fmtNum, isMarginCalled } from "./labels";

export function CreateCreditModal({ onClose, onSave, loading }: { onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
  const [form, setForm] = useState({
    userId: "", amount: 0, hasCallMargin: false, callMarginPercent: 0,
    reminderTimerHours: 24, notes: "",
  });
  const [frozenWallets, setFrozenWallets] = useState<Record<string, number>>({});
  const [increasedWallets, setIncreasedWallets] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");

  const users = useQuery({
    queryKey: ["users-dropdown"],
    queryFn: async () => {
      // 100 is the server cap. It used to clamp 999 silently; it now rejects it.
      const res = await api.get("/admin/users/users", { params: { pageSize: 100, page: 1 } });
      return (res.data?.data?.items ?? []) as any[];
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
  const creditWalletOptions = userWallets.data ?? [];

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

export function SettleCreditModal({ credit, onClose, onSave, loading }: { credit: Credit; onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
  const [desc, setDesc] = useState("");
  const [imgPath, setImgPath] = useState("");
  const [force, setForce] = useState(false);

  const eligibility = useQuery({
    queryKey: ["credit-settlement-eligibility", credit.id],
    queryFn: async () => unwrap<SettlementEligibility>((await api.get(`/admin/credits/${credit.id}/settlement-eligibility`)).data),
  });
  const elig = eligibility.data;
  const negativePositions = (elig?.positions || []).filter((p: any) => Number(p.netXau) < 0);
  const blocked = elig && elig.eligible === false;

  return (
    <Modal title={`تسویه اعتبار ${credit.creditCode}`} onClose={onClose}>
      <form className="modal-form" onSubmit={(e) => { e.preventDefault(); onSave({ description: desc, imagePath: imgPath || undefined, force: blocked ? force : undefined }); }}>
        <div style={{ background: "var(--bg)", padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 13, color: "var(--text-faint)", lineHeight: 1.6 }}>
          با تسویه این اعتبار، مبلغ قرض‌گرفته‌شده از کیف‌پول اعتبار بازپس‌گرفته می‌شود؛ در صورت کمبود،
          دارایی‌های مسدودشده (وثیقه) برای پوشش آن نقد می‌شوند. سپس کیف‌پول‌های کاربر رفع انسداد شده و
          کاربر می‌تواند دوباره معامله کند. {isMarginCalled(credit) && "این اعتبار به‌دلیل فراخوان سرمایه مسدود شده و تسویه آن کاربر را رفع انسداد می‌کند."}
        </div>

        {blocked && (
          <div style={{ background: "var(--red-bg, #3a1414)", color: "var(--red)", padding: "10px 12px", borderRadius: 8, marginBottom: 16, fontSize: 13, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              کیف‌پول‌های اعتبار این کاربر منفی است و تسویه معمولی مسدود شده (کسری {fmtNum(elig.shortfall)} ریال پس از وثیقه).
            </div>
            {negativePositions.length > 0 && (
              <ul style={{ margin: "4px 0 8px", paddingInlineStart: 18 }}>
                {negativePositions.map((p: any) => (
                  <li key={p.symbolId}>بدهکار {fmtNum(Math.abs(Number(p.netXau)))} {p.baseSymbolSlug}</li>
                ))}
              </ul>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
              تسویه اجباری با وجود کسری (force) — کسری به‌عنوان نکول ثبت می‌شود
            </label>
          </div>
        )}

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
          <button type="submit" className="btn" disabled={loading || (blocked && !force)}>
            {loading ? <><span className="spin" /> در حال تسویه…</> : blocked ? "تسویه اجباری" : "تسویه اعتبار"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function CancelCreditModal({ credit, onClose, onSave, loading }: { credit: Credit; onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
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

export function LiquidateCreditModal({ credit, onClose, onSave, loading }: { credit: Credit; onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
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

export function ExtendCreditModal({ credit, onClose, onSave, loading }: { credit: Credit; onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
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

export function AdjustLimitModal({ credit, onClose, onSave, loading }: { credit: Credit; onClose: () => void; onSave: (d: any) => void; loading: boolean }) {
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
