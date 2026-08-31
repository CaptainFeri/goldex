import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Modal, Loading, ErrorState, Badge } from "./ui";
import { fmtNum, fmtDate } from "../lib/format";
import type { PairRoutes, PriceRoute, RouteCandidate, RoutingMode } from "../api/types";

const MODE_OPTIONS: { value: RoutingMode; label: string; hint: string }[] = [
  {
    value: "AUTO",
    label: "خودکار (پیش‌فرض)",
    hint: "اگر قیمت مستقیم قابل استفاده باشد از آن، در غیر این صورت از مسیر واسط.",
  },
  {
    value: "DIRECT",
    label: "فقط مستقیم",
    hint: "هرگز از مسیر واسط استفاده نمی‌شود؛ با نبود قیمت مستقیم، جفت‌ارز قیمت ندارد.",
  },
  {
    value: "BRIDGE",
    label: "فقط غیرمستقیم",
    hint: "همیشه از مسیر واسط، حتی وقتی قیمت مستقیم موجود است.",
  },
  {
    value: "BEST",
    label: "بهترین قیمت",
    hint: "در هر سمت، مسیری که برای مشتری قیمت بهتری می‌دهد (خرید ارزان‌تر، فروش گران‌تر).",
  },
];

const REJECTION_LABEL: Record<string, string> = {
  "no-direct-pair": "جفت‌ارزی برای این مسیر وجود ندارد",
  "pair-invalid": "جفت‌ارز نامعتبر است",
  "no-price": "قیمتی ثبت نشده",
  "stale-price": "قیمت کهنه شده",
  "bridge-unit-unsafe": "واحد نماد واسط سازگار نیست",
  "no-bridge-found": "هیچ نماد واسطی هر دو سر این جفت‌ارز را پوشش نمی‌دهد",
  "deviation-exceeded": "اختلاف قیمت بیش از حد مجاز",
  "mode-excluded": "بر اساس حالت مسیریابی کنار گذاشته شد",
};

function CandidateRow({ c, selected }: { c: RouteCandidate; selected: boolean }) {
  const path =
    c.legs.length > 0
      ? c.legs.map((l) => `${l.baseSlug}/${l.quoteSlug}${l.inverted ? "⁻¹" : ""}`).join(" × ")
      : "—";

  return (
    <tr style={selected ? { background: "var(--bg-elev-2)" } : undefined}>
      <td>
        {c.kind === "DIRECT" ? (
          <Badge kind="green">مستقیم</Badge>
        ) : (
          <Badge kind="gold">واسط {c.bridgeSlug ?? "?"}</Badge>
        )}
        {selected && (
          <span className="mono" style={{ color: "var(--gold-soft)", marginInlineStart: 6 }}>
            ★
          </span>
        )}
      </td>
      <td className="mono" style={{ fontSize: 12 }}>{path}</td>
      <td className="mono">{c.price == null ? "—" : fmtNum(c.price, 4)}</td>
      <td className="mono">
        {c.deviationPercent == null ? "—" : `${fmtNum(c.deviationPercent, 2)}٪`}
      </td>
      <td style={{ whiteSpace: "normal", maxWidth: 280 }}>
        {c.usable ? (
          <Badge kind="green">قابل استفاده</Badge>
        ) : (
          <>
            <Badge kind="red">{REJECTION_LABEL[c.rejection ?? ""] ?? c.rejection ?? "نامشخص"}</Badge>
            {c.note && (
              <div className="muted" style={{ fontSize: 11, marginTop: 3 }}>{c.note}</div>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

function SideTable({ route, title }: { route: PriceRoute; title: string }) {
  const candidates = [route.direct, ...route.bridges].filter(Boolean) as RouteCandidate[];
  const selectedKey = route.selected
    ? `${route.selected.kind}:${route.selected.bridgeSymbolId ?? ""}`
    : null;

  return (
    <div style={{ marginBottom: 18 }}>
      <div className="row spread" style={{ marginBottom: 8 }}>
        <b style={{ fontSize: 13 }}>{title}</b>
        <span className="mono" style={{ fontSize: 13 }}>
          {route.selected ? (
            <>
              قیمت انتخاب‌شده: <b>{fmtNum(route.selected.price, 4)}</b>
            </>
          ) : (
            <span style={{ color: "var(--red)" }}>هیچ مسیر قابل استفاده‌ای نیست</span>
          )}
        </span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>مسیر</th>
              <th>ترکیب</th>
              <th>قیمت</th>
              <th>اختلاف با مستقیم</th>
              <th>وضعیت</th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((c, i) => (
              <CandidateRow
                key={`${c.kind}-${c.bridgeSymbolId ?? i}`}
                c={c}
                selected={selectedKey === `${c.kind}:${c.bridgeSymbolId ?? ""}`}
              />
            ))}
          </tbody>
        </table>
      </div>
      {route.deviationBlocked && (
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          یک مسیر واسط به دلیل عبور از حد مجاز اختلاف قیمت کنار گذاشته شد.
        </div>
      )}
    </div>
  );
}

/**
 * Shows what the resolver would pick for a pair right now — every candidate,
 * its price and, when it is unusable, why — and lets the admin change the
 * pair's routing policy.
 */
export default function RoutingModal({
  pair,
  onClose,
}: {
  pair: { id: string; [k: string]: any };
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const routes = useQuery({
    queryKey: ["pair-route", pair.id],
    queryFn: async () => unwrap<PairRoutes>((await api.get(`/admin/pair/${pair.id}/route`)).data),
    refetchInterval: 10_000,
  });
  const bridges = useQuery({
    queryKey: ["bridge-candidates"],
    queryFn: async () =>
      unwrap<any[]>((await api.get("/admin/pair/bridge-candidates")).data),
    staleTime: 60_000,
  });

  const [mode, setMode] = useState<RoutingMode>("AUTO");
  const [bridgeSymbolId, setBridgeSymbolId] = useState("");
  const [deviation, setDeviation] = useState("");

  // Seed the controls once the pair's stored policy arrives.
  useEffect(() => {
    if (!routes.data) return;
    setMode(routes.data.routingMode);
    setDeviation(
      routes.data.bridgeMaxDeviationPercent == null
        ? ""
        : String(routes.data.bridgeMaxDeviationPercent),
    );
  }, [routes.data?.routingMode, routes.data?.bridgeMaxDeviationPercent]);

  useEffect(() => {
    setBridgeSymbolId(pair.bridgeSymbolId ?? "");
  }, [pair.bridgeSymbolId]);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/admin/pair/${pair.id}/routing`, {
        routingMode: mode,
        bridgeSymbolId: bridgeSymbolId || null,
        bridgeMaxDeviationPercent: deviation === "" ? null : Number(deviation),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pairs"] });
      qc.invalidateQueries({ queryKey: ["pair-route", pair.id] });
      qc.invalidateQueries({ queryKey: ["pair-routes"] });
    },
  });

  const data = routes.data;
  const hint = MODE_OPTIONS.find((o) => o.value === mode)?.hint;

  return (
    <Modal wide title={`مسیر قیمت — ${data?.pairLabel ?? ""}`} onClose={onClose}>
      {routes.isLoading ? (
        <Loading />
      ) : routes.isError ? (
        <ErrorState message={apiError(routes.error)} />
      ) : data ? (
        <>
          <div className="muted" style={{ fontSize: 12, marginBottom: 14 }}>
            قیمت این جفت‌ارز می‌تواند مستقیم (از خود جفت‌ارز) یا غیرمستقیم از مسیر یک نماد واسط
            به دست آید — مثلاً XAU/IRR از حاصل‌ضرب XAU/USD و USD/IRR. نماد واسط باید یک ارز ساده
            باشد تا واحدها با هم بخوانند.
          </div>

          <div className="grid grid-3" style={{ marginBottom: 6 }}>
            <div className="field">
              <label>حالت مسیریابی</label>
              <select
                className="select"
                value={mode}
                onChange={(e) => setMode(e.target.value as RoutingMode)}
              >
                {MODE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>نماد واسط ترجیحی</label>
              <select
                className="select"
                value={bridgeSymbolId}
                onChange={(e) => setBridgeSymbolId(e.target.value)}
              >
                <option value="">— جستجوی خودکار —</option>
                {(bridges.data ?? []).map((s: any) => (
                  <option key={s.id} value={s.id}>{s.slug}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label>حداکثر اختلاف مجاز با قیمت مستقیم (٪)</label>
              <input
                className="input mono"
                dir="ltr"
                inputMode="decimal"
                placeholder="بدون محدودیت"
                value={deviation}
                onChange={(e) => setDeviation(e.target.value)}
              />
            </div>
          </div>
          {hint && <div className="muted" style={{ fontSize: 11, marginBottom: 14 }}>{hint}</div>}

          {save.isError && <div className="error-text">{apiError(save.error)}</div>}
          <div className="row" style={{ gap: 10, marginBottom: 18 }}>
            <button className="btn primary sm" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? <span className="spin" /> : "ذخیره مسیریابی"}
            </button>
            {save.isSuccess && !save.isPending && (
              <span className="muted" style={{ fontSize: 12 }}>ذخیره شد.</span>
            )}
          </div>

          <SideTable route={data.buy} title="خرید مشتری (Ask)" />
          <SideTable route={data.sell} title="فروش مشتری (Bid)" />

          <div className="muted" style={{ fontSize: 11 }}>
            آخرین بررسی: {fmtDate(new Date().toISOString())} — این نما هر ۱۰ ثانیه تازه می‌شود.
          </div>
        </>
      ) : null}
    </Modal>
  );
}
