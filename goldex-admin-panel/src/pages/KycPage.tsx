import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import { fmtDate } from "../lib/format";

const LEVELS: Record<number, string> = { 0: "بدون احراز", 1: "سطح ۱", 2: "سطح ۲", 3: "سطح ۳", 4: "کامل" };
function levelBadge(l: number) {
  return <Badge kind={l >= 4 ? "green" : l > 0 ? "gold" : "gray"}>{LEVELS[l] ?? `سطح ${l}`}</Badge>;
}
function statusBadge(s: number) {
  if (s === 1) return <Badge kind="green">تأیید شده</Badge>;
  if (s === 2) return <Badge kind="red">رد شده</Badge>;
  return <Badge kind="gold">در انتظار</Badge>;
}
function docStatusBadge(s: any) {
  const v = String(s ?? "").toLowerCase();
  if (v.includes("approv") || v === "1") return <Badge kind="green">تأیید</Badge>;
  if (v.includes("reject") || v === "2") return <Badge kind="red">رد</Badge>;
  return <Badge kind="gold">در انتظار</Badge>;
}

interface KycUser {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  nationalId?: string | null;
  kycLevel: number;
  kycStatus: number;
  createdAt?: string;
}

function DetailsModal({ user, onClose }: { user: KycUser; onClose: () => void }) {
  const qc = useQueryClient();
  const profile = useQuery({
    queryKey: ["kyc-user", user.id],
    queryFn: async () => unwrap<any>((await api.get(`/admin/users/users/${user.id}`)).data),
  });
  const docs = useQuery({
    queryKey: ["kyc-docs", user.id],
    queryFn: async () => unwrap<any>((await api.get(`/admin/kyc/users/${user.id}/documents`)).data),
  });

  const approve = useMutation({
    mutationFn: (documentId: string) => api.post("/admin/kyc/admin/approve", { documentIds: [documentId] }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kyc-docs", user.id] });
      qc.invalidateQueries({ queryKey: ["kyc-users"] });
    },
  });
  const reject = useMutation({
    mutationFn: (p: { documentId: string; reason: string }) => api.post("/admin/kyc/admin/reject", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["kyc-docs", user.id] });
      qc.invalidateQueries({ queryKey: ["kyc-users"] });
    },
  });

  const docList: any[] = Array.isArray(docs.data) ? docs.data : docs.data?.items ?? [];
  const p = profile.data ?? {};

  return (
    <Modal wide title={`جزئیات کاربر — ${user.firstName ?? ""} ${user.lastName ?? ""}`} onClose={onClose}>
      <div className="kv" style={{ marginBottom: 18 }}>
        <span className="k">نام</span>
        <span>{`${p.firstname ?? user.firstName ?? "—"} ${p.lastname ?? user.lastName ?? ""}`}</span>
        <span className="k">موبایل</span>
        <span className="mono" dir="ltr">{p.cellPhone ?? user.phone ?? "—"}</span>
        <span className="k">ایمیل</span>
        <span className="mono">{p.email ?? user.email ?? "—"}</span>
        <span className="k">کد ملی</span>
        <span className="mono">{user.nationalId ?? "—"}</span>
        <span className="k">سطح احراز</span>
        <span>{levelBadge(user.kycLevel)}</span>
        <span className="k">وضعیت</span>
        <span>{statusBadge(user.kycStatus)}</span>
        <span className="k">کشور</span>
        <span>{p.country?.primaryName ?? "—"}</span>
        <span className="k">آدرس</span>
        <span>{p.address ?? "—"}</span>
      </div>

      <div className="card-title">مدارک</div>
      {(approve.isError || reject.isError) && <div className="error-text">{apiError(approve.error || reject.error)}</div>}
      {docs.isLoading ? (
        <Loading />
      ) : docList.length === 0 ? (
        <Empty label="مدرکی بارگذاری نشده" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>نوع</th>
                <th>وضعیت</th>
                <th>تاریخ</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {docList.map((d) => (
                <tr key={d.id}>
                  <td>{d.documentType ?? d.type ?? d.kind ?? "—"}</td>
                  <td>{docStatusBadge(d.status ?? d.documentStatus)}</td>
                  <td>{fmtDate(d.createAt ?? d.createdAt)}</td>
                  <td>
                    <div className="row">
                      <button className="btn sm primary" disabled={approve.isPending} onClick={() => approve.mutate(d.id)}>
                        تأیید
                      </button>
                      <button
                        className="btn sm danger"
                        disabled={reject.isPending}
                        onClick={() => {
                          const reason = window.prompt("دلیل رد:");
                          if (reason) reject.mutate({ documentId: d.id, reason });
                        }}
                      >
                        رد
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function KycPage() {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<KycUser | null>(null);

  const list = useQuery({
    queryKey: ["kyc-users", search],
    queryFn: async () =>
      unwrap<{ items: KycUser[]; total: number }>(
        (await api.get("/admin/kyc/admin/users", { params: { pageSize: 100, searchKey: search || undefined } })).data
      ),
  });

  const users = list.data?.items ?? [];

  return (
    <Card
      title={`کاربران و سطح احراز هویت${list.data ? ` (${list.data.total})` : ""}`}
      action={
        <input
          className="input"
          style={{ width: 220 }}
          placeholder="جستجو (نام/موبایل)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      }
    >
      {list.isLoading ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState message={apiError(list.error)} />
      ) : users.length === 0 ? (
        <Empty label="کاربری یافت نشد" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>نام</th>
                <th>موبایل</th>
                <th>کد ملی</th>
                <th>سطح احراز</th>
                <th>وضعیت</th>
                <th>تاریخ عضویت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "—"}</td>
                  <td className="mono" dir="ltr" style={{ textAlign: "right" }}>{u.phone ?? "—"}</td>
                  <td className="mono">{u.nationalId ?? "—"}</td>
                  <td>{levelBadge(u.kycLevel)}</td>
                  <td>{statusBadge(u.kycStatus)}</td>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td>
                    <button className="btn sm" onClick={() => setSelected(u)}>
                      جزئیات
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <DetailsModal user={selected} onClose={() => setSelected(null)} />}
    </Card>
  );
}
