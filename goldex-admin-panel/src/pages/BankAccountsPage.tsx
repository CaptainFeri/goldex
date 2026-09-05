import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { bankAccountsApi } from "../api/p2p";
import type { BankAccountDirection } from "../api/p2p";
import { Card, Badge, Loading, ErrorState, Empty, Modal } from "../components/ui";
import { BANK_ACCOUNT_STATUS } from "../lib/enums";
import type { AdminBankAccount, SymbolItem } from "../api/types";
import { fmtBySymbol, rialToToman, tomanToRial } from "../lib/money";

const fmtNum = (n: any) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("fa-IR"));
const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric" }) : "—";

// Account and card numbers are masked in the table; the full value is only
// revealed in the detail modal, which is behind the same finance role.
const mask = (v?: string | null) => {
  if (!v) return "—";
  const s = String(v).replace(/\s/g, "");
  return s.length <= 6 ? s : `${s.slice(0, 4)}••••${s.slice(-4)}`;
};

const STATUS_KIND: Record<string, "green" | "red" | "gold" | "gray"> = {
  ACTIVE: "green",
  INACTIVE: "gray",
  SUSPENDED: "red",
};

/** Renders the two direction flags as the thing an admin actually thinks in:
 *  "deposit", "withdraw", "both", or "off". */
function DirectionBadges({ account }: { account: AdminBankAccount }) {
  const { useForDeposit: dep, useForWithdraw: wit } = account;
  if (!dep && !wit) return <Badge kind="gray">استفاده نمی‌شود</Badge>;
  return (
    <div className="row" style={{ gap: 4 }}>
      {dep && <Badge kind="green">واریز</Badge>}
      {wit && <Badge kind="gold">برداشت</Badge>}
    </div>
  );
}

/** Remaining daily headroom per direction — the number that decides whether
 *  this account is still selectable today. */
function LimitCell({
  used,
  limit,
  symbol,
}: {
  used?: number;
  limit?: number | null;
  /** The account's symbol — limits are denominated in it, so a rial account
   *  shows toman while a fiat one shows its own units. */
  symbol?: string;
}) {
  if (!limit) return <span style={{ color: "var(--text-muted)" }}>نامحدود</span>;
  const u = Number(used ?? 0);
  // Percentage is unit-free, so compute it before formatting.
  const pct = Math.min(100, Math.round((u / Number(limit)) * 100));
  const over = pct >= 100;
  return (
    <div style={{ minWidth: 110 }}>
      <div className="mono" style={{ fontSize: 12, color: over ? "var(--red, #f0857d)" : undefined }}>
        {fmtBySymbol(u, symbol, { digits: 0 })} / {fmtBySymbol(limit, symbol, { digits: 0 })}
      </div>
      <div style={{ height: 4, background: "var(--bg)", borderRadius: 2, marginTop: 3 }}>
        <div
          style={{
            height: "100%",
            width: `${pct}%`,
            borderRadius: 2,
            background: over ? "#f0857d" : pct > 80 ? "#e0b341" : "#5cb87a",
          }}
        />
      </div>
    </div>
  );
}

export default function BankAccountsPage() {
  const [direction, setDirection] = useState<"" | BankAccountDirection>("");
  const [statusFilter, setStatusFilter] = useState("");
  const [modal, setModal] = useState<null | "create" | "edit">(null);
  const [selected, setSelected] = useState<AdminBankAccount | null>(null);
  const qc = useQueryClient();

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-bank-accounts"] });

  const list = useQuery({
    queryKey: ["admin-bank-accounts", direction, statusFilter],
    queryFn: () =>
      bankAccountsApi.list({
        direction: direction || undefined,
        status: statusFilter || undefined,
      }),
  });

  // Accounts are per-symbol, so the form needs the rial symbols to pick from.
  const symbols = useQuery({
    queryKey: ["admin-symbols-for-bank-accounts"],
    queryFn: async () => {
      const raw = unwrap<any>((await api.get("/admin/symbols/active")).data);
      return (Array.isArray(raw) ? raw : raw?.data ?? raw?.items ?? []) as SymbolItem[];
    },
  });

  const save = useMutation({
    mutationFn: ({ id, ...body }: any) =>
      id ? bankAccountsApi.update(id, body) : bankAccountsApi.create(body),
    onSuccess: () => {
      invalidate();
      setModal(null);
      setSelected(null);
    },
  });

  const setDirections = useMutation({
    mutationFn: ({ id, useForDeposit, useForWithdraw }: any) =>
      bankAccountsApi.setDirections(id, { useForDeposit, useForWithdraw }),
    onSuccess: invalidate,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: any) => bankAccountsApi.setStatus(id, status),
    onSuccess: invalidate,
  });


  const rows = list.data?.items ?? [];

  return (
    <Card
      title="حساب‌های بانکی شرکت"
      action={
        <div className="row" style={{ gap: 8 }}>
          <select className="select" value={direction} onChange={(e) => setDirection(e.target.value as any)}>
            <option value="">هر دو جهت</option>
            <option value="deposit">فعال برای واریز</option>
            <option value="withdraw">فعال برای برداشت</option>
          </select>
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">همه وضعیت‌ها</option>
            {Object.entries(BANK_ACCOUNT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className="btn sm" onClick={() => { setSelected(null); setModal("create"); }}>
            + حساب جدید
          </button>
        </div>
      }
    >
      <p style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 0, lineHeight: 1.9 }}>
        هر حساب می‌تواند برای واریز، برداشت، هر دو، یا هیچ‌کدام فعال باشد. حساب فعال برای
        <strong> واریز</strong> به‌عنوان مقصد به واریزکننده نمایش داده می‌شود و حساب فعال برای
        <strong> برداشت</strong> منبع پرداخت به برداشت‌کننده است. سقف‌های روزانه هر جهت جداگانه
        شمارش می‌شوند.
      </p>

      {list.isLoading ? <Loading /> :
       list.isError ? <ErrorState message={apiError(list.error)} /> :
       !rows.length ? <Empty label="هیچ حساب بانکی ثبت نشده است" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>عنوان</th>
                <th>بانک / صاحب حساب</th>
                <th>شبا</th>
                <th>نماد</th>
                <th>جهت استفاده</th>
                <th>اولویت</th>
                <th>مصرف امروز (واریز)</th>
                <th>مصرف امروز (برداشت)</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>{a.title}</td>
                  <td>
                    <div>{a.bankName}</div>
                    <div style={{ fontSize: 12, color: "var(--text-muted)" }}>{a.ownerName}</div>
                  </td>
                  <td className="mono" dir="ltr">{mask(a.iban)}</td>
                  <td>{(a.symbol as any)?.slug ?? (a.symbol as any)?.name ?? "—"}</td>
                  <td><DirectionBadges account={a} /></td>
                  <td className="mono">{a.priority}</td>
                  <td><LimitCell used={a.depositUsedToday} limit={a.depositDailyLimit} symbol={(a.symbol as any)?.slug} /></td>
                  <td><LimitCell used={a.withdrawUsedToday} limit={a.withdrawDailyLimit} symbol={(a.symbol as any)?.slug} /></td>
                  <td><Badge kind={STATUS_KIND[a.status] ?? "gray"}>{BANK_ACCOUNT_STATUS[a.status] ?? a.status}</Badge></td>
                  <td>
                    <div className="row" style={{ gap: 4, flexWrap: "wrap" }}>
                      <button className="btn sm ghost" onClick={() => { setSelected(a); setModal("edit"); }}>
                        ویرایش
                      </button>
                      <button
                        className="btn sm ghost"
                        disabled={setDirections.isPending}
                        title="فعال/غیرفعال کردن این حساب برای واریز"
                        onClick={() =>
                          setDirections.mutate({ id: a.id, useForDeposit: !a.useForDeposit, useForWithdraw: a.useForWithdraw })
                        }
                      >
                        {a.useForDeposit ? "بستن واریز" : "باز کردن واریز"}
                      </button>
                      <button
                        className="btn sm ghost"
                        disabled={setDirections.isPending}
                        title="فعال/غیرفعال کردن این حساب برای برداشت"
                        onClick={() =>
                          setDirections.mutate({ id: a.id, useForDeposit: a.useForDeposit, useForWithdraw: !a.useForWithdraw })
                        }
                      >
                        {a.useForWithdraw ? "بستن برداشت" : "باز کردن برداشت"}
                      </button>
                      <button
                        className="btn sm ghost"
                        disabled={setStatus.isPending}
                        onClick={() => {
                          const next = a.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
                          if (window.confirm(next === "INACTIVE"
                            ? "این حساب غیرفعال شود؟ تطبیق‌های در جریان تغییری نمی‌کنند."
                            : "این حساب دوباره فعال شود؟")) {
                            setStatus.mutate({ id: a.id, status: next });
                          }
                        }}
                      >
                        {a.status === "ACTIVE" ? "غیرفعال" : "فعال"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(save.isError || setDirections.isError || setStatus.isError) && (
        <div style={{ marginTop: 12 }}>
          <ErrorState
            message={apiError(save.error || setDirections.error || setStatus.error)}
          />
        </div>
      )}

      {modal && (
        <BankAccountModal
          account={selected}
          symbols={symbols.data ?? []}
          loading={save.isPending}
          error={save.isError ? apiError(save.error) : ""}
          onClose={() => { setModal(null); setSelected(null); save.reset(); }}
          onSave={(dto) => save.mutate(selected ? { id: selected.id, ...dto } : dto)}
        />
      )}
    </Card>
  );
}

function BankAccountModal({
  account,
  symbols,
  onClose,
  onSave,
  loading,
  error,
}: {
  account: AdminBankAccount | null;
  symbols: SymbolItem[];
  onClose: () => void;
  onSave: (dto: any) => void;
  loading?: boolean;
  error?: string;
}) {
  const [form, setForm] = useState({
    title: account?.title ?? "",
    bankName: account?.bankName ?? "",
    ownerName: account?.ownerName ?? "",
    iban: account?.iban ?? "",
    accountNumber: account?.accountNumber ?? "",
    cardNumber: account?.cardNumber ?? "",
    symbolId: account?.symbolId ?? "",
    useForDeposit: account?.useForDeposit ?? false,
    useForWithdraw: account?.useForWithdraw ?? false,
    priority: account?.priority ?? 0,
    depositDailyLimit: rialToToman(account?.depositDailyLimit) ?? "",
    depositPerTxLimit: rialToToman(account?.depositPerTxLimit) ?? "",
    withdrawDailyLimit: rialToToman(account?.withdrawDailyLimit) ?? "",
    withdrawPerTxLimit: rialToToman(account?.withdrawPerTxLimit) ?? "",
    activeFromHour: account?.activeFromHour ?? "",
    activeToHour: account?.activeToHour ?? "",
    notes: account?.notes ?? "",
  });

  const set = (k: string, v: any) => setForm((p) => ({ ...p, [k]: v }));

  // Only rial symbols can carry a p2p company account today; keep the list
  // narrow so an admin cannot attach one to a crypto symbol by accident.
  const rialSymbols = useMemo(
    () => symbols.filter((s: any) => s.symbolType === "rial"),
    [symbols],
  );

  const identifierMissing = !form.iban && !form.accountNumber && !form.cardNumber;
  const num = (v: any) => (v === "" || v === null ? undefined : Number(v));
  /** Limit fields are entered in toman; the API stores rial. */
  const tomanNum = (v: any) => (v === "" || v === null ? undefined : tomanToRial(v) ?? undefined);

  return (
    <Modal title={account ? "ویرایش حساب بانکی" : "افزودن حساب بانکی شرکت"} onClose={onClose} wide>
      {error && <div style={{ marginBottom: 12 }}><ErrorState message={error} /></div>}
      <form
        className="modal-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({
            title: form.title,
            bankName: form.bankName,
            ownerName: form.ownerName,
            iban: form.iban || undefined,
            accountNumber: form.accountNumber || undefined,
            cardNumber: form.cardNumber || undefined,
            symbolId: form.symbolId,
            useForDeposit: form.useForDeposit,
            useForWithdraw: form.useForWithdraw,
            priority: Number(form.priority) || 0,
            depositDailyLimit: tomanNum(form.depositDailyLimit),
            depositPerTxLimit: tomanNum(form.depositPerTxLimit),
            withdrawDailyLimit: tomanNum(form.withdrawDailyLimit),
            withdrawPerTxLimit: tomanNum(form.withdrawPerTxLimit),
            activeFromHour: num(form.activeFromHour),
            activeToHour: num(form.activeToHour),
            notes: form.notes || undefined,
          });
        }}
      >
        <div className="form-grid">
          <div className="field">
            <label>عنوان</label>
            <input className="input" value={form.title} onChange={(e) => set("title", e.target.value)} required placeholder="ملت — حساب اصلی" />
          </div>
          <div className="field">
            <label>نام بانک</label>
            <input className="input" value={form.bankName} onChange={(e) => set("bankName", e.target.value)} required />
          </div>
          <div className="field">
            <label>نام صاحب حساب</label>
            <input className="input" value={form.ownerName} onChange={(e) => set("ownerName", e.target.value)} required />
            <small style={{ color: "var(--text-muted)" }}>همان‌طور که در حساب بانکی ثبت شده است</small>
          </div>
          <div className="field">
            <label>نماد</label>
            <select className="select" value={form.symbolId} onChange={(e) => set("symbolId", e.target.value)} required>
              <option value="">انتخاب کنید…</option>
              {rialSymbols.map((s: any) => (
                <option key={s.id} value={s.id}>{s.slug ?? s.name}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>شبا</label>
            <input className="input" dir="ltr" value={form.iban} onChange={(e) => set("iban", e.target.value)} placeholder="IR000000000000000000000000" />
          </div>
          <div className="field">
            <label>شماره حساب</label>
            <input className="input" dir="ltr" value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} />
          </div>
          <div className="field">
            <label>شماره کارت</label>
            <input className="input" dir="ltr" value={form.cardNumber} onChange={(e) => set("cardNumber", e.target.value)} />
          </div>
          <div className="field">
            <label>اولویت (کمتر = زودتر انتخاب می‌شود)</label>
            <input className="input" type="number" value={form.priority} onChange={(e) => set("priority", e.target.value)} />
          </div>
        </div>

        <fieldset style={{ border: "1px solid var(--border)", borderRadius: 8, padding: 12, marginTop: 16 }}>
          <legend style={{ fontSize: 13, padding: "0 6px" }}>جهت استفاده</legend>
          <label className="row" style={{ gap: 8, alignItems: "center", marginBottom: 6 }}>
            <input
              type="checkbox"
              checked={form.useForDeposit}
              onChange={(e) => set("useForDeposit", e.target.checked)}
            />
            <span>واریز — این حساب به‌عنوان مقصد به واریزکننده نمایش داده شود</span>
          </label>
          <label className="row" style={{ gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={form.useForWithdraw}
              onChange={(e) => set("useForWithdraw", e.target.checked)}
            />
            <span>برداشت — پرداخت به برداشت‌کننده از این حساب انجام شود</span>
          </label>
        </fieldset>

        <div className="form-grid" style={{ marginTop: 16 }}>
          <div className="field">
            <label>سقف روزانه واریز (تومان)</label>
            <input className="input" type="number" min="0" value={form.depositDailyLimit as any}
              onChange={(e) => set("depositDailyLimit", e.target.value)} placeholder="خالی = نامحدود" />
          </div>
          <div className="field">
            <label>سقف هر تراکنش واریز (تومان)</label>
            <input className="input" type="number" min="0" value={form.depositPerTxLimit as any}
              onChange={(e) => set("depositPerTxLimit", e.target.value)} placeholder="خالی = نامحدود" />
          </div>
          <div className="field">
            <label>سقف روزانه برداشت (تومان)</label>
            <input className="input" type="number" min="0" value={form.withdrawDailyLimit as any}
              onChange={(e) => set("withdrawDailyLimit", e.target.value)} placeholder="خالی = نامحدود" />
          </div>
          <div className="field">
            <label>سقف هر تراکنش برداشت (تومان)</label>
            <input className="input" type="number" min="0" value={form.withdrawPerTxLimit as any}
              onChange={(e) => set("withdrawPerTxLimit", e.target.value)} placeholder="خالی = نامحدود" />
          </div>
          <div className="field">
            <label>ساعت شروع فعالیت</label>
            <input className="input" type="number" min="0" max="23" value={form.activeFromHour as any}
              onChange={(e) => set("activeFromHour", e.target.value)} placeholder="خالی = ۲۴ ساعته" />
          </div>
          <div className="field">
            <label>ساعت پایان فعالیت</label>
            <input className="input" type="number" min="0" max="23" value={form.activeToHour as any}
              onChange={(e) => set("activeToHour", e.target.value)} placeholder="خالی = ۲۴ ساعته" />
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label>یادداشت</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>

        {identifierMissing && (
          <div style={{ fontSize: 12, color: "#f0857d", marginTop: 8 }}>
            حداقل یکی از شبا، شماره حساب یا شماره کارت باید وارد شود.
          </div>
        )}

        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button type="submit" className="btn" disabled={loading || identifierMissing}>
            {loading ? <><span className="spin" /> در حال ذخیره…</> : account ? "ذخیره تغییرات" : "ثبت حساب"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
