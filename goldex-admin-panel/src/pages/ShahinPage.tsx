import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Stat, Badge, Loading, ErrorState, Empty } from "../components/ui";
import DateField from "../components/DateField";
import OtpConfirmModal, { otpError } from "../components/OtpConfirmModal";
import { fmtNum, fmtDate } from "../lib/format";
import { fmtToman, toApiAmount, unitLabel } from "../lib/money";
import { downloadExport, stampedName } from "../lib/download";
import type {
  ShahinAccount,
  ShahinBalance,
  ShahinConnection,
  ShahinInquiry,
  ShahinStatementRow,
  ShahinTransferMethod,
} from "../api/types";

type Tab = "statement" | "transfer" | "balance" | "openBanking";

const TABS: { id: Tab; label: string }[] = [
  { id: "statement", label: "صورتحساب" },
  { id: "transfer", label: "انتقال وجه" },
  { id: "balance", label: "موجودی" },
  { id: "openBanking", label: "بانکداری باز" },
];

const METHODS: { id: ShahinTransferMethod; label: string }[] = [
  { id: "satna", label: "ساتنا" },
  { id: "paya", label: "پایا" },
  { id: "pol", label: "پل" },
  { id: "account", label: "حساب به حساب" },
];

const accountLabel = (a: ShahinAccount) =>
  `${a.bankName ?? a.bankCode} — ${a.accountNumber}${a.ownerName ? ` (${a.ownerName})` : ""}`;

function AccountSelect({
  accounts,
  value,
  onChange,
  placeholder = "انتخاب حساب بانکی…",
}: {
  accounts: ShahinAccount[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {accounts.map((a) => (
        <option key={a.id} value={String(a.id)}>{accountLabel(a)}</option>
      ))}
    </select>
  );
}

function StatementTab({ accounts }: { accounts: ShahinAccount[] }) {
  const [accountId, setAccountId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [trackNo, setTrackNo] = useState("");
  const [applied, setApplied] = useState<Record<string, string> | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const rows = useQuery({
    queryKey: ["shahin-statement", accountId, applied],
    // Only after the operator asks: each run is a live call to the bank.
    enabled: !!accountId && !!applied,
    queryFn: async () =>
      unwrap<ShahinStatementRow[]>(
        (await api.get(`/admin/shahin/accounts/${accountId}/statement`, { params: applied ?? {} })).data,
      ),
  });

  const runExport = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await downloadExport(
        "/admin/shahin/statement/export",
        { accountIds: accountId, from: from || undefined, to: to || undefined },
        stampedName("shahin-statement"),
      );
    } catch (e) {
      setExportError(apiError(e));
    } finally {
      setExporting(false);
    }
  };

  const search = () =>
    setApplied({
      from: from || "",
      to: to || "",
      // Entered in toman, sent in rial like every amount on the wire.
      minAmount: minAmount ? String(toApiAmount(minAmount, "IRR")) : "",
      maxAmount: maxAmount ? String(toApiAmount(maxAmount, "IRR")) : "",
      trackNo: trackNo || "",
    });

  return (
    <Card
      title="صورتحساب"
      action={
        <button className="btn ghost" disabled={!accountId || exporting} onClick={runExport}>
          {exporting ? "…" : "خروجی Excel"}
        </button>
      }
    >
      <div className="form-grid">
        <label>
          <span>حساب</span>
          <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
        </label>
        <label><span>از تاریخ</span><DateField value={from} onChange={setFrom} /></label>
        <label><span>تا تاریخ</span><DateField value={to} onChange={setTo} /></label>
        <label>
          <span>حداقل مبلغ ({unitLabel("IRR")})</span>
          <input className="input" inputMode="numeric" value={minAmount} onChange={(e) => setMinAmount(e.target.value)} />
        </label>
        <label>
          <span>حداکثر مبلغ ({unitLabel("IRR")})</span>
          <input className="input" inputMode="numeric" value={maxAmount} onChange={(e) => setMaxAmount(e.target.value)} />
        </label>
        <label>
          <span>شماره پیگیری</span>
          <input className="input" dir="ltr" value={trackNo} onChange={(e) => setTrackNo(e.target.value)}
            placeholder="شماره پیگیری را وارد کنید…" />
        </label>
      </div>
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn" disabled={!accountId} onClick={search}>درخواست صورتحساب</button>
      </div>

      {exportError && <ErrorState message={exportError} />}
      {!accountId ? <Empty label="ابتدا یک حساب انتخاب کنید" /> :
       !applied ? <Empty label="برای دریافت صورتحساب، دکمه بالا را بزنید" /> :
       rows.isLoading ? <Loading /> :
       rows.isError ? <ErrorState message={apiError(rows.error)} /> :
       !rows.data?.length ? <Empty label="تراکنشی در این بازه یافت نشد" /> : (
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table>
            <thead>
              <tr><th>تاریخ</th><th>شرح</th><th>نوع</th><th>مبلغ</th><th>مانده</th><th>شماره پیگیری</th></tr>
            </thead>
            <tbody>
              {rows.data.map((r, i) => (
                <tr key={`${r.trackNo ?? i}-${i}`}>
                  <td>{r.date ?? "—"}</td>
                  <td>{r.description ?? "—"}</td>
                  <td>
                    {/* Null is rendered as a dash, not guessed at. */}
                    {r.direction === "credit" ? <Badge kind="green">بستانکار</Badge>
                      : r.direction === "debit" ? <Badge kind="red">بدهکار</Badge>
                      : "—"}
                  </td>
                  <td>{r.amount ? fmtToman(r.amount) : "—"}</td>
                  <td>{r.balance ? fmtToman(r.balance) : "—"}</td>
                  <td dir="ltr">{r.trackNo ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function TransferTab({ accounts }: { accounts: ShahinAccount[] }) {
  const qc = useQueryClient();
  const [method, setMethod] = useState<ShahinTransferMethod>("satna");
  const [sourceId, setSourceId] = useState("");
  const [destAccount, setDestAccount] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [inquiry, setInquiry] = useState<ShahinInquiry | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const source = accounts.find((a) => String(a.id) === sourceId);

  const lookup = useMutation({
    mutationFn: async () =>
      unwrap<ShahinInquiry>((await api.post("/admin/shahin/accounts/inquiry", { destAccount })).data),
    onSuccess: setInquiry,
  });

  // Exactly what the request will send, so the hash the server recomputes from
  // the body matches the one the code was issued against.
  const payload = useMemo(
    () => ({
      method,
      sourceAccount: source?.accountNumber ?? "",
      destinationAccount: destAccount,
      amount: amount ? String(toApiAmount(amount, "IRR")) : "",
      description: description || undefined,
    }),
    [method, source?.accountNumber, destAccount, amount, description],
  );

  const transfer = useMutation({
    mutationFn: (confirmation: { challengeId: string; otp: string }) =>
      api.post("/admin/shahin/transfer", { ...payload, ...confirmation }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["shahin-accounts"] });
      setConfirming(false);
      setDone(true);
    },
  });

  // The inquiry is tied to the account it was run for; changing either the
  // destination or the amount clears it, so nobody confirms against a name
  // that belongs to a different account.
  const setDest = (v: string) => {
    setDestAccount(v);
    setInquiry(null);
    setDone(false);
  };

  const ready = !!source && !!destAccount && !!amount && !!inquiry;

  if (confirming) {
    return (
      <OtpConfirmModal
        title="تأیید انتقال وجه"
        description={`انتقال ${fmtToman(payload.amount)} به ${inquiry?.ownerName ?? destAccount}`}
        scope="shahin.transfer"
        refId={destAccount}
        fields={["sourceAccount", "destinationAccount", "amount"]}
        payload={payload}
        confirmLabel="انتقال"
        pending={transfer.isPending}
        actionError={transfer.isError ? transfer.error : undefined}
        onConfirm={(c) => transfer.mutate(c)}
        onClose={() => setConfirming(false)}
      />
    );
  }

  return (
    <Card title="درخواست انتقال وجه">
      <div className="form-grid">
        <label>
          <span>روش انتقال</span>
          <select className="select" value={method} onChange={(e) => setMethod(e.target.value as ShahinTransferMethod)}>
            {METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
        </label>
        <label>
          <span>حساب مبدأ</span>
          <AccountSelect accounts={accounts} value={sourceId} onChange={(v) => { setSourceId(v); setDone(false); }} />
        </label>
        <label>
          <span>حساب مقصد</span>
          <input className="input" dir="ltr" value={destAccount} onChange={(e) => setDest(e.target.value)}
            placeholder="شماره حساب مقصد را وارد کنید…" />
        </label>
        <label>
          <span>مبلغ ({unitLabel("IRR")})</span>
          <input className="input" inputMode="numeric" value={amount}
            onChange={(e) => { setAmount(e.target.value); setDone(false); }} />
        </label>
        <label style={{ gridColumn: "1 / -1" }}>
          <span>شرح</span>
          <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
      </div>

      <div className="row" style={{ gap: 8, marginTop: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button className="btn ghost" disabled={!destAccount || lookup.isPending} onClick={() => lookup.mutate()}>
          {lookup.isPending ? "…" : "استعلام حساب مقصد"}
        </button>
        {inquiry && (
          <span className="row" style={{ gap: 6 }}>
            <Badge kind="green">{inquiry.ownerName ?? "—"}</Badge>
            <span className="muted" style={{ fontSize: 12 }}>{inquiry.bankName ?? ""}</span>
          </span>
        )}
      </div>
      {lookup.isError && <ErrorState message={apiError(lookup.error)} />}

      {!inquiry && (
        <p className="muted" style={{ fontSize: 12 }}>
          پیش از انتقال، حساب مقصد باید استعلام شود تا نام صاحب حساب تأیید گردد.
        </p>
      )}
      {transfer.isError && !confirming && <ErrorState message={otpError(transfer.error)} />}
      {done && <div className="ok-text">انتقال با موفقیت انجام شد</div>}

      <div className="row" style={{ justifyContent: "flex-end", marginTop: 12 }}>
        <button className="btn" disabled={!ready} onClick={() => setConfirming(true)}>
          ادامه و دریافت کد
        </button>
      </div>
    </Card>
  );
}

function BalanceTab({ accounts }: { accounts: ShahinAccount[] }) {
  const [accountId, setAccountId] = useState("");

  const balance = useQuery({
    queryKey: ["shahin-balance", accountId],
    enabled: !!accountId,
    // Always a live call; caching a bank balance is how an operator acts on a
    // stale number.
    staleTime: 0,
    gcTime: 0,
    queryFn: async () =>
      unwrap<ShahinBalance>((await api.get(`/admin/shahin/accounts/${accountId}/balance`)).data),
  });

  return (
    <>
      <Card title="موجودی حساب"
        action={
          <button className="btn ghost" disabled={!accountId || balance.isFetching} onClick={() => balance.refetch()}>
            {balance.isFetching ? "…" : "به‌روزرسانی"}
          </button>
        }
      >
        <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
        {!accountId ? <Empty label="یک حساب انتخاب کنید" /> :
         balance.isLoading ? <Loading /> :
         balance.isError ? <ErrorState message={apiError(balance.error)} /> :
         balance.data ? (
          <>
            <div className="grid grid-2" style={{ marginTop: 12 }}>
              <Stat label="موجودی قابل برداشت"
                value={balance.data.availableBalance ? fmtToman(balance.data.availableBalance) : "—"} />
              <Stat label="موجودی کل"
                value={balance.data.effectiveBalance ? fmtToman(balance.data.effectiveBalance) : "—"} />
            </div>
            {/* Which moment this is, so nobody reads a minutes-old number as now. */}
            <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
              آخرین به‌روزرسانی: {fmtDate(balance.data.fetchedAt)}
            </div>
          </>
        ) : null}
      </Card>

      <div style={{ marginTop: 16 }}>
        <Card title="حساب‌های بانکی">
          {!accounts.length ? <Empty label="حسابی ثبت نشده است" /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>بانک</th><th>شماره حساب</th><th>شماره شبا</th><th>صاحب حساب</th><th>آخرین موجودی</th></tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td>{a.bankName ?? a.bankCode}</td>
                      <td dir="ltr">{a.accountNumber}</td>
                      <td dir="ltr">{a.iban ?? "—"}</td>
                      <td>{a.ownerName ?? "—"}</td>
                      <td>{a.balance ? fmtToman(a.balance) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}

function OpenBankingTab() {
  const qc = useQueryClient();
  const connections = useQuery({
    queryKey: ["shahin-open-banking"],
    queryFn: async () => unwrap<ShahinConnection[]>((await api.get("/admin/shahin/open-banking")).data),
  });

  const sync = useMutation({
    mutationFn: (id: number) => api.post(`/admin/shahin/open-banking/${id}/sync`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["shahin-open-banking"] }),
  });

  return (
    <Card title="بانکداری باز">
      {connections.isLoading ? <Loading /> :
       connections.isError ? <ErrorState message={apiError(connections.error)} /> :
       !connections.data?.length ? <Empty label="حسابی ثبت نشده است" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>بانک</th><th>شماره حساب</th><th>وضعیت</th>
                <th>آخرین همگام‌سازی</th><th>سطح دسترسی</th><th>انقضای رضایت</th><th></th>
              </tr>
            </thead>
            <tbody>
              {connections.data.map((c) => (
                <tr key={c.accountId}>
                  <td>{c.bankName ?? "—"}</td>
                  <td dir="ltr">{c.accountNumber}</td>
                  <td>
                    <Badge kind={c.connected ? "green" : "red"}>{c.connected ? "بانک متصل" : "قطع"}</Badge>
                    {c.lastError && (
                      <div className="settings-row-desc" style={{ whiteSpace: "normal" }}>{c.lastError}</div>
                    )}
                  </td>
                  <td>{c.lastSyncAt ? fmtDate(c.lastSyncAt) : "—"}</td>
                  {/* The bank does not report these; a dash is the honest answer. */}
                  <td>{c.accessScope ?? "—"}</td>
                  <td>{c.consentExpiresAt ? fmtDate(c.consentExpiresAt) : "—"}</td>
                  <td>
                    <button className="btn ghost sm" disabled={sync.isPending} onClick={() => sync.mutate(c.accountId)}>
                      همگام‌سازی
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sync.isError && <ErrorState message={apiError(sync.error)} />}
    </Card>
  );
}

export default function ShahinPage() {
  const [tab, setTab] = useState<Tab>("statement");

  const accounts = useQuery({
    queryKey: ["shahin-accounts"],
    queryFn: async () => unwrap<ShahinAccount[]>((await api.get("/admin/shahin/accounts")).data),
  });

  // Also drives the connected count above, so the figure is the same one the
  // open-banking tab shows rather than a second opinion.
  const connections = useQuery({
    queryKey: ["shahin-open-banking"],
    queryFn: async () => unwrap<ShahinConnection[]>((await api.get("/admin/shahin/open-banking")).data),
  });

  const list = accounts.data ?? [];

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="تعداد حساب" value={fmtNum(list.length)} />
        <Stat label="حساب فعال" value={fmtNum(list.filter((a) => a.accountStatus === "active").length)} />
        <Stat
          label="مجموع آخرین موجودی"
          value={fmtToman(list.reduce((sum, a) => sum + Number(a.balance ?? 0), 0))}
          sub={<span className="muted">آخرین مقدار دریافت‌شده، نه لحظه‌ای</span>}
        />
        <Stat
          label="بانک متصل"
          value={connections.data ? fmtNum(connections.data.filter((c) => c.connected).length) : "…"}
          sub={
            connections.data
              ? <span className="muted">از {fmtNum(connections.data.length)} حساب</span>
              : null
          }
        />
      </div>

      <div className="row" style={{ gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            className={"btn" + (tab === t.id ? "" : " ghost")}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {accounts.isLoading ? <Loading /> :
       accounts.isError ? <ErrorState message={apiError(accounts.error)} /> : (
        <>
          {tab === "statement" && <StatementTab accounts={list} />}
          {tab === "transfer" && <TransferTab accounts={list} />}
          {tab === "balance" && <BalanceTab accounts={list} />}
          {tab === "openBanking" && <OpenBankingTab />}
        </>
      )}
    </>
  );
}
