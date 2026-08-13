import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { pairLabel } from "../lib/format";
import type { PricePair } from "../api/types";

type PoolType = "MARKET" | "LIMIT" | "QUOTE";
type Status = "OPEN" | "CLOSED";

interface PoolStatus {
  pairId: string;
  poolType: PoolType;
  derivedStatus: Status;
  adminOverride: Status | null;
  effectiveStatus: Status;
  reason?: string;
}

const POOL_LABEL: Record<PoolType, string> = {
  MARKET: "بازار (تأمین‌کننده)",
  LIMIT: "Limit (P2P)",
  QUOTE: "درخواست سفارش (Custom)",
};

function StatusBadge({ s }: { s: Status }) {
  return s === "OPEN" ? <Badge kind="green">باز</Badge> : <Badge kind="red">بسته</Badge>;
}

function PoolRow({
  pair,
  status,
}: {
  pair: PricePair;
  status?: PoolStatus;
}) {
  const qc = useQueryClient();
  const [override, setOverride] = useState<string>(status?.adminOverride ?? "");

  const apply = useMutation({
    mutationFn: (value: string) =>
      api.patch(`/admin/market-status/pairs/${pair.id}/${status?.poolType ?? "MARKET"}/override`, {
        status: value,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["market-status"] }),
  });

  if (!status) return null;

  return (
    <tr>
      <td>{pairLabel(pair)}</td>
      <td>{POOL_LABEL[status.poolType]}</td>
      <td><StatusBadge s={status.derivedStatus} /></td>
      <td>{status.adminOverride ? <StatusBadge s={status.adminOverride} /> : <span className="muted">—</span>}</td>
      <td><StatusBadge s={status.effectiveStatus} /></td>
      <td>
        <div className="row" style={{ gap: 8 }}>
          <select
            className="select"
            style={{ minWidth: 100 }}
            value={override}
            onChange={(e) => setOverride(e.target.value)}
          >
            <option value="">خودکار</option>
            <option value="OPEN">باز (اجباری)</option>
            <option value="CLOSED">بسته (اجباری)</option>
          </select>
          <button
            className="btn sm"
            disabled={apply.isPending}
            onClick={() => override !== (status.adminOverride ?? "") && apply.mutate(override)}
          >
            {apply.isPending ? <span className="spin" /> : "اعمال"}
          </button>
          {status.effectiveStatus === "CLOSED" && (
            <span className="muted" style={{ fontSize: 11 }}>
              بستن بازار، سفارش‌های معلق/نیمه‌انجام را می‌بندد و موجودی قفل‌شده آزاد می‌شود.
            </span>
          )}
        </div>
      </td>
    </tr>
  );
}

export default function MarketStatusPage() {
  const [onlyClosed, setOnlyClosed] = useState(false);

  const pairs = useQuery({
    queryKey: ["pairs"],
    queryFn: async () => unwrap<PricePair[]>((await api.get("/admin/pair")).data),
  });
  const statuses = useQuery({
    queryKey: ["market-status"],
    queryFn: async () => unwrap<PoolStatus[]>((await api.get("/admin/market-status")).data),
  });

  const statusMap = useMemo(() => {
    const m = new Map<string, PoolStatus>();
    for (const s of statuses.data ?? []) m.set(`${s.pairId}::${s.poolType}`, s);
    return m;
  }, [statuses.data]);

  const rows = useMemo(() => {
    const all: { pair: PricePair; pool: PoolType; status?: PoolStatus }[] = [];
    for (const p of pairs.data ?? []) {
      for (const pool of ["MARKET", "LIMIT", "QUOTE"] as PoolType[]) {
        all.push({ pair: p, pool, status: statusMap.get(`${p.id}::${pool}`) });
      }
    }
    return onlyClosed ? all.filter((r) => r.status?.effectiveStatus === "CLOSED") : all;
  }, [pairs.data, statusMap, onlyClosed]);

  return (
    <>
      <Card
        title="وضعیت بازار هر استخر (Trade Pool)"
        action={
          <label className="row" style={{ gap: 6 }}>
            <input type="checkbox" checked={onlyClosed} onChange={(e) => setOnlyClosed(e.target.checked)} />
            فقط بازارهای بسته
          </label>
        }
      >
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          وضعیت استخر MARKET به‌صورت خودکار از حضور قیمت تازه تأمین‌کنندگان استخراج می‌شود؛ استخرهای LIMIT و QUOTE
          به‌صورت پیش‌فرض بازند. با اعمال وضعیت اجباری «بسته»، تمام سفارش‌های معلق و نیمه‌انجام همان جفت‌ارز بسته و
          موجودی قفل‌شده کیف‌پول کاربران آزاد می‌شود.
        </div>
        {pairs.isLoading || statuses.isLoading ? (
          <Loading />
        ) : pairs.isError || statuses.isError ? (
          <ErrorState message={pairs.isError ? apiError(pairs.error) : apiError(statuses.error)} />
        ) : rows.length === 0 ? (
          <Empty />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>جفت‌ارز</th>
                  <th>استخر</th>
                  <th>وضعیت خودکار</th>
                  <th>تغییر اجباری</th>
                  <th>وضعیت موثر</th>
                  <th>مدیریت</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <PoolRow key={`${r.pair.id}::${r.pool}`} pair={r.pair} status={r.status} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
