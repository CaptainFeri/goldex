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

const TABS = [
  { key: "users", label: "کاربران" },
  { key: "pending", label: "صف مدارک در انتظار" },
  { key: "all", label: "همه مدارک" },
];

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

interface KycDocument {
  id: string;
  userId?: string;
  user?: { firstName?: string; lastName?: string; phone?: string; email?: string };
  documentType?: string;
  type?: string;
  kind?: string;
  status?: any;
  documentStatus?: any;
  imageUrl?: string;
  fileUrl?: string;
  picture?: string;
  createAt?: string;
  createdAt?: string;
  [k: string]: any;
}

function docObjectName(fileUrl: string | undefined): string {
  if (!fileUrl) return "";
  if (fileUrl.startsWith("http")) {
    try { return decodeURIComponent(fileUrl.split("/").pop()!); }
    catch { return fileUrl.split("/").pop()!; }
  }
  return fileUrl;
}

function DocPreview({ doc }: { doc: KycDocument }) {
  const raw = doc.imageUrl ?? doc.fileUrl ?? doc.picture;
  const objectName = docObjectName(raw);
  if (!objectName) return <span className="muted">—</span>;
  const proxyUrl = `/api/v1/admin/kyc/document/${encodeURIComponent(objectName)}`;
  return (
    <a href={proxyUrl} target="_blank" rel="noreferrer" className="btn sm ghost">
      مشاهده تصویر
    </a>
  );
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

  const docList: KycDocument[] = Array.isArray(docs.data) ? docs.data : docs.data?.items ?? [];
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
                      <DocPreview doc={d} />
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

function DocQueue({ mode, onClose }: { mode: "pending" | "all"; onClose: () => void }) {
  const qc = useQueryClient();
  const docs = useQuery({
    queryKey: ["kyc-docs-queue", mode],
    queryFn: async () => {
      const url = mode === "pending" ? "/admin/kyc/admin/pending" : "/admin/kyc/admin/all";
      return unwrap<any>((await api.get(url)).data);
    },
  });
  const list: KycDocument[] = Array.isArray(docs.data) ? docs.data : docs.data?.items ?? [];

  const approve = useMutation({
    mutationFn: (documentId: string) => api.post("/admin/kyc/admin/approve", { documentIds: [documentId] }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kyc-docs-queue", mode] }),
  });
  const reject = useMutation({
    mutationFn: (p: { documentId: string; reason: string }) => api.post("/admin/kyc/admin/reject", p),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["kyc-docs-queue", mode] }),
  });

  const title = mode === "pending" ? "صف مدارک در انتظار بررسی" : "همه مدارک";

  return (
    <Modal wide title={title} onClose={onClose}>
      {docs.isLoading ? (
        <Loading />
      ) : docs.isError ? (
        <ErrorState message={apiError(docs.error)} />
      ) : list.length === 0 ? (
        <Empty label="مدرکی موجود نیست" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>کاربر</th>
                <th>نوع مدرک</th>
                <th>وضعیت</th>
                <th>تاریخ</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td>
                    {d.user
                      ? `${d.user.firstName ?? ""} ${d.user.lastName ?? ""}`.trim() || d.userId?.slice(0, 8)
                      : d.userId?.slice(0, 8) ?? "—"}
                    {d.user?.phone && <div className="muted mono" style={{ fontSize: 11 }} dir="ltr">{d.user.phone}</div>}
                  </td>
                  <td>{d.documentType ?? d.type ?? d.kind ?? "—"}</td>
                  <td>{docStatusBadge(d.status ?? d.documentStatus)}</td>
                  <td>{fmtDate(d.createAt ?? d.createdAt)}</td>
                  <td>
                    <div className="row">
                      <DocPreview doc={d} />
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
  const [statusFilter, setStatusFilter] = useState("");
  const [selected, setSelected] = useState<KycUser | null>(null);
  const [tab, setTab] = useState<"users" | "pending" | "all">("users");
  const [queueMode, setQueueMode] = useState<"pending" | "all" | null>(null);

  const list = useQuery({
    queryKey: ["kyc-users", search, statusFilter],
    queryFn: async () => {
      const params: any = { pageSize: 100 };
      if (search) params.searchKey = search;
      return unwrap<{ items: KycUser[]; total: number }>(
        (await api.get("/admin/kyc/admin/users", { params })).data
      );
    },
  });

  const users = (list.data?.items ?? []).filter((u) =>
    statusFilter === "" ? true : String(u.kycStatus) === statusFilter
  );
  const total = statusFilter === "" ? list.data?.total ?? 0 : users.length;

  return (
    <Card
      title={
        <div className="toolbar">
          {TABS.map((t) => (
            <button
              key={t.key}
              className={"btn sm " + (tab === t.key ? "primary" : "ghost")}
              onClick={() => {
                setTab(t.key as any);
                if (t.key !== "users") setQueueMode(t.key as any);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      }
      action={
        tab === "users" ? (
          <div className="row" style={{ gap: 8 }}>
            <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">همه وضعیت‌ها</option>
              <option value="0">در انتظار</option>
              <option value="1">تأیید شده</option>
              <option value="2">رد شده</option>
            </select>
            <input
              className="input"
              style={{ width: 220 }}
              placeholder="جستجو (نام/موبایل)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        ) : null
      }
    >
      {tab === "users" && (
        <>
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
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{total} کاربر</div>
            </div>
          )}
        </>
      )}

      {tab === "pending" && (
        <div style={{ padding: 16, textAlign: "center" }}>
          <p>با کلیک روی دکمه زیر صف مدارک در انتظار بررسی را باز کنید.</p>
          <button className="btn primary" onClick={() => setQueueMode("pending")}>
            باز کردن صف مدارک
          </button>
        </div>
      )}

      {tab === "all" && (
        <div style={{ padding: 16, textAlign: "center" }}>
          <p>با کلیک روی دکمه زیر همه مدارک ثبت‌شده را ببینید.</p>
          <button className="btn primary" onClick={() => setQueueMode("all")}>
            مشاهده همه مدارک
          </button>
        </div>
      )}

      {selected && <DetailsModal user={selected} onClose={() => setSelected(null)} />}
      {queueMode && <DocQueue mode={queueMode} onClose={() => setQueueMode(null)} />}
    </Card>
  );
}
