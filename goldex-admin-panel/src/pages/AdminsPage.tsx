import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge } from "../components/ui";
import { fmtDate } from "../lib/format";
import { useAuth } from "../auth/auth";
import type { Admin, AdminRole } from "../api/types";

const ROLES: { value: AdminRole; label: string }[] = [
  { value: "admin", label: "مدیر" },
  { value: "finance", label: "مالی" },
  { value: "warehouse", label: "انبار" },
  { value: "superAdmin", label: "مدیر ارشد" },
];
const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

export default function AdminsPage() {
  const qc = useQueryClient();
  const { admin: me } = useAuth();
  const [form, setForm] = useState<{ phone: string; role: AdminRole }>({ phone: "", role: "admin" });

  const list = useQuery({
    queryKey: ["admins"],
    queryFn: async () => unwrap<Admin[]>((await api.get("/admin")).data),
  });

  const create = useMutation({
    mutationFn: (p: { phone: string; role: AdminRole }) => api.post("/admin", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admins"] });
      setForm({ phone: "", role: "admin" });
    },
  });
  const suspend = useMutation({
    mutationFn: (p: { id: string; isSuspended: boolean }) =>
      api.patch(`/admin/${p.id}/suspend`, { isSuspended: p.isSuspended }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admins"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admins"] }),
  });

  const admins = list.data ?? [];

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!/^09[0-9]{9}$/.test(form.phone)) return;
    create.mutate(form);
  }

  return (
    <>
      <Card title="افزودن مدیر جدید (با شماره موبایل)">
        <form onSubmit={submit} className="toolbar" style={{ alignItems: "flex-end" }}>
          <div className="field" style={{ margin: 0, minWidth: 200 }}>
            <label>شماره موبایل</label>
            <input
              className="input mono"
              dir="ltr"
              placeholder="09123456789"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value.trim() })}
            />
          </div>
          <div className="field" style={{ margin: 0, minWidth: 160 }}>
            <label>نقش</label>
            <select
              className="select"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole })}
            >
              {ROLES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <button className="btn primary" disabled={create.isPending}>
            {create.isPending ? <span className="spin" /> : "ایجاد مدیر"}
          </button>
        </form>
        {create.isError && <div className="error-text">{apiError(create.error)}</div>}
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          مدیر جدید با همین شماره و کد یک‌بارمصرف (کاوه‌نگار) وارد می‌شود — بدون رمز عبور.
        </div>
      </Card>

      <Card title="مدیران" action={list.isFetching ? <span className="spin" /> : null}>
        {(suspend.isError || remove.isError) && (
          <div className="error-text">{apiError(suspend.error || remove.error)}</div>
        )}
        {list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState message={apiError(list.error)} />
        ) : admins.length === 0 ? (
          <Empty />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>موبایل</th>
                  <th>ایمیل</th>
                  <th>نقش</th>
                  <th>وضعیت</th>
                  <th>آخرین ورود</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => {
                  const isMe = a.id === me?.id;
                  return (
                    <tr key={a.id}>
                      <td className="mono" dir="ltr" style={{ textAlign: "right" }}>
                        {a.phone ?? "—"} {isMe && <Badge kind="gold">شما</Badge>}
                      </td>
                      <td className="mono" style={{ fontSize: 12 }}>{a.email ?? "—"}</td>
                      <td>
                        <Badge kind={a.role === "superAdmin" ? "gold" : "gray"}>{roleLabel(a.role)}</Badge>
                      </td>
                      <td>
                        {a.isSuspended ? <Badge kind="red">معلق</Badge> : <Badge kind="green">فعال</Badge>}
                      </td>
                      <td>{fmtDate(a.lastLoginAt)}</td>
                      <td>
                        <div className="row">
                          <button
                            className="btn sm"
                            disabled={isMe || suspend.isPending}
                            onClick={() => suspend.mutate({ id: a.id, isSuspended: !a.isSuspended })}
                          >
                            {a.isSuspended ? "رفع تعلیق" : "تعلیق"}
                          </button>
                          <button
                            className="btn sm danger"
                            disabled={isMe || remove.isPending}
                            onClick={() => window.confirm("حذف مدیر؟") && remove.mutate(a.id)}
                          >
                            حذف
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
      </Card>
    </>
  );
}
