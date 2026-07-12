import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Stat, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { fmtNum, fmtDate } from "../lib/format";

const ROLE_LABEL: Record<number, string> = { 0: "مشتری", 1: "ادمین", 2: "کاربر جدید", 3: "شریک" };
function roleBadge(r: number) {
  return <Badge kind={r === 3 ? "gold" : r === 1 ? "red" : "gray"}>{ROLE_LABEL[r] ?? r}</Badge>;
}
function userStatus(u: any) {
  if (u.blockedAt) return <Badge kind="red">مسدود</Badge>;
  if (u.activeUntil && new Date(u.activeUntil) < new Date()) return <Badge kind="gold">منقضی</Badge>;
  return <Badge kind="green">فعال</Badge>;
}

function CreatePartner({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ phone: "", firstName: "", lastName: "", password: "", activeUntil: "" });
  const set = (k: string, v: any) => setForm((f) => ({ ...f, [k]: v }));
  const create = useMutation({
    mutationFn: (p: any) => api.post("/admin/users/partners", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user-stats"] });
      setForm({ phone: "", firstName: "", lastName: "", password: "", activeUntil: "" });
      onDone();
    },
  });
  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^09[0-9]{9}$/.test(form.phone)) return;
    create.mutate({
      phone: form.phone,
      password: form.password,
      firstName: form.firstName || undefined,
      lastName: form.lastName || undefined,
      activeUntil: form.activeUntil ? new Date(form.activeUntil).toISOString() : undefined,
    });
  }
  return (
    <Card title="افزودن کاربر شریک (Partner)">
      <form onSubmit={submit} className="toolbar" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ margin: 0, minWidth: 170 }}>
          <label>شماره موبایل</label>
          <input className="input mono" dir="ltr" placeholder="09123456789" value={form.phone} onChange={(e) => set("phone", e.target.value.trim())} />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 130 }}>
          <label>نام</label>
          <input className="input" value={form.firstName} onChange={(e) => set("firstName", e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 130 }}>
          <label>نام خانوادگی</label>
          <input className="input" value={form.lastName} onChange={(e) => set("lastName", e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 170 }}>
          <label>رمز عبور</label>
          <input className="input mono" dir="ltr" type="password" placeholder="حداقل ۶ کاراکتر" value={form.password} onChange={(e) => set("password", e.target.value)} />
        </div>
        <div className="field" style={{ margin: 0, minWidth: 160 }}>
          <label>فعال تا (اختیاری)</label>
          <input className="input" type="date" value={form.activeUntil} onChange={(e) => set("activeUntil", e.target.value)} />
        </div>
        <button className="btn primary" disabled={create.isPending}>
          {create.isPending ? <span className="spin" /> : "ایجاد شریک"}
        </button>
      </form>
      {create.isError && <div className="error-text">{apiError(create.error)}</div>}
      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        شرکا با کد یک‌بارمصرف وارد می‌شوند و به هر دو بازار (رسمی و غیررسمی) دسترسی دارند.
      </div>
    </Card>
  );
}

export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");

  const stats = useQuery({
    queryKey: ["user-stats"],
    queryFn: async () => unwrap<any>((await api.get("/admin/users/stats")).data),
    refetchInterval: 20_000,
  });
  const online = useQuery({
    queryKey: ["users-online"],
    queryFn: async () => unwrap<string[]>((await api.get("/admin/users/online")).data),
    refetchInterval: 20_000,
  });
  const list = useQuery({
    queryKey: ["users", search],
    queryFn: async () =>
      unwrap<any>((await api.get("/admin/users/users", { params: { pageSize: 100, pageNumber: 1, searchKey: search || undefined } })).data),
  });

  const toggleBlock = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/users/users/${id}/activation`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["user-stats"] });
    },
  });

  const s = stats.data;
  const onlineSet = new Set(online.data ?? []);
  const users: any[] = list.data?.userList ?? [];

  return (
    <>
      <div className="grid grid-4">
        <Stat label="کل کاربران" value={stats.isLoading ? "…" : fmtNum(s?.total)} sub={`${fmtNum(s?.newUsers)} جدید`} />
        <Stat label="کاربران آنلاین" value={fmtNum(s?.online)} sub={<Badge kind="green">زنده</Badge>} />
        <Stat label="فعال / غیرفعال" value={`${fmtNum(s?.active)} / ${fmtNum(s?.inactive)}`} sub={`${fmtNum(s?.blocked)} مسدود، ${fmtNum(s?.expired)} منقضی`} />
        <Stat label="شرکا (Partners)" value={fmtNum(s?.byRole?.partner)} sub={`${fmtNum(s?.byRole?.customer)} مشتری`} />
        <Stat label="احراز هویت تأییدشده" value={fmtNum(s?.verifiedKyc)} />
        <Stat label="احراز در انتظار" value={fmtNum(s?.pendingKyc)} />
        <Stat label="کاربران مسدود" value={fmtNum(s?.blocked)} />
        <Stat label="کاربران جدید (دوره)" value={fmtNum(s?.newUsers)} />
      </div>

      <CreatePartner onDone={() => {}} />

      <Card
        title={`کاربران${list.data ? ` (${list.data.totalItems})` : ""}`}
        action={
          <input className="input" style={{ width: 220 }} placeholder="جستجو (نام/ایمیل)…" value={search} onChange={(e) => setSearch(e.target.value)} />
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
                  <th>نقش</th>
                  <th>وضعیت</th>
                  <th>آنلاین</th>
                  <th>فعال تا</th>
                  <th>عضویت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>{`${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || "—"}</td>
                    <td className="mono" dir="ltr" style={{ textAlign: "right" }}>{u.phone ?? "—"}</td>
                    <td>{roleBadge(u.role)}</td>
                    <td>{userStatus(u)}</td>
                    <td>{onlineSet.has(u.id) ? <Badge kind="green">آنلاین</Badge> : <span className="muted">—</span>}</td>
                    <td>{u.activeUntil ? fmtDate(u.activeUntil) : "—"}</td>
                    <td>{fmtDate(u.registeredAt ?? u.createAt)}</td>
                    <td>
                      <button className="btn sm" disabled={toggleBlock.isPending} onClick={() => toggleBlock.mutate(u.id)}>
                        {u.blockedAt ? "رفع مسدودیت" : "مسدود"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
