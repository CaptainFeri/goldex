import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import { fmtNum, fmtDate, symbolLabel } from "../lib/format";
import type { ManagerAccount } from "./arbitrage/bot-types";

type FundingStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

interface FundingRequest {
  id: string;
  accountId: string;
  adminId: string;
  symbolId: string;
  amount: number;
  direction: "CREDIT" | "DEBIT";
  status: FundingStatus;
  requestedByAdminId: string;
  reviewedByAdminId: string | null;
  reviewedAt: string | null;
  reason: string | null;
  reviewNote: string | null;
  createAt?: string;
  createdAt?: string;
  account?: {
    symbol?: { slug?: string; name?: string };
    admin?: { phone?: string; email?: string };
  };
}

const STATUS_LABEL: Record<FundingStatus, string> = {
  PENDING: "در انتظار تأیید",
  APPROVED: "تأیید شده",
  REJECTED: "رد شده",
  CANCELLED: "لغو شده",
};

const STATUS_KIND: Record<FundingStatus, "green" | "red" | "gold" | "gray"> = {
  PENDING: "gold",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "gray",
};

const DIRECTION_LABEL: Record<string, string> = {
  CREDIT: "شارژ حساب",
  DEBIT: "برداشت از حساب",
};

function FundingRequestModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [adminId, setAdminId] = useState("");
  const [symbolId, setSymbolId] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<"CREDIT" | "DEBIT">("CREDIT");
  const [reason, setReason] = useState("");

  const admins = useQuery({
    queryKey: ["admins-for-funding"],
    queryFn: async () => unwrap<any>((await api.get("/admin/accounts")).data),
  });
  const symbols = useQuery({
    queryKey: ["symbols-for-bot"],
    queryFn: async () => unwrap<any[]>((await api.get("/admin/symbols/active")).data),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post("/admin/manager-accounts/funding", {
        adminId,
        symbolId,
        amount: Number(amount),
        direction,
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manager-funding"] });
      qc.invalidateQueries({ queryKey: ["manager-accounts"] });
      onClose();
    },
  });

  const adminList: any[] = Array.isArray(admins.data)
    ? admins.data
    : (admins.data?.admins ?? admins.data?.items ?? []);
  const symbolList = Array.isArray(symbols.data) ? symbols.data : [];

  return (
    <Modal title="درخواست شارژ حساب مدیریتی" onClose={onClose}>
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        شارژ یا برداشت تنها با تأیید مدیر ارشد اعمال می‌شود و درخواست‌دهنده نمی‌تواند درخواست خودش را
        تأیید کند.
      </div>
      <div className="field">
        <label>مدیر</label>
        <select className="select" value={adminId} onChange={(e) => setAdminId(e.target.value)}>
          <option value="">انتخاب مدیر</option>
          {adminList.map((a: any) => (
            <option key={a.id} value={a.id}>{a.phone || a.email || a.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label>دارایی</label>
        <select className="select" value={symbolId} onChange={(e) => setSymbolId(e.target.value)}>
          <option value="">انتخاب دارایی</option>
          {symbolList.map((s: any) => (
            <option key={s.id} value={s.id}>{symbolLabel(s)}</option>
          ))}
        </select>
      </div>
      <div className="row" style={{ gap: 12 }}>
        <div className="field grow">
          <label>مبلغ</label>
          <input className="input mono" dir="ltr" type="number" step="0.0001" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>نوع</label>
          <select className="select" value={direction} onChange={(e) => setDirection(e.target.value as any)}>
            <option value="CREDIT">شارژ حساب</option>
            <option value="DEBIT">برداشت از حساب</option>
          </select>
        </div>
      </div>
      <div className="field">
        <label>توضیح</label>
        <textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
      {create.isError && <div className="error-text">{apiError(create.error)}</div>}
      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button className="btn ghost" onClick={onClose}>انصراف</button>
        <button
          className="btn primary"
          disabled={create.isPending || !adminId || !symbolId || !(Number(amount) > 0)}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <span className="spin" /> : "ثبت درخواست"}
        </button>
      </div>
    </Modal>
  );
}

function LedgerModal({ account, onClose }: { account: ManagerAccount; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["manager-ledger", account.id],
    queryFn: async () => unwrap<any>((await api.get(`/admin/manager-accounts/${account.id}/ledger`)).data),
  });
  const rows: any[] = q.data?.items ?? [];

  return (
    <Modal title={`گردش حساب ${account.symbol?.slug ?? ""}`} onClose={onClose} wide>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={apiError(q.error)} />
      ) : rows.length === 0 ? (
        <Empty label="گردشی ثبت نشده است" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>نوع</th>
                <th>تغییر موجودی آزاد</th>
                <th>تغییر فریزشده</th>
                <th>آزاد پس از</th>
                <th>فریزشده پس از</th>
                <th>شرح</th>
                <th>زمان</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.type}</td>
                  <td className="mono">{fmtNum(r.availableDelta, 4)}</td>
                  <td className="mono">{fmtNum(r.allocatedDelta, 4)}</td>
                  <td className="mono">{fmtNum(r.availableAfter, 4)}</td>
                  <td className="mono">{fmtNum(r.allocatedAfter, 4)}</td>
                  <td style={{ fontSize: 12 }}>{r.description ?? "—"}</td>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmtDate(r.createdAt ?? r.createAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

/**
 * Manager trading accounts: what each manager may put behind their arbitrage
 * bots, how much of it is already frozen into one, and the funding requests
 * waiting on a senior admin.
 */
export default function ManagerAccountsPage() {
  const qc = useQueryClient();
  const [requestOpen, setRequestOpen] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<ManagerAccount | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});

  const accounts = useQuery({
    queryKey: ["manager-accounts"],
    queryFn: async () => unwrap<ManagerAccount[]>((await api.get("/admin/manager-accounts")).data),
  });
  const funding = useQuery({
    queryKey: ["manager-funding"],
    queryFn: async () =>
      unwrap<FundingRequest[]>((await api.get("/admin/manager-accounts/funding")).data),
  });

  const review = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      api.patch(`/admin/manager-accounts/funding/${id}/review`, { approve, note: note[id] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["manager-funding"] });
      qc.invalidateQueries({ queryKey: ["manager-accounts"] });
    },
  });

  const accountList = Array.isArray(accounts.data) ? accounts.data : [];
  const fundingList = Array.isArray(funding.data) ? funding.data : [];
  const pending = fundingList.filter((f) => f.status === "PENDING");

  return (
    <>
      <Card
        title="حساب‌های مدیریتی"
        action={
          <button className="btn primary sm" onClick={() => setRequestOpen(true)}>
            + درخواست شارژ
          </button>
        }
      >
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          سرمایه‌ای که هر مدیر می‌تواند پشت ربات‌های آربیتراژ خود قرار دهد. بخش «فریزشده» در اختیار
          ربات‌هاست و تا آزادسازی قابل تخصیص مجدد یا برداشت نیست.
        </div>
        {accounts.isLoading ? (
          <Loading />
        ) : accounts.isError ? (
          <ErrorState message={apiError(accounts.error)} />
        ) : accountList.length === 0 ? (
          <Empty label="حساب مدیریتی ثبت نشده است" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>مدیر</th>
                  <th>دارایی</th>
                  <th>موجودی آزاد</th>
                  <th>فریزشده در ربات‌ها</th>
                  <th>جمع</th>
                  <th>وضعیت</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {accountList.map((a) => (
                  <tr key={a.id}>
                    <td>{a.admin?.phone || a.admin?.email || a.adminId.slice(0, 8)}</td>
                    <td>{a.symbol?.slug ?? a.symbol?.name ?? "—"}</td>
                    <td className="mono">{fmtNum(a.availableBalance, 4)}</td>
                    <td className="mono">{fmtNum(a.allocatedBalance, 4)}</td>
                    <td className="mono">{fmtNum(a.totalBalance, 4)}</td>
                    <td>
                      {a.status === "ACTIVE" ? (
                        <Badge kind="green">فعال</Badge>
                      ) : (
                        <Badge kind="red">معلق</Badge>
                      )}
                    </td>
                    <td>
                      <button className="btn ghost sm" onClick={() => setLedgerFor(a)}>گردش حساب</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card
        title="درخواست‌های شارژ"
        action={
          pending.length > 0 ? <Badge kind="gold">{pending.length} در انتظار</Badge> : null
        }
      >
        {review.isError && <div className="error-text">{apiError(review.error)}</div>}
        {funding.isLoading ? (
          <Loading />
        ) : funding.isError ? (
          <ErrorState message={apiError(funding.error)} />
        ) : fundingList.length === 0 ? (
          <Empty label="درخواستی ثبت نشده است" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>مدیر</th>
                  <th>دارایی</th>
                  <th>نوع</th>
                  <th>مبلغ</th>
                  <th>وضعیت</th>
                  <th>توضیح</th>
                  <th>تاریخ</th>
                  <th>بررسی مدیر ارشد</th>
                </tr>
              </thead>
              <tbody>
                {fundingList.map((f) => (
                  <tr key={f.id}>
                    <td>{f.account?.admin?.phone || f.account?.admin?.email || f.adminId.slice(0, 8)}</td>
                    <td>{f.account?.symbol?.slug ?? "—"}</td>
                    <td>{DIRECTION_LABEL[f.direction] ?? f.direction}</td>
                    <td className="mono">{fmtNum(f.amount, 4)}</td>
                    <td><Badge kind={STATUS_KIND[f.status]}>{STATUS_LABEL[f.status]}</Badge></td>
                    <td style={{ fontSize: 12 }}>{f.reason ?? "—"}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>{fmtDate(f.createdAt ?? f.createAt)}</td>
                    <td>
                      {f.status === "PENDING" ? (
                        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
                          <input
                            className="input"
                            style={{ maxWidth: 140 }}
                            placeholder="یادداشت"
                            value={note[f.id] ?? ""}
                            onChange={(e) => setNote({ ...note, [f.id]: e.target.value })}
                          />
                          <button
                            className="btn sm"
                            disabled={review.isPending}
                            onClick={() => review.mutate({ id: f.id, approve: true })}
                          >
                            تأیید
                          </button>
                          <button
                            className="btn sm danger"
                            disabled={review.isPending}
                            onClick={() => review.mutate({ id: f.id, approve: false })}
                          >
                            رد
                          </button>
                        </div>
                      ) : (
                        <span className="muted" style={{ fontSize: 12 }}>{f.reviewNote ?? "—"}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {requestOpen && <FundingRequestModal onClose={() => setRequestOpen(false)} />}
      {ledgerFor && <LedgerModal account={ledgerFor} onClose={() => setLedgerFor(null)} />}
    </>
  );
}
