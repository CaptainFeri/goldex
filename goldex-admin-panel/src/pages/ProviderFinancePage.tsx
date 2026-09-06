import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { fmtNum, fmtDate } from "../lib/format";
import { fmtBySymbol, toApiAmount, unitLabel } from "../lib/money";

interface SymBalance {
  symbol: string;
  traded: number;
  settled: number;
  outstanding: number;
  bedehkar: number;
  bestankar: number;
}
interface ProviderRow {
  providerKey: string;
  symbols: SymBalance[];
  profit?: { symbol: string; amount: number }[];
}

// "we received" = the provider delivered the symbol to us → reduces outstanding.
// "they received" = we delivered the symbol to the provider → increases outstanding.
function signedDelta(direction: "RECEIVE" | "PAY", amount: number) {
  return direction === "RECEIVE" ? -amount : amount;
}

function BalanceBadge({ value, symbol, decimals }: { value: number; symbol: string; decimals: number }) {
  if (value > 0)
    return (
      <span>
        <Badge kind="green">بدهکار</Badge> <span className="mono">{fmtBySymbol(value, symbol, { digits: decimals })}</span>
      </span>
    );
  if (value < 0)
    return (
      <span>
        <Badge kind="red">بستانکار</Badge> <span className="mono">{fmtBySymbol(-value, symbol, { digits: decimals })}</span>
      </span>
    );
  return <Badge kind="gray">تسویه</Badge>;
}

function balanceCell(s: SymBalance) {
  return <BalanceBadge value={s.outstanding} symbol={s.symbol} decimals={s.symbol === "XAU" ? 4 : 0} />;
}

export default function ProviderFinancePage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    providerKey: "",
    symbol: "XAU",
    direction: "RECEIVE" as "RECEIVE" | "PAY",
    amount: "",
    note: "",
  });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const overview = useQuery({
    queryKey: ["pf-overview"],
    queryFn: async () => unwrap<ProviderRow[]>((await api.get("/admin/provider-finance/overview")).data),
  });
  const history = useQuery({
    queryKey: ["pf-settlements"],
    queryFn: async () => unwrap<any[]>((await api.get("/admin/provider-finance/settlements")).data),
  });

  const settle = useMutation({
    mutationFn: (p: any) => api.post("/admin/provider-finance/settle", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pf-overview"] });
      qc.invalidateQueries({ queryKey: ["pf-settlements"] });
      setForm((f) => ({ ...f, amount: "", note: "" }));
    },
  });

  const providers = overview.data?.map((p) => p.providerKey) ?? [];
  const symbolsForProvider = useMemo(() => {
    const p = overview.data?.find((x) => x.providerKey === form.providerKey);
    const syms = new Set<string>(["XAU", "IRR"]);
    p?.symbols.forEach((s) => syms.add(s.symbol));
    return [...syms];
  }, [overview.data, form.providerKey]);

  const currentCell = useMemo(() => {
    if (!form.providerKey) return null;
    const p = overview.data?.find((x) => x.providerKey === form.providerKey);
    return p?.symbols.find((s) => s.symbol === form.symbol) ?? null;
  }, [overview.data, form.providerKey, form.symbol]);

  // The field is typed in the symbol's display unit — toman for a rial symbol
  // — so it is converted once, here, and every downstream use (the preview
  // arithmetic and the submit) works in the symbol's own units, matching the
  // balances the API returns.
  const amount = toApiAmount(form.amount, form.symbol) ?? NaN;
  const currentOut = currentCell?.outstanding ?? 0;
  const delta = Number.isFinite(amount) && amount > 0 ? signedDelta(form.direction, amount) : 0;
  const afterOut = Number((currentOut + delta).toFixed(8));
  const decimals = form.symbol === "XAU" ? 4 : 0;
  const directionLabel = form.direction === "RECEIVE" ? "ما دریافت کردیم" : "آنها دریافت کردند";

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.providerKey || !Number.isFinite(amount) || amount <= 0) return;
    settle.mutate({
      providerKey: form.providerKey,
      symbol: form.symbol,
      direction: form.direction,
      amount,
      note: form.note || undefined,
    });
  }

  return (
    <>
      <Card title="ثبت دریافت/پرداخت با تأمین‌کننده">
        <form onSubmit={submit} className="toolbar" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0, minWidth: 180 }}>
            <label>۱. تأمین‌کننده</label>
            <select className="select" value={form.providerKey} onChange={(e) => set("providerKey", e.target.value)}>
              <option value="">انتخاب کنید…</option>
              {providers.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 120 }}>
            <label>۲. نماد</label>
            <select className="select" value={form.symbol} onChange={(e) => set("symbol", e.target.value)}>
              {symbolsForProvider.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 170 }}>
            <label>۳. طرف دریافت</label>
            <select
              className="select"
              value={form.direction}
              onChange={(e) => set("direction", e.target.value as "RECEIVE" | "PAY")}
            >
              <option value="RECEIVE">ما دریافت کردیم</option>
              <option value="PAY">آنها دریافت کردند</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 150 }}>
            <label>مقدار ({unitLabel(form.symbol)})</label>
            <input className="input mono" dir="ltr" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
          </div>
          <div className="field" style={{ margin: 0, minWidth: 160 }}>
            <label>توضیحات</label>
            <input className="input" value={form.note} onChange={(e) => set("note", e.target.value)} />
          </div>
          <button className="btn primary" disabled={settle.isPending || !form.providerKey || !(amount > 0)}>
            {settle.isPending ? <span className="spin" /> : "ثبت"}
          </button>
        </form>
        {settle.isError && <div className="error-text">{apiError(settle.error)}</div>}

        {/* Live effect of this entry on the (selected provider, symbol) balance */}
        <div className="card" style={{ marginTop: 12, padding: "12px 16px", display: "flex", gap: 24, flexWrap: "wrap", alignItems: "center" }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            اثر ثبت بر مانده <Badge kind="gold">{form.symbol}</Badge>
          </div>
          <div className="row" style={{ gap: 8, alignItems: "center" }}>
            <span className="muted" style={{ fontSize: 12 }}>مانده فعلی:</span>
            <BalanceBadge value={currentOut} symbol={form.symbol} decimals={decimals} />
            <span style={{ color: "var(--text-faint)" }}>←</span>
            <span className="muted" style={{ fontSize: 12 }}>مانده پس از ثبت:</span>
            <BalanceBadge value={afterOut} symbol={form.symbol} decimals={decimals} />
            {amount > 0 && (
              <span className="muted" style={{ fontSize: 12 }}>
                ({signedDelta(form.direction, amount) < 0 ? "کاهش" : "افزایش"} با مقدار واردشده)
              </span>
            )}
          </div>
        </div>

        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          اگر تأمین‌کننده به ما بدهکار است: «ما دریافت کردیم» مانده را کم و «آنها دریافت کردند» مانده را زیاد می‌کند.
          اگر ما به تأمین‌کننده بدهکاریم: «ما دریافت کردیم» مانده را زیاد و «آنها دریافت کردند» مانده را کم می‌کند.
        </div>
      </Card>

      <Card title="وضعیت مالی تأمین‌کنندگان" action={overview.isFetching ? <span className="spin" /> : null}>
        {overview.isLoading ? (
          <Loading />
        ) : overview.isError ? (
          <ErrorState message={apiError(overview.error)} />
        ) : (overview.data?.length ?? 0) === 0 ? (
          <Empty label="معامله‌ای با تأمین‌کنندگان ثبت نشده" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>تأمین‌کننده</th>
                  <th>نماد</th>
                  <th>مجموع معاملات</th>
                  <th>تسویه‌شده</th>
                  <th>مانده (بدهکار/بستانکار)</th>
                  <th>سود ما (XAU)</th>
                </tr>
              </thead>
              <tbody>
                {overview.data!.flatMap((p) => {
                  const rows = p.symbols.length ? p.symbols : [null];
                  const profitXau = p.profit?.find((x) => x.symbol === "XAU")?.amount ?? 0;
                  return rows.map((s, i) => (
                    <tr key={p.providerKey + (s?.symbol ?? "x")}>
                      {i === 0 ? (
                        <td rowSpan={rows.length} style={{ fontWeight: 600 }}>{p.providerKey}</td>
                      ) : null}
                      <td>{s ? <Badge kind="gold">{s.symbol}</Badge> : "—"}</td>
                      <td className="mono">{s ? fmtBySymbol(s.traded, s.symbol, { digits: s.symbol === "XAU" ? 4 : 0 }) : "—"}</td>
                      <td className="mono">{s ? fmtBySymbol(s.settled, s.symbol, { digits: s.symbol === "XAU" ? 4 : 0 }) : "—"}</td>
                      <td>{s ? balanceCell(s) : "—"}</td>
                      {i === 0 ? (
                        <td rowSpan={rows.length} className="mono" style={{ color: "var(--gold-soft)", fontWeight: 700 }}>
                          {fmtNum(profitXau, 4)}
                        </td>
                      ) : null}
                    </tr>
                  ));
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="تاریخچه تسویه">
        {history.isLoading ? (
          <Loading />
        ) : (history.data?.length ?? 0) === 0 ? (
          <Empty label="تسویه‌ای ثبت نشده" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>تأمین‌کننده</th>
                  <th>نماد</th>
                  <th>نوع</th>
                  <th>مقدار</th>
                  <th>توضیحات</th>
                  <th>تاریخ</th>
                </tr>
              </thead>
              <tbody>
                {history.data!.map((s) => (
                  <tr key={s.id}>
                    <td>{s.providerKey}</td>
                    <td><Badge kind="gold">{s.symbol}</Badge></td>
                    <td>
                      {s.direction === "RECEIVE" ? (
                        <Badge kind="green">ما دریافت کردیم</Badge>
                      ) : (
                        <Badge kind="red">آنها دریافت کردند</Badge>
                      )}
                    </td>
                    <td className="mono">{fmtBySymbol(s.amount, s.symbol, { digits: s.symbol === "XAU" ? 4 : 0 })}</td>
                    <td className="muted">{s.note ?? "—"}</td>
                    <td>{fmtDate(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}