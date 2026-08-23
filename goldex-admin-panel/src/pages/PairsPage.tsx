import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import { fmtNum, pairLabel } from "../lib/format";
import type { PricePair } from "../api/types";

function toArray(x: any): any[] {
  return Array.isArray(x) ? x : x?.data ?? x?.items ?? [];
}
const baseSlug = (p: any) => p.baseSymbol?.slug ?? p.baseCode ?? "—";
const quoteSlug = (p: any) => p.quoteSymbol?.slug ?? p.quoteCode ?? "—";

const EMPTY = {
  baseCode: "",
  quoteCode: "",
  price: 0,
  isValid: true,
  buyCommission: 0.01,
  sellCommission: 0.01,
  tradingViewSymbol: "",
  minBuy: 0.001,
  maxBuy: 100,
  minSell: 0.001,
  maxSell: 100,
  decimals: 2,
  buyWarnHours: "",
  buyExpireHours: "",
  buyGraceHours: "",
  sellWarnHours: "",
  sellExpireHours: "",
  sellGraceHours: "",
};

function PairForm({ initial, symbols, onClose }: { initial?: any; symbols: any[]; onClose: () => void }) {
  const qc = useQueryClient();
  const editing = !!initial?.id;
  const [form, setForm] = useState<any>({
    ...EMPTY,
    ...(initial
      ? {
          baseCode: baseSlug(initial),
          quoteCode: quoteSlug(initial),
          price: Number(initial.price ?? initial.bestBuyPrice ?? 0),
          isValid: !!initial.isValid,
          buyCommission: Number(initial.buyCommission ?? 0.01),
          sellCommission: Number(initial.sellCommission ?? 0.01),
          tradingViewSymbol: initial.tradingViewSymbol ?? "",
          minBuy: Number(initial.minBuy ?? 0.001),
          maxBuy: Number(initial.maxBuy ?? 100),
          minSell: Number(initial.minSell ?? 0.001),
          maxSell: Number(initial.maxSell ?? 100),
          decimals: Number(initial.decimals ?? 2),
          buyWarnHours: initial.buyWarnHours ?? "",
          buyExpireHours: initial.buyExpireHours ?? "",
          buyGraceHours: initial.buyGraceHours ?? "",
          sellWarnHours: initial.sellWarnHours ?? "",
          sellExpireHours: initial.sellExpireHours ?? "",
          sellGraceHours: initial.sellGraceHours ?? "",
        }
      : {}),
  });
  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: (body: any) => (editing ? api.patch(`/admin/pair/${initial.id}`, body) : api.post("/admin/pair", body)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pairs"] });
      onClose();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = (v: any) => Number(v) || 0;
    const baseSym = symbols.find((s: any) => s.slug === form.baseCode);
    const quoteSym = symbols.find((s: any) => s.slug === form.quoteCode);
    if (baseSym && quoteSym && baseSym.marketType !== quoteSym.marketType) {
      alert(`امکان جفت‌سازی نماد ${baseSym.marketType === "informal" ? "غیررسمی" : "رسمی"} با نماد ${quoteSym.marketType === "informal" ? "غیررسمی" : "رسمی"} وجود ندارد.`);
      return;
    }
    save.mutate({
      baseCode: form.baseCode,
      quoteCode: form.quoteCode,
      price: n(form.price),
      isValid: !!form.isValid,
      buyCommission: n(form.buyCommission),
      sellCommission: n(form.sellCommission),
      tradingViewSymbol: form.tradingViewSymbol || `${form.baseCode}${form.quoteCode}`,
      minBuy: n(form.minBuy),
      maxBuy: n(form.maxBuy),
      minSell: n(form.minSell),
      maxSell: n(form.maxSell),
      decimals: n(form.decimals),
      buyWarnHours: form.buyWarnHours ? n(form.buyWarnHours) : null,
      buyExpireHours: form.buyExpireHours ? n(form.buyExpireHours) : null,
      buyGraceHours: form.buyGraceHours ? n(form.buyGraceHours) : null,
      sellWarnHours: form.sellWarnHours ? n(form.sellWarnHours) : null,
      sellExpireHours: form.sellExpireHours ? n(form.sellExpireHours) : null,
      sellGraceHours: form.sellGraceHours ? n(form.sellGraceHours) : null,
    });
  }

  const slugs = symbols.map((s: any) => ({ slug: s.slug, marketType: s.marketType }));
  const numField = (k: string, label: string) => (
    <div className="field">
      <label>{label}</label>
      <input className="input mono" dir="ltr" value={form[k]} onChange={(e) => set(k, e.target.value)} />
    </div>
  );

  return (
    <Modal wide title={editing ? "ویرایش جفت‌ارز" : "افزودن جفت‌ارز"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="grid grid-3">
          <div className="field">
            <label>پایه</label>
            <select className="select" value={form.baseCode} onChange={(e) => set("baseCode", e.target.value)} required>
              <option value="">—</option>
              {slugs.map((s: any) => <option key={s.slug} value={s.slug}>{s.slug} ({s.marketType === "informal" ? "غیررسمی" : "رسمی"})</option>)}
            </select>
          </div>
          <div className="field">
            <label>مظنه</label>
            <select className="select" value={form.quoteCode} onChange={(e) => set("quoteCode", e.target.value)} required>
              <option value="">—</option>
              {slugs.map((s: any) => <option key={s.slug} value={s.slug}>{s.slug} ({s.marketType === "informal" ? "غیررسمی" : "رسمی"})</option>)}
            </select>
          </div>
          {numField("price", "قیمت")}
          {numField("buyCommission", "کارمزد خرید")}
          {numField("sellCommission", "کارمزد فروش")}
          {numField("decimals", "اعشار")}
          {numField("minBuy", "حداقل خرید")}
          {numField("maxBuy", "حداکثر خرید")}
          {numField("minSell", "حداقل فروش")}
          {numField("maxSell", "حداکثر فروش")}
          <div className="field">
            <label>نماد تریدینگ‌ویو</label>
            <input className="input mono" dir="ltr" value={form.tradingViewSymbol} onChange={(e) => set("tradingViewSymbol", e.target.value)} placeholder="XAUUSD" />
          </div>
        </div>

        <details style={{ margin: "12px 0", padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}>
          <summary style={{ cursor: "pointer", fontWeight: 500, fontSize: "0.9rem" }}>محدودیت زمانی درخواست‌های اعتباری (Credit Pend Deadlines)</summary>
          <div className="grid grid-3" style={{ marginTop: 10 }}>
            <div className="field">
              <label>خرید — هشدار (ساعت)</label>
              <input className="input mono" dir="ltr" type="number" min={0} value={form.buyWarnHours} onChange={(e) => set("buyWarnHours", e.target.value)} placeholder="x" />
            </div>
            <div className="field">
              <label>خرید — انقضا (ساعت)</label>
              <input className="input mono" dir="ltr" type="number" min={0} value={form.buyExpireHours} onChange={(e) => set("buyExpireHours", e.target.value)} placeholder="y" />
            </div>
            <div className="field">
              <label>خرید — مهلت پس از انقضا (ساعت)</label>
              <input className="input mono" dir="ltr" type="number" min={0} value={form.buyGraceHours} onChange={(e) => set("buyGraceHours", e.target.value)} placeholder="z" />
            </div>
            <div className="field">
              <label>فروش — هشدار (ساعت)</label>
              <input className="input mono" dir="ltr" type="number" min={0} value={form.sellWarnHours} onChange={(e) => set("sellWarnHours", e.target.value)} placeholder="x" />
            </div>
            <div className="field">
              <label>فروش — انقضا (ساعت)</label>
              <input className="input mono" dir="ltr" type="number" min={0} value={form.sellExpireHours} onChange={(e) => set("sellExpireHours", e.target.value)} placeholder="y" />
            </div>
            <div className="field">
              <label>فروش — مهلت پس از انقضا (ساعت)</label>
              <input className="input mono" dir="ltr" type="number" min={0} value={form.sellGraceHours} onChange={(e) => set("sellGraceHours", e.target.value)} placeholder="z" />
            </div>
          </div>
        </details>

        <label className="row" style={{ gap: 6, margin: "4px 0 16px" }}>
          <input type="checkbox" checked={form.isValid} onChange={(e) => set("isValid", e.target.checked)} />
          معتبر
        </label>
        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={save.isPending}>{save.isPending ? <span className="spin" /> : "ذخیره"}</button>
        </div>
      </form>
    </Modal>
  );
}

function DetailsModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["pair-detail", id],
    queryFn: async () => unwrap<PricePair>((await api.get(`/admin/pair/${id}`)).data),
  });
  const p = q.data;
  return (
    <Modal title="جزئیات جفت‌ارز" onClose={onClose}>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={apiError(q.error)} />
      ) : p ? (
        <div className="kv">
          <span className="k">شناسه</span>
          <span className="mono" style={{ fontSize: 12 }}>{p.id}</span>
          <span className="k">پایه</span>
          <span><Badge kind="gold">{baseSlug(p)}</Badge></span>
          <span className="k">مظنه</span>
          <span>{quoteSlug(p)}</span>
          <span className="k">قیمت خرید</span>
          <span className="mono">{fmtNum(p.bestBuyPrice ?? p.price, 2)}</span>
          <span className="k">قیمت فروش</span>
          <span className="mono">{fmtNum(p.bestSellPrice ?? p.price, 2)}</span>
          <span className="k">کارمزد خرید</span>
          <span className="mono">{fmtNum(p.buyCommission, 4)}</span>
          <span className="k">کارمزد فروش</span>
          <span className="mono">{fmtNum(p.sellCommission, 4)}</span>
          <span className="k">اعتبار</span>
          <span>{p.isValid ? <Badge kind="green">معتبر</Badge> : <Badge kind="gray">نامعتبر</Badge>}</span>
          <span className="k">اعشار</span>
          <span className="mono">{fmtNum(p.decimals)}</span>
          <span className="k">حداقل خرید</span>
          <span className="mono">{fmtNum(p.minBuy, 4)}</span>
          <span className="k">حداکثر خرید</span>
          <span className="mono">{fmtNum(p.maxBuy, 4)}</span>
          <span className="k">حداقل فروش</span>
          <span className="mono">{fmtNum(p.minSell, 4)}</span>
          <span className="k">حداکثر فروش</span>
          <span className="mono">{fmtNum(p.maxSell, 4)}</span>
          <span className="k">نماد تریدینگ‌ویو</span>
          <span className="mono">{p.tradingViewSymbol || "—"}</span>
        </div>
      ) : null}
    </Modal>
  );
}

function PriceOverrideModal({ pair, onClose }: { pair: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [buyPrice, setBuyPrice] = useState(String(pair.bestBuyPrice ?? pair.price ?? ""));
  const [sellPrice, setSellPrice] = useState(String(pair.bestSellPrice ?? pair.price ?? ""));

  const save = useMutation({
    mutationFn: (body: any) => api.patch(`/admin/pair/${pair.id}/price`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pairs"] });
      onClose();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    save.mutate({
      buyPrice: Number(buyPrice) || 0,
      sellPrice: Number(sellPrice) || 0,
    });
  }

  return (
    <Modal title={`ویرایش دستی قیمت — ${pairLabel(pair)}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="kv" style={{ marginBottom: 12 }}>
          <span className="k">جفت‌ارز</span>
          <span>{pairLabel(pair)}</span>
        </div>
        <div className="field">
          <label>قیمت خرید</label>
          <input className="input mono" dir="ltr" type="number" step="0.0001" value={buyPrice} onChange={(e) => setBuyPrice(e.target.value)} required />
        </div>
        <div className="field">
          <label>قیمت فروش</label>
          <input className="input mono" dir="ltr" type="number" step="0.0001" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} required />
        </div>
        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={save.isPending}>{save.isPending ? <span className="spin" /> : "ذخیره"}</button>
        </div>
      </form>
    </Modal>
  );
}

export default function PairsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ open: boolean; initial?: any }>({ open: false });
  const [detailId, setDetailId] = useState<string | null>(null);
  const [priceOverride, setPriceOverride] = useState<any | null>(null);
  const [overviewPair, setOverviewPair] = useState<any | null>(null);
  const [filterBase, setFilterBase] = useState("");
  const [filterQuote, setFilterQuote] = useState("");

  const list = useQuery({
    queryKey: ["pairs"],
    queryFn: async () => unwrap<PricePair[]>((await api.get("/admin/pair")).data),
  });
  const symbols = useQuery({
    queryKey: ["symbols-active"],
    queryFn: async () => toArray(unwrap<any>((await api.get("/admin/symbols/active")).data)),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/pair/${id}/validity`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pairs"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/pair/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pairs"] }),
  });

  let pairs = list.data ?? [];
  if (filterBase) pairs = pairs.filter((p) => baseSlug(p) === filterBase);
  if (filterQuote) pairs = pairs.filter((p) => quoteSlug(p) === filterQuote);

  const allSlugs = Array.from(new Set(pairs.map((p) => baseSlug(p))));

  return (
    <Card
      title="جفت‌ارزها"
      action={
        <div className="row" style={{ gap: 8 }}>
          <select className="select" value={filterBase} onChange={(e) => setFilterBase(e.target.value)} style={{ minWidth: 120 }}>
            <option value="">همه پایه‌ها</option>
            {allSlugs.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="select" value={filterQuote} onChange={(e) => setFilterQuote(e.target.value)} style={{ minWidth: 120 }}>
            <option value="">همه مظنه‌ها</option>
            {allSlugs.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn primary sm" onClick={() => setForm({ open: true })}>+ افزودن جفت‌ارز</button>
        </div>
      }
    >
      {(toggle.isError || remove.isError) && <div className="error-text">{apiError(toggle.error || remove.error)}</div>}
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={apiError(list.error)} />
      ) : pairs.length === 0 ? (
        <Empty />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>پایه</th>
                <th>مظنه</th>
                <th>قیمت خرید</th>
                <th>قیمت فروش</th>
                <th>اعتبار</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p: any) => (
                <tr key={p.id}>
                  <td><Badge kind="gold">{baseSlug(p)}</Badge></td>
                  <td>{quoteSlug(p)}</td>
                  <td className="mono">{fmtNum(p.bestBuyPrice ?? p.price, 2)}</td>
                  <td className="mono">{fmtNum(p.bestSellPrice ?? p.price, 2)}</td>
                  <td>{p.isValid ? <Badge kind="green">معتبر</Badge> : <Badge kind="gray">نامعتبر</Badge>}</td>
                  <td>
                    <div className="row">
                      <button className="btn sm" onClick={() => setDetailId(p.id)}>جزئیات</button>
                      <button className="btn sm" onClick={() => setForm({ open: true, initial: p })}>ویرایش</button>
                      <button className="btn sm" onClick={() => setPriceOverride(p)}>قیمت</button>
                      <button className="btn sm" onClick={() => setOverviewPair(p)}>درخواست‌ها</button>
                      <button className="btn sm" disabled={toggle.isPending} onClick={() => toggle.mutate(p.id)}>
                        {p.isValid ? "غیرفعال" : "فعال"}
                      </button>
                      <button className="btn sm danger" disabled={remove.isPending} onClick={() => window.confirm("حذف جفت‌ارز؟") && remove.mutate(p.id)}>
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailId && <DetailsModal id={detailId} onClose={() => setDetailId(null)} />}
      {priceOverride && <PriceOverrideModal pair={priceOverride} onClose={() => setPriceOverride(null)} />}
      {overviewPair && <RequestsOverviewModal pair={overviewPair} onClose={() => setOverviewPair(null)} />}
      {form.open && <PairForm initial={form.initial} symbols={symbols.data ?? []} onClose={() => setForm({ open: false })} />}
    </Card>
  );
}

function RequestsOverviewModal({ pair, onClose }: { pair: any; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["pair-requests-overview", pair.id],
    queryFn: async () => unwrap<any>((await api.get(`/admin/pair/${pair.id}/requests-overview`)).data),
  });

  const stateColors: Record<string, "gold" | "gray" | "green" | "red"> = { GREEN: "green", YELLOW: "gold", RED: "red", GRACE: "gold", CLOSED: "gray" };
  const stateLabels: Record<string, string> = { GREEN: "سبز", YELLOW: "زرد", RED: "قرمز", GRACE: "مهلت", CLOSED: "بسته" };

  return (
    <Modal wide title={`درخواست‌های اعتباری — ${pairLabel(pair)}`} onClose={onClose}>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={apiError(q.error)} /> : (
        <div>
          <div className="row" style={{ gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
            <Badge kind="green">خرید: {q.data?.summary?.buy ?? 0}</Badge>
            <Badge kind="gold">فروش: {q.data?.summary?.sell ?? 0}</Badge>
            {Object.entries(q.data?.summary?.byState ?? {}).map(([state, count]) => (
              <Badge key={state} kind={stateColors[state] ?? "gray"}>{stateLabels[state] ?? state}: {count as number}</Badge>
            ))}
          </div>
          {(q.data?.orders?.length > 0 || q.data?.quoteRequests?.length > 0) ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>نوع</th>
                    <th>کد</th>
                    <th>جهت</th>
                    <th>وضعیت</th>
                    <th>مهلت</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data?.orders?.map((o: any) => (
                    <tr key={o.id}>
                      <td>سفارش</td>
                      <td className="mono">{o.orderCode}</td>
                      <td>{o.side}</td>
                      <td><Badge kind={o.status === "PENDING" ? "green" : "gray"}>{o.status}</Badge></td>
                      <td><Badge kind={stateColors[o.pendDeadlineState] ?? "gray"}>{stateLabels[o.pendDeadlineState] ?? o.pendDeadlineState ?? "—"}</Badge></td>
                    </tr>
                  ))}
                  {q.data?.quoteRequests?.map((qr: any) => (
                    <tr key={qr.id}>
                      <td>استعلام</td>
                      <td className="mono">{qr.id.slice(0, 8)}</td>
                      <td>{qr.side}</td>
                      <td><Badge kind={qr.status === "PENDING" ? "green" : "gray"}>{qr.status}</Badge></td>
                      <td><Badge kind={stateColors[qr.pendDeadlineState] ?? "gray"}>{stateLabels[qr.pendDeadlineState] ?? qr.pendDeadlineState ?? "—"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty label="درخواست اعتباری برای این جفت‌ارز وجود ندارد" />
          )}
        </div>
      )}
    </Modal>
  );
}
