import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Stat } from "../components/ui";
import { fmtDate } from "../lib/format";
import type {
  MarketPoolType,
  MarketStatusReason,
  MarketStatusSummary,
  MarketStatusValue,
  PairPoolStatusView,
} from "../api/types";

const POOLS: MarketPoolType[] = ["MARKET", "LIMIT", "QUOTE"];

const POOL_LABEL: Record<MarketPoolType, string> = {
  MARKET: "بازار (تأمین‌کننده)",
  LIMIT: "Limit (P2P)",
  QUOTE: "درخواست سفارش (Custom)",
};

const POOL_SHORT: Record<MarketPoolType, string> = {
  MARKET: "بازار",
  LIMIT: "Limit",
  QUOTE: "Custom",
};

const REASON_LABEL: Record<MarketStatusReason, string> = {
  "price-fresh": "قیمت تازه تأمین‌کننده",
  "stale-price": "قیمت تأمین‌کننده کهنه شده",
  "no-price": "هیچ تأمین‌کننده‌ای قیمت نداده",
  "pool-default-open": "به‌صورت پیش‌فرض باز",
  "admin-override": "تغییر اجباری توسط ادمین",
};

type StatusFilter = "all" | "open" | "closed" | "overridden";

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "همه وضعیت‌ها" },
  { key: "open", label: "دارای استخر باز" },
  { key: "closed", label: "دارای استخر بسته" },
  { key: "overridden", label: "دارای تغییر اجباری" },
];

const CLOSE_WARNING =
  "بستن اجباری این استخر، تمام سفارش‌های معلق و نیمه‌انجام همان جفت‌ارز را لغو می‌کند و موجودی قفل‌شده کاربران آزاد می‌شود.";

function StatusBadge({ s }: { s: MarketStatusValue }) {
  return s === "OPEN" ? <Badge kind="green">باز</Badge> : <Badge kind="red">بسته</Badge>;
}

/** One pair's three pools, grouped for the collapsed row. */
interface PairGroup {
  pairId: string;
  pairLabel: string;
  isValid: boolean;
  lastPriceAt: string | null;
  pools: Partial<Record<MarketPoolType, PairPoolStatusView>>;
  hasOpen: boolean;
  hasClosed: boolean;
  hasOverride: boolean;
}

function useOverrideMutation(onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ pairId, poolType, value }: { pairId: string; poolType: MarketPoolType | "ALL"; value: string }) =>
      api.patch(
        poolType === "ALL"
          ? `/admin/market-status/pairs/${pairId}/override`
          : `/admin/market-status/pairs/${pairId}/${poolType}/override`,
        { status: value === "" ? "null" : value },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["market-status"] });
      qc.invalidateQueries({ queryKey: ["market-status-summary"] });
      onDone();
    },
  });
}

function PoolControls({ group }: { group: PairGroup }) {
  const [error, setError] = useState<string | null>(null);
  const apply = useOverrideMutation(() => setError(null));

  function change(poolType: MarketPoolType | "ALL", value: string) {
    if (value === "CLOSED" && !window.confirm(CLOSE_WARNING)) return;
    setError(null);
    apply.mutate(
      { pairId: group.pairId, poolType, value },
      { onError: (e) => setError(apiError(e)) },
    );
  }

  return (
    <div style={{ padding: "4px 0 10px" }}>
      <div className="table-wrap" style={{ marginBottom: 10 }}>
        <table>
          <thead>
            <tr>
              <th>استخر</th>
              <th>وضعیت خودکار</th>
              <th>تغییر اجباری</th>
              <th>وضعیت مؤثر</th>
              <th>دلیل</th>
              <th>آخرین تغییر</th>
              <th>مدیریت</th>
            </tr>
          </thead>
          <tbody>
            {POOLS.map((pool) => {
              const s = group.pools[pool];
              if (!s) return null;
              return (
                <tr key={pool}>
                  <td>{POOL_LABEL[pool]}</td>
                  <td><StatusBadge s={s.derivedStatus} /></td>
                  <td>
                    {s.adminOverride ? <StatusBadge s={s.adminOverride} /> : <span className="muted">—</span>}
                  </td>
                  <td><StatusBadge s={s.effectiveStatus} /></td>
                  <td style={{ fontSize: 12 }}>{REASON_LABEL[s.reason] ?? s.reason}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {s.persisted ? fmtDate(s.updatedAt) : <span className="muted">هنوز ثبت نشده</span>}
                  </td>
                  <td>
                    <select
                      className="select"
                      style={{ minWidth: 130 }}
                      disabled={apply.isPending}
                      value={s.adminOverride ?? ""}
                      onChange={(e) => change(pool, e.target.value)}
                    >
                      <option value="">خودکار</option>
                      <option value="OPEN">باز (اجباری)</option>
                      <option value="CLOSED">بسته (اجباری)</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="row" style={{ gap: 10, flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 12 }}>اعمال روی همه استخرها:</span>
        <button className="btn sm danger" disabled={apply.isPending} onClick={() => change("ALL", "CLOSED")}>
          بستن کل جفت‌ارز
        </button>
        <button className="btn sm" disabled={apply.isPending} onClick={() => change("ALL", "OPEN")}>
          باز کردن اجباری
        </button>
        <button className="btn sm ghost" disabled={apply.isPending} onClick={() => change("ALL", "")}>
          بازگشت به خودکار
        </button>
        {apply.isPending && <span className="spin" />}
      </div>

      {error && <div className="error-text">{error}</div>}
      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>{CLOSE_WARNING}</div>
    </div>
  );
}

export default function MarketStatusPage() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [poolFilter, setPoolFilter] = useState<MarketPoolType | "">("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const statuses = useQuery({
    queryKey: ["market-status"],
    queryFn: async () => unwrap<PairPoolStatusView[]>((await api.get("/admin/market-status")).data),
  });
  const summaryQ = useQuery({
    queryKey: ["market-status-summary"],
    queryFn: async () =>
      unwrap<MarketStatusSummary>((await api.get("/admin/market-status/summary")).data),
  });

  const groups = useMemo<PairGroup[]>(() => {
    const rows = Array.isArray(statuses.data) ? statuses.data : [];
    const byPair = new Map<string, PairGroup>();

    for (const row of rows) {
      let g = byPair.get(row.pairId);
      if (!g) {
        g = {
          pairId: row.pairId,
          pairLabel: row.pairLabel,
          isValid: row.isValid,
          lastPriceAt: row.lastPriceAt,
          pools: {},
          hasOpen: false,
          hasClosed: false,
          hasOverride: false,
        };
        byPair.set(row.pairId, g);
      }
      g.pools[row.poolType] = row;
      if (row.effectiveStatus === "OPEN") g.hasOpen = true;
      if (row.effectiveStatus === "CLOSED") g.hasClosed = true;
      if (row.adminOverride) g.hasOverride = true;
    }

    return [...byPair.values()].sort((a, b) => a.pairLabel.localeCompare(b.pairLabel));
  }, [statuses.data]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return groups.filter((g) => {
      if (term && !g.pairLabel.toLowerCase().includes(term)) return false;

      // With a pool selected, the status filter applies to that pool alone.
      if (poolFilter) {
        const s = g.pools[poolFilter];
        if (!s) return false;
        if (statusFilter === "open") return s.effectiveStatus === "OPEN";
        if (statusFilter === "closed") return s.effectiveStatus === "CLOSED";
        if (statusFilter === "overridden") return s.adminOverride != null;
        return true;
      }

      if (statusFilter === "open") return g.hasOpen;
      if (statusFilter === "closed") return g.hasClosed;
      if (statusFilter === "overridden") return g.hasOverride;
      return true;
    });
  }, [groups, search, poolFilter, statusFilter]);

  const summary = summaryQ.data;

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="grid grid-4">
        <Stat
          label="جفت‌ارز با استخر باز"
          value={`${summary?.openPairs ?? 0} / ${summary?.totalPairs ?? 0}`}
        />
        <Stat label="کاملاً بسته" value={summary?.fullyClosedPairs ?? 0} sub="هر سه استخر بسته" />
        <Stat label="تغییر اجباری فعال" value={summary?.overriddenPools ?? 0} sub="روی استخرها" />
        <Stat
          label="قیمت کهنه"
          value={summary?.stalePricePairs ?? 0}
          sub="استخر بازار به دلیل کهنگی بسته"
        />
      </div>

      <Card
        title="وضعیت بازار هر جفت‌ارز"
        action={
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <input
              className="input"
              style={{ maxWidth: 150 }}
              placeholder="جستجوی جفت‌ارز…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="select"
              style={{ minWidth: 150 }}
              value={poolFilter}
              onChange={(e) => setPoolFilter(e.target.value as MarketPoolType | "")}
            >
              <option value="">همه استخرها</option>
              {POOLS.map((p) => (
                <option key={p} value={p}>{POOL_LABEL[p]}</option>
              ))}
            </select>
            <select
              className="select"
              style={{ minWidth: 160 }}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              {STATUS_FILTERS.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
          </div>
        }
      >
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          وضعیت استخر «بازار» به‌صورت خودکار از حضور قیمت تازه تأمین‌کنندگان استخراج می‌شود؛
          استخرهای Limit و Custom به‌صورت پیش‌فرض بازند. برای تغییر وضعیت، روی سطر جفت‌ارز کلیک کنید.
        </div>

        {statuses.isLoading ? (
          <Loading />
        ) : statuses.isError ? (
          <ErrorState message={apiError(statuses.error)} />
        ) : visible.length === 0 ? (
          <Empty label={groups.length === 0 ? undefined : "جفت‌ارزی با این فیلترها نیست."} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 32 }} />
                  <th>جفت‌ارز</th>
                  <th>جفت‌ارز فعال</th>
                  {POOLS.map((p) => (
                    <th key={p}>{POOL_SHORT[p]}</th>
                  ))}
                  <th>آخرین قیمت</th>
                  <th>تغییر اجباری</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((g) => {
                  const open = expanded === g.pairId;
                  return [
                    <tr
                      key={g.pairId}
                      onClick={() => setExpanded(open ? null : g.pairId)}
                      style={{ cursor: "pointer", background: open ? "var(--bg-elev-2)" : undefined }}
                    >
                      <td className="muted">{open ? "▾" : "▸"}</td>
                      <td><b className="mono">{g.pairLabel}</b></td>
                      <td>
                        {g.isValid ? <Badge kind="green">فعال</Badge> : <Badge kind="gray">غیرفعال</Badge>}
                      </td>
                      {POOLS.map((p) => {
                        const s = g.pools[p];
                        return (
                          <td key={p}>
                            {s ? <StatusBadge s={s.effectiveStatus} /> : <span className="muted">—</span>}
                          </td>
                        );
                      })}
                      <td className="mono" style={{ fontSize: 12 }}>{fmtDate(g.lastPriceAt)}</td>
                      <td>
                        {g.hasOverride ? <Badge kind="gold">دارد</Badge> : <span className="muted">—</span>}
                      </td>
                    </tr>,
                    open ? (
                      <tr key={`${g.pairId}-detail`}>
                        {/* chevron + pair + valid + pools + last price + override */}
                        <td colSpan={5 + POOLS.length} style={{ whiteSpace: "normal" }}>
                          <PoolControls group={g} />
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
