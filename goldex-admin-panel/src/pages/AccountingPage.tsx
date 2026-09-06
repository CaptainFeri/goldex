import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import {
  Card,
  Loading,
  ErrorState,
  Empty,
  Badge,
  Stat,
} from "../components/ui";
import { fmtNum, fmtDate, symbolLabel } from "../lib/format";

type ValuationBasis = "BID" | "ASK" | "MID";

interface AccountingSettings {
  referenceSymbolId: string | null;
  valuationBasis: ValuationBasis;
  priceStalenessSeconds: number;
  effectiveReference: {
    symbolId: string;
    name: string | null;
    slug: string | null;
    isDefault: boolean;
  };
}

interface AssetLine {
  symbol: { id: string; name: string | null; slug: string | null };
  revenue: number;
  cost: number;
  net: number;
  rate: number | null;
  rateStale: boolean;
  revenueInReference: number | null;
  costInReference: number | null;
  netInReference: number | null;
  unpricedReason?: string;
}

interface Summary {
  range: { from: string; to: string };
  reference: {
    symbolId: string;
    name: string | null;
    slug: string | null;
    isDefault: boolean;
  };
  valuationBasis: ValuationBasis;
  assets: AssetLine[];
  totals: { revenue: number; cost: number; net: number };
  unpricedAssets: { symbol: { slug: string | null }; reason?: string }[];
  stale: boolean;
  asOf: string;
}

const DAY = 24 * 3600_000;
const PRESETS = [
  { key: "1d", label: "۲۴ ساعت", ms: DAY },
  { key: "7d", label: "۷ روز", ms: 7 * DAY },
  { key: "30d", label: "۳۰ روز", ms: 30 * DAY },
  { key: "90d", label: "۹۰ روز", ms: 90 * DAY },
];

const BASIS_LABEL: Record<ValuationBasis, string> = {
  BID: "قیمت فروش مشتری (ارزش نقدشوندگی)",
  ASK: "قیمت خرید مشتری (بهای جایگزینی)",
  MID: "میانگین خرید و فروش",
};

const UNPRICED_REASON: Record<string, string> = {
  "no-priced-route": "مسیر قیمتی زنده‌ای تا ارز مرجع پیدا نشد",
};

/** The reference symbol's slug, used as the unit label on every figure. */
function unitOf(summary?: Summary | null): string {
  return summary?.reference?.slug ?? summary?.reference?.name ?? "";
}

function SettingsCard({ settings }: { settings: AccountingSettings }) {
  const qc = useQueryClient();
  const [referenceSymbolId, setReferenceSymbolId] = useState(
    settings.referenceSymbolId ?? settings.effectiveReference.symbolId,
  );
  const [valuationBasis, setValuationBasis] = useState<ValuationBasis>(
    settings.valuationBasis,
  );
  const [staleness, setStaleness] = useState(
    String(settings.priceStalenessSeconds),
  );

  const symbols = useQuery({
    queryKey: ["symbols-for-accounting"],
    queryFn: async () =>
      unwrap<any[]>((await api.get("/admin/symbols/active")).data),
  });

  const save = useMutation({
    mutationFn: () =>
      api.patch("/admin/accounting/settings", {
        referenceSymbolId,
        valuationBasis,
        priceStalenessSeconds:
          Number(staleness) || settings.priceStalenessSeconds,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["accounting-settings"] });
      qc.invalidateQueries({ queryKey: ["accounting-summary"] });
      qc.invalidateQueries({ queryKey: ["accounting-holdings"] });
    },
  });

  const symbolList = Array.isArray(symbols.data) ? symbols.data : [];

  return (
    <Card title="تنظیمات حسابداری">
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        نماد قیمت‌دهی، ارز مرجع گزارش‌هاست: سود، هزینه و سود خالص هر دارایی با
        قیمت لحظه‌ای به این نماد تبدیل و جمع می‌شود. تا وقتی نمادی انتخاب نشده
        باشد، گزارش‌ها بر مبنای ریال محاسبه می‌شوند.
      </div>
      <div className="row" style={{ gap: 12, flexWrap: "wrap" }}>
        <div className="field grow">
          <label>نماد قیمت‌دهی (ارز مرجع)</label>
          <select
            className="select"
            value={referenceSymbolId}
            onChange={(e) => setReferenceSymbolId(e.target.value)}
            disabled={symbols.isLoading}
          >
            {symbolList.map((s: any) => (
              <option key={s.id} value={s.id}>
                {symbolLabel(s)}
              </option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label>مبنای ارزش‌گذاری</label>
          <select
            className="select"
            value={valuationBasis}
            onChange={(e) =>
              setValuationBasis(e.target.value as ValuationBasis)
            }
          >
            {(Object.keys(BASIS_LABEL) as ValuationBasis[]).map((b) => (
              <option key={b} value={b}>
                {BASIS_LABEL[b]}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>آستانه کهنگی قیمت (ثانیه)</label>
          <input
            className="input mono"
            dir="ltr"
            type="number"
            min={1}
            value={staleness}
            onChange={(e) => setStaleness(e.target.value)}
          />
        </div>
      </div>
      {settings.effectiveReference.isDefault && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
          هنوز نماد قیمت‌دهی انتخاب نشده است؛ گزارش‌ها فعلاً بر مبنای{" "}
          {settings.effectiveReference.slug ?? settings.effectiveReference.name}{" "}
          محاسبه می‌شوند.
        </div>
      )}
      {save.isError && <div className="error-text">{apiError(save.error)}</div>}
      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button
          className="btn primary"
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? <span className="spin" /> : "ذخیره تنظیمات"}
        </button>
      </div>
    </Card>
  );
}

export default function AccountingPage() {
  const [preset, setPreset] = useState("30d");
  const range = useMemo(() => {
    const to = Date.now();
    const ms = PRESETS.find((p) => p.key === preset)?.ms ?? 30 * DAY;
    return { from: to - ms, to };
  }, [preset]);

  const settings = useQuery({
    queryKey: ["accounting-settings"],
    queryFn: async () =>
      unwrap<AccountingSettings>(
        (await api.get("/admin/accounting/settings")).data,
      ),
  });

  const summary = useQuery({
    queryKey: ["accounting-summary", range],
    queryFn: async () =>
      unwrap<Summary>(
        (
          await api.get("/admin/accounting/summary", {
            params: { from: range.from, to: range.to },
          })
        ).data,
      ),
  });

  const holdings = useQuery({
    queryKey: ["accounting-holdings"],
    queryFn: async () =>
      unwrap<any>((await api.get("/admin/accounting/holdings")).data),
  });

  const data = summary.data;
  const unit = unitOf(data);

  return (
    <>
      {settings.isLoading ? (
        <Card title="تنظیمات حسابداری">
          <Loading />
        </Card>
      ) : settings.isError ? (
        <Card title="تنظیمات حسابداری">
          <ErrorState message={apiError(settings.error)} />
        </Card>
      ) : settings.data ? (
        <SettingsCard settings={settings.data} />
      ) : null}

      <Card
        title="سود و هزینه بر مبنای قیمت لحظه‌ای"
        action={
          <div className="row" style={{ gap: 6 }}>
            {PRESETS.map((p) => (
              <button
                key={p.key}
                className={"btn ghost sm" + (preset === p.key ? " active" : "")}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      >
        {summary.isLoading ? (
          <Loading />
        ) : summary.isError ? (
          <ErrorState message={apiError(summary.error)} />
        ) : !data ? (
          <Empty label="داده‌ای برای این بازه وجود ندارد" />
        ) : (
          <>
            <div className="grid grid-3" style={{ marginBottom: 16 }}>
              <Stat
                label={`سود ناخالص (${unit})`}
                value={fmtNum(data.totals.revenue, 0)}
              />
              <Stat
                label={`هزینه (${unit})`}
                value={fmtNum(data.totals.cost, 0)}
              />
              <Stat
                label={`سود خالص (${unit})`}
                value={fmtNum(data.totals.net, 0)}
                sub={
                  <span className="muted" style={{ fontSize: 12 }}>
                    {BASIS_LABEL[data.valuationBasis]} — {fmtDate(data.asOf)}
                  </span>
                }
              />
            </div>

            {data.stale && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                ⚠️ برخی نرخ‌های تبدیل کهنه‌تر از آستانه تعیین‌شده هستند؛ ارقام
                با آخرین قیمت موجود محاسبه شده‌اند.
              </div>
            )}
            {data.unpricedAssets.length > 0 && (
              <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>
                ⚠️ این دارایی‌ها در جمع کل لحاظ نشده‌اند چون نرخ تبدیل زنده‌ای
                نداشتند:{" "}
                {data.unpricedAssets
                  .map((a) => a.symbol.slug ?? "—")
                  .join("، ")}
              </div>
            )}

            {data.assets.length === 0 ? (
              <Empty label="در این بازه رویداد مالی ثبت نشده است" />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>دارایی</th>
                      <th>سود (واحد دارایی)</th>
                      <th>هزینه (واحد دارایی)</th>
                      <th>خالص (واحد دارایی)</th>
                      <th>نرخ تبدیل</th>
                      <th>سود ({unit})</th>
                      <th>هزینه ({unit})</th>
                      <th>خالص ({unit})</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.assets.map((a) => (
                      <tr key={a.symbol.id}>
                        <td>{a.symbol.slug ?? a.symbol.name ?? "—"}</td>
                        <td className="mono">{fmtNum(a.revenue, 6)}</td>
                        <td className="mono">{fmtNum(a.cost, 6)}</td>
                        <td className="mono">{fmtNum(a.net, 6)}</td>
                        <td className="mono">
                          {a.rate === null ? (
                            <Badge kind="red">
                              {UNPRICED_REASON[a.unpricedReason ?? ""] ??
                                "بدون نرخ"}
                            </Badge>
                          ) : (
                            <>
                              {fmtNum(a.rate, 6)}
                              {a.rateStale && <Badge kind="gold">کهنه</Badge>}
                            </>
                          )}
                        </td>
                        <td className="mono">
                          {a.revenueInReference === null
                            ? "—"
                            : fmtNum(a.revenueInReference, 0)}
                        </td>
                        <td className="mono">
                          {a.costInReference === null
                            ? "—"
                            : fmtNum(a.costInReference, 0)}
                        </td>
                        <td className="mono">
                          {a.netInReference === null
                            ? "—"
                            : fmtNum(a.netInReference, 0)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      <Card title="موجودی‌ها بر مبنای قیمت لحظه‌ای">
        {holdings.isLoading ? (
          <Loading />
        ) : holdings.isError ? (
          <ErrorState message={apiError(holdings.error)} />
        ) : !holdings.data ? (
          <Empty label="موجودی‌ای ثبت نشده است" />
        ) : (
          <>
            <div className="grid grid-2" style={{ marginBottom: 16 }}>
              <Stat
                label={`دارایی مشتریان (${holdings.data.reference?.slug ?? ""})`}
                value={fmtNum(holdings.data.totals?.customer, 0)}
              />
              <Stat
                label={`حساب سیستم (${holdings.data.reference?.slug ?? ""})`}
                value={fmtNum(holdings.data.totals?.system, 0)}
              />
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>دارایی</th>
                    <th>موجودی مشتریان</th>
                    <th>حساب سیستم</th>
                    <th>نرخ تبدیل</th>
                    <th>معادل مشتریان</th>
                    <th>معادل سیستم</th>
                  </tr>
                </thead>
                <tbody>
                  {(holdings.data.assets ?? []).map((a: any) => (
                    <tr key={a.symbol.id}>
                      <td>{a.symbol.slug ?? a.symbol.name ?? "—"}</td>
                      <td className="mono">{fmtNum(a.customerTotal, 6)}</td>
                      <td className="mono">{fmtNum(a.systemBalance, 6)}</td>
                      <td className="mono">
                        {a.rate === null ? "—" : fmtNum(a.rate, 6)}
                      </td>
                      <td className="mono">
                        {a.customerTotalInReference === null
                          ? "—"
                          : fmtNum(a.customerTotalInReference, 0)}
                      </td>
                      <td className="mono">
                        {a.systemBalanceInReference === null
                          ? "—"
                          : fmtNum(a.systemBalanceInReference, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}
