import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import { fmtNum, fmtDate, symbolLabel } from "../lib/format";

function toArray(x: any): any[] {
  if (Array.isArray(x)) return x;
  if (x && Array.isArray(x.data)) return x.data;
  if (x && Array.isArray(x.items)) return x.items;
  if (x && Array.isArray(x.wallets)) return x.wallets;
  return [];
}
const num = (...v: any[]) => {
  for (const x of v) if (x !== undefined && x !== null) return Number(x) || 0;
  return 0;
};
const short = (id: string) => (id ? id.slice(0, 8) + "…" : "—");

function TxModal({ walletId, onClose }: { walletId: string; onClose: () => void }) {
  const details = useQuery({
    queryKey: ["wallet-detail", walletId],
    queryFn: async () => unwrap<any>((await api.get(`/admin/wallets/${walletId}`)).data),
  });
  const txns: any[] = details.data?.recentTransactions ?? [];
  const stats = details.data?.stats ?? {};

  return (
    <Modal wide title="تراکنش‌های کیف‌پول" onClose={onClose}>
      {details.isLoading ? (
        <Loading />
      ) : details.isError ? (
        <ErrorState message={apiError(details.error)} />
      ) : (
        <>
          <div className="kv" style={{ marginBottom: 16 }}>
            <span className="k">موجودی کل</span>
            <span className="mono">{fmtNum(stats.totalBalance, 6)}</span>
            <span className="k">قابل برداشت</span>
            <span className="mono">{fmtNum(stats.availableBalance, 6)}</span>
          </div>
          {txns.length === 0 ? (
            <Empty label="تراکنشی ثبت نشده" />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>نوع</th>
                    <th>مبلغ</th>
                    <th>وضعیت</th>
                    <th>توضیحات</th>
                    <th>تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {txns.map((t) => (
                    <tr key={t.id}>
                      <td>{t.transactionType ?? "—"}</td>
                      <td className="mono" style={{ color: num(t.amount) < 0 ? "var(--red)" : "var(--green)" }}>
                        {fmtNum(t.amount, 6)}
                      </td>
                      <td>{t.status ?? "—"}</td>
                      <td className="muted" style={{ maxWidth: 220, whiteSpace: "normal" }}>{t.description ?? "—"}</td>
                      <td>{fmtDate(t.createAt ?? t.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

export default function WalletsPage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [txWallet, setTxWallet] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["wallets"],
    queryFn: async () => unwrap<any>((await api.get("/admin/wallets/all-wallets")).data),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["wallets"] });
  // Increase/decrease via update-balance: CREDIT pairs with DEPOSIT, DEBIT with WITHDRAWAL.
  const adjust = useMutation({
    mutationFn: (p: { walletId: string; actionType: "CREDIT" | "DEBIT"; amount: number; description?: string }) =>
      api.post("/admin/wallets/update-balance", {
        walletId: p.walletId,
        actionType: p.actionType,
        transactionType: p.actionType === "CREDIT" ? "DEPOSIT" : "WITHDRAWAL",
        amount: p.amount,
        description: p.description,
      }),
    onSuccess: invalidate,
  });
  // Freeze/unfreeze via wallet status.
  const setStatus = useMutation({
    mutationFn: (p: { walletId: string; status: string; note?: string }) =>
      api.post("/admin/wallets/update-status", p),
    onSuccess: invalidate,
  });

  let wallets = toArray(list.data);
  if (q) {
    const s = q.toLowerCase();
    wallets = wallets.filter((w) => JSON.stringify(w).toLowerCase().includes(s));
  }

  function onAdjust(walletId: string, increase: boolean) {
    const raw = window.prompt(`${increase ? "افزایش" : "کاهش"} موجودی — مقدار:`);
    if (raw === null) return;
    const amount = Number(raw);
    if (Number.isNaN(amount) || amount <= 0) return;
    const description = window.prompt("توضیحات:") || undefined;
    adjust.mutate({ walletId, actionType: increase ? "CREDIT" : "DEBIT", amount, description });
  }

  function isFrozen(w: any) {
    return w.status && w.status !== "ACTIVE";
  }

  return (
    <Card
      title="کیف‌پول‌های کاربران"
      action={
        <input className="input" style={{ width: 220 }} placeholder="جستجو…" value={q} onChange={(e) => setQ(e.target.value)} />
      }
    >
      {(adjust.isError || setStatus.isError) && <div className="error-text">{apiError(adjust.error || setStatus.error)}</div>}
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={apiError(list.error)} />
      ) : wallets.length === 0 ? (
        <Empty />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کاربر</th>
                <th>دارایی</th>
                <th>موجودی آزاد</th>
                <th>قفل‌شده</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {wallets.map((w) => {
                const frozen = isFrozen(w);
                return (
                  <tr key={w.id}>
                    <td title={w.id}>
                      {w.user ? `${w.user.firstName ?? ""} ${w.user.lastName ?? ""}`.trim() || short(w.userId) : short(w.userId)}
                    </td>
                    <td>
                      <Badge kind="gold">{symbolLabel(w.symbol)}</Badge>
                    </td>
                    <td className="mono">{fmtNum(num(w.freeBalance, w.free), 6)}</td>
                    <td className="mono">{fmtNum(num(w.lockedBalance, w.locked), 6)}</td>
                    <td>{frozen ? <Badge kind="red">{w.status}</Badge> : <Badge kind="green">فعال</Badge>}</td>
                    <td>
                      <div className="row">
                        <button className="btn sm" onClick={() => setTxWallet(w.id)}>
                          تراکنش‌ها
                        </button>
                        <button className="btn sm" disabled={adjust.isPending} onClick={() => onAdjust(w.id, true)}>
                          افزایش
                        </button>
                        <button className="btn sm" disabled={adjust.isPending} onClick={() => onAdjust(w.id, false)}>
                          کاهش
                        </button>
                        <button
                          className={"btn sm " + (frozen ? "" : "danger")}
                          disabled={setStatus.isPending}
                          onClick={() =>
                            setStatus.mutate({ walletId: w.id, status: frozen ? "ACTIVE" : "FROZEN" })
                          }
                        >
                          {frozen ? "رفع فریز" : "فریز"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {txWallet && <TxModal walletId={txWallet} onClose={() => setTxWallet(null)} />}
    </Card>
  );
}
