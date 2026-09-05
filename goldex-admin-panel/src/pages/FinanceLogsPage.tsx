import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Badge, Loading, ErrorState, Empty } from "../components/ui";
import type { FinanceLog, FinanceAction } from "../api/types";

const ACTION_LABELS: Record<string, string> = {
  CREDIT_CREATED: "ایجاد اعتبار",
  CREDIT_ACTIVATED: "فعال‌سازی اعتبار",
  CREDIT_SETTLED: "تسویه اعتبار",
  CREDIT_EXPIRED: "انقضای اعتبار",
  CREDIT_CANCELLED: "لغو اعتبار",
  WALLET_FROZEN: "مسدودسازی کیف‌پول",
  WALLET_UNFROZEN: "رفع مسدودیت کیف‌پول",
  BALANCE_INCREASED: "افزایش موجودی",
  BALANCE_FROZEN_FOR_CREDIT: "مسدود موجودی برای اعتبار",
  BALANCE_UNFROZEN_FOR_CREDIT: "رفع مسدود موجودی اعتبار",
  MATERIAL_FREEZE: "مسدودسازی موجودی کالا",
  LIQUIDATION: "نقد کردن موقعیت",
  ORDER_CANCELLED_MARGIN: "لغو سفارش (حاشیه)",
  EXPIRY_FREEZE_ALL: "مسدود کلی (انقضا)",
  USER_STATUS_CHANGED: "تغییر وضعیت کاربر",
  ALL_WALLETS_FROZEN: "مسدود همه کیف‌پول‌ها",
  REMINDER_SENT: "ارسال یادآوری",
};

const ACTION_KINDS: Record<string, string> = {
  CREDIT_CREATED: "green",
  CREDIT_SETTLED: "blue",
  CREDIT_EXPIRED: "gray",
  CREDIT_CANCELLED: "red",
  WALLET_FROZEN: "gold",
  WALLET_UNFROZEN: "green",
  LIQUIDATION: "red",
  EXPIRY_FREEZE_ALL: "red",
  REMINDER_SENT: "gold",
};

const fmtDate = (d: string) => new Date(d).toLocaleDateString("fa-IR", {
  year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
});

const fmtDateInput = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

export default function FinanceLogsPage() {
  const today = new Date();
  const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [startDate, setStartDate] = useState(fmtDateInput(weekAgo));
  const [endDate, setEndDate] = useState(fmtDateInput(today));
  const [actionFilter, setActionFilter] = useState("");

  const logs = useQuery({
    queryKey: ["finance-logs", startDate, endDate, actionFilter],
    queryFn: async () => {
      const params: any = { startDate, endDate: `${endDate}T23:59:59` };
      if (actionFilter) params.actionType = actionFilter;
      return unwrap<FinanceLog[]>((await api.get("/admin/finance-logs", { params })).data);
    },
  });

  const handleExport = async () => {
    const params = { startDate, endDate: `${endDate}T23:59:59`, format: "excel" };
    if (actionFilter) (params as any).actionType = actionFilter;
    try {
      const res = await api.get("/admin/finance-logs/export", { params, responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `finance-logs-${new Date().toISOString().split("T")[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (_) {
      /* silently fail — the logs table still works */
    }
  };

  return (
    <Card
      title="گزارشات مالی"
      action={
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input type="date" className="input" style={{ width: 140 }} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          <span>تا</span>
          <input type="date" className="input" style={{ width: 140 }} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          <select className="select" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="">همه اقدامات</option>
            {Object.entries(ACTION_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <button className="btn" onClick={handleExport}>خروجی Excel</button>
        </div>
      }
    >
      {logs.isLoading ? <Loading /> : logs.isError ? <ErrorState message={apiError(logs.error)} /> :
      !logs.data?.length ? <Empty label="هیچ گزارشی یافت نشد" /> : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>زمان</th>
                <th>نوع اقدام</th>
                <th>مدیر</th>
                <th>کاربر</th>
                <th>شناسه اعتبار</th>
                <th>توضیحات</th>
              </tr>
            </thead>
            <tbody>
              {(logs.data as FinanceLog[]).map((l) => (
                <tr key={l.id}>
                  <td>{fmtDate(l.actionTime)}</td>
                  <td>
                    <Badge kind={(ACTION_KINDS[l.actionType] ?? "gray") as "green" | "red" | "gold" | "gray"}>
                      {ACTION_LABELS[l.actionType] ?? l.actionType}
                    </Badge>
                  </td>
                  <td>{l.admin?.phone ?? l.admin?.email ?? l.adminId ?? "سیستم"}</td>
                  <td style={{ direction: "ltr", textAlign: "right" }}>{l.userId ? l.userId.slice(0, 8) + "…" : "—"}</td>
                  <td>{l.creditId ? l.creditId.slice(0, 8) + "…" : "—"}</td>
                  <td style={{ maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {l.description || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
