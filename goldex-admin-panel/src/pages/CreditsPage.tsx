import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card } from "../components/ui";
import { useNotify } from "../notifications/NotifyProvider";
import type { Credit } from "../api/types";
import { STATUS_LABELS, SETTLEMENT_STATE_LABELS, RISK_STATE_LABELS } from "./credit/labels";
import { CreditKpis, type CreditStats } from "./credit/CreditKpis";
import { CreditCharts } from "./credit/CreditCharts";
import { PendingApprovals } from "./credit/PendingApprovals";
import { CreditsTable, type CreditModalKind } from "./credit/CreditsTable";
import {
  CreateCreditModal, SettleCreditModal, CancelCreditModal,
  LiquidateCreditModal, ExtendCreditModal, AdjustLimitModal,
} from "./credit/modals";
import { UserCreditsModal } from "./credit/UserCreditsModal";
import { CreditDetailModal } from "./credit/CreditDetailModal";

export default function CreditsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [settlementFilter, setSettlementFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [modal, setModal] = useState<null | "create" | CreditModalKind>(null);
  const [selected, setSelected] = useState<Credit | null>(null);
  const [exporting, setExporting] = useState(false);
  const qc = useQueryClient();
  const notify = useNotify().notify;

  const stats = useQuery({
    queryKey: ["credit-stats"],
    queryFn: async () => unwrap<CreditStats>((await api.get("/admin/credits/stats")).data),
  });

  const list = useQuery({
    queryKey: ["credits", search, statusFilter, settlementFilter, riskFilter, page],
    queryFn: async () => {
      const params: any = { page, limit: pageSize };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (settlementFilter) params.settlementState = settlementFilter;
      if (riskFilter) params.riskState = riskFilter;
      return unwrap<{ items: Credit[]; total: number; page: number; limit: number }>(
        (await api.get("/admin/credits", { params })).data
      );
    },
  });
  const data = list.data;
  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const openModal = (c: Credit, m: CreditModalKind) => { setSelected(c); setModal(m); };
  const closeModal = () => { setModal(null); setSelected(null); };

  const create = useMutation({
    mutationFn: (body: any) => api.post("/admin/credits", body),
    onSuccess: () => {
      notify({ title: "اعتبار با موفقیت ایجاد شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
      setModal(null);
    },
    onError: (e: any) => {
      notify({ title: "خطا در ایجاد اعتبار", body: apiError(e), kind: "error" });
    },
  });

  const settle = useMutation({
    mutationFn: ({ id, ...body }: any) => api.post(`/admin/credits/${id}/settle`, body),
    onSuccess: () => {
      notify({ title: "اعتبار با موفقیت تسویه شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
      closeModal();
    },
    onError: (e: any) => {
      notify({ title: "خطا در تسویه اعتبار", body: apiError(e), kind: "error" });
    },
  });

  const cancel = useMutation({
    mutationFn: ({ id, ...body }: any) => api.post(`/admin/credits/${id}/cancel`, body),
    onSuccess: () => {
      notify({ title: "اعتبار با موفقیت لغو شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
      closeModal();
    },
    onError: (e: any) => {
      notify({ title: "خطا در لغو اعتبار", body: apiError(e), kind: "error" });
    },
  });

  const liquidate = useMutation({
    mutationFn: ({ id, ...body }: any) => api.post(`/admin/credits/${id}/liquidate`, body),
    onSuccess: () => {
      notify({ title: "اعتبار با موفقیت نقد شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
      closeModal();
    },
    onError: (e: any) => {
      notify({ title: "خطا در نقد کردن اعتبار", body: apiError(e), kind: "error" });
    },
  });

  const suspend = useMutation({
    mutationFn: ({ id, reason }: any) => api.post(`/admin/credits/${id}/suspend`, { reason }),
    onSuccess: () => {
      notify({ title: "اعتبار تعلیق شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
    },
    onError: (e: any) => notify({ title: "خطا در تعلیق", body: apiError(e), kind: "error" }),
  });

  const reactivate = useMutation({
    mutationFn: ({ id, reason }: any) => api.post(`/admin/credits/${id}/reactivate`, { reason }),
    onSuccess: () => {
      notify({ title: "اعتبار رفع تعلیق شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
    },
    onError: (e: any) => notify({ title: "خطا در رفع تعلیق", body: apiError(e), kind: "error" }),
  });

  const extend = useMutation({
    mutationFn: ({ id, ...body }: any) => api.post(`/admin/credits/${id}/extend`, body),
    onSuccess: () => {
      notify({ title: "مهلت تسویه تمدید شد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
      closeModal();
    },
    onError: (e: any) => notify({ title: "خطا در تمدید", body: apiError(e), kind: "error" }),
  });

  const adjustLimit = useMutation({
    mutationFn: ({ id, ...body }: any) => api.post(`/admin/credits/${id}/adjust-limit`, body),
    onSuccess: () => {
      notify({ title: "حد اعتبار تغییر کرد", kind: "success" });
      qc.invalidateQueries({ queryKey: ["credits"] });
      qc.invalidateQueries({ queryKey: ["credit-stats"] });
      closeModal();
    },
    onError: (e: any) => notify({ title: "خطا در تغییر حد اعتبار", body: apiError(e), kind: "error" }),
  });

  // Authenticated CSV download: the shared `api` client carries the admin's
  // Bearer token and the correct /api/v1 base URL. A plain window.open() on
  // a raw path can do neither — it would both miss the v1 prefix and land on
  // the endpoint with no Authorization header, i.e. always 401.
  async function exportCsv() {
    setExporting(true);
    try {
      const params: any = {};
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (settlementFilter) params.settlementState = settlementFilter;
      if (riskFilter) params.riskState = riskFilter;
      const res = await api.get("/admin/credits/export", { params, responseType: "blob" });
      const blob = new Blob([res.data], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `credits-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      notify({ title: "خطا در خروجی CSV", body: apiError(e), kind: "error" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card
      title="مدیریت اعتبارات"
      action={
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <select className="select" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">همه وضعیت‌ها</option>
            {Object.entries(STATUS_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select className="select" value={settlementFilter} onChange={(e) => { setSettlementFilter(e.target.value); setPage(1); }}>
            <option value="">همه وضعیت تسویه</option>
            {Object.entries(SETTLEMENT_STATE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select className="select" value={riskFilter} onChange={(e) => { setRiskFilter(e.target.value); setPage(1); }}>
            <option value="">همه وضعیت ریسک</option>
            {Object.entries(RISK_STATE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input className="input" placeholder="جستجو (کد / نام / موبایل)…" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          <button className="btn ghost" disabled={exporting} onClick={exportCsv}>
            {exporting ? <><span className="spin" /> در حال آماده‌سازی…</> : "خروجی CSV"}
          </button>
          <button className="btn" onClick={() => setModal("create")}>ایجاد اعتبار</button>
        </div>
      }
    >
      {stats.data && <CreditKpis stats={stats.data} />}
      {stats.data && <CreditCharts stats={stats.data} />}

      <PendingApprovals onOpenCredit={(c) => openModal(c, "detail")} />

      <CreditsTable
        items={items}
        loading={list.isLoading}
        error={list.isError ? apiError(list.error) : null}
        onOpen={openModal}
        onSuspend={(c) => suspend.mutate({ id: c.id, reason: "suspend" })}
        onReactivate={(c) => reactivate.mutate({ id: c.id, reason: "reactivate" })}
      />

      {/* Pagination */}
      {total > 0 && (
        <div className="row" style={{ gap: 8, marginTop: 12, justifyContent: "flex-end" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>کل: {total.toLocaleString("fa-IR")}</span>
          <button className="btn sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>قبلی</button>
          <span style={{ fontSize: 12 }}>{page} / {totalPages}</span>
          <button className="btn sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>بعدی</button>
        </div>
      )}

      {modal === "create" && <CreateCreditModal onClose={() => setModal(null)} onSave={(d) => create.mutate(d)} loading={create.isPending} />}
      {modal === "settle" && selected && (
        <SettleCreditModal credit={selected} onClose={closeModal} onSave={(d) => settle.mutate({ id: selected.id, creditId: selected.id, ...d })} loading={settle.isPending} />
      )}
      {modal === "cancel" && selected && (
        <CancelCreditModal credit={selected} onClose={closeModal} onSave={(d) => cancel.mutate({ id: selected.id, creditId: selected.id, ...d })} loading={cancel.isPending} />
      )}
      {modal === "liquidate" && selected && (
        <LiquidateCreditModal credit={selected} onClose={closeModal} onSave={(d) => liquidate.mutate({ id: selected.id, creditId: selected.id, ...d })} loading={liquidate.isPending} />
      )}
      {modal === "extend" && selected && (
        <ExtendCreditModal credit={selected} onClose={closeModal} onSave={(d) => extend.mutate({ id: selected.id, creditId: selected.id, ...d })} loading={extend.isPending} />
      )}
      {modal === "adjust" && selected && (
        <AdjustLimitModal credit={selected} onClose={closeModal} onSave={(d) => adjustLimit.mutate({ id: selected.id, creditId: selected.id, ...d })} loading={adjustLimit.isPending} />
      )}
      {modal === "user" && selected && (
        <UserCreditsModal userId={selected.userId} credit={selected} onClose={closeModal} />
      )}
      {modal === "detail" && selected && (
        <CreditDetailModal credit={selected} onClose={closeModal} />
      )}
    </Card>
  );
}
