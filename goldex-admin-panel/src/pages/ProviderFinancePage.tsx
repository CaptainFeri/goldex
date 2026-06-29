import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { fmtNum, fmtDate } from "../lib/format";

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

function balanceCell(s: SymBalance) {
  if (s.outstanding > 0)
    return (
      <span>
        <Badge kind="green">بدهکار</Badge>{" "}
        <span className="mono">{fmtNum(s.bedehkar, s.symbol === "XAU" ? 4 : 0)}</span>
      </span>
    );
  if (s.outstanding < 0)
    return (
      <span>
        <Badge kind="red">بستانکار</Badge>{" "}
        <span className="mono">{fmtNum(s.bestankar, s.symbol === "XAU" ? 4 : 0)}</span>
      </span>
    );
  return <Badge kind="gray">تسویه</Badge>;
}

export default function ProviderFinancePage() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ providerKey: "", symbol: "XAU", direction: "RECEIVE", amount: "", note: "" });
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

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const amount = Number(form.amount);
    if (!form.providerKey || !form.symbol || Number.isNaN(amount) || amount <= 0) return;
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
      <Card title="ثبت تسویه با تأمین‌کننده">
        <form onSubmit={submit} className="toolbar" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0, minWidth: 180 }}>
            <label>تأمین‌کننده</label>
            <select className="select" value={form.providerKey} onChange={(e) => set("providerKey", e.target.value)}>
              <option value="">انتخاب کنید…</option>
              {providers.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 110 }}>
            <label>نماد</label>
            <select className="select" value={form.symbol} onChange={(e) => set("symbol", e.target.value)}>
              {symbolsForProvider.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 200 }}>
            <label>نوع</label>
            <select className="select" value={form.direction} onChange={(e) => set("direction", e.target.value)}>
              <option value="RECEIVE">دریافت از تأمین‌کننده</option>
              <option value="PAY">پرداخت به تأمین‌کننده</option>
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 150 }}>
            <label>مقدار</label>
            <input className="input mono" dir="ltr" value={form.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0" />
          </div>
          <div className="field" style={{ margin: 0, minWidth: 160 }}>
            <label>توضیحات</label>
            <input className="input" value={form.note} onChange={(e) => set("note", e.target.value)} />
          </div>
          <button className="btn primary" disabled={settle.isPending}>
            {settle.isPending ? <span className="spin" /> : "ثبت تسویه"}
          </button>
        </form>
        {settle.isError && <div className="error-text">{apiError(settle.error)}</div>}
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          «دریافت» موجودی بدهکار تأمین‌کننده را کم می‌کند، «پرداخت» بدهی ما به تأمین‌کننده را کم می‌کند.
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
                      <td className="mono">{s ? fmtNum(s.traded, s.symbol === "XAU" ? 4 : 0) : "—"}</td>
                      <td className="mono">{s ? fmtNum(s.settled, s.symbol === "XAU" ? 4 : 0) : "—"}</td>
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
                        <Badge kind="green">دریافت</Badge>
                      ) : (
                        <Badge kind="red">پرداخت</Badge>
                      )}
                    </td>
                    <td className="mono">{fmtNum(s.amount, s.symbol === "XAU" ? 4 : 0)}</td>
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
