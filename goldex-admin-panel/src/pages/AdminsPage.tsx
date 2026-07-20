import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import { fmtDate } from "../lib/format";
import { useAuth } from "../auth/auth";
import type { Admin, AdminRole, ScheduleEntry } from "../api/types";

const DAYS: { value: number; label: string }[] = [
  { value: 6, label: "شنبه" },
  { value: 0, label: "یکشنبه" },
  { value: 1, label: "دوشنبه" },
  { value: 2, label: "سه‌شنبه" },
  { value: 3, label: "چهارشنبه" },
  { value: 4, label: "پنج‌شنبه" },
  { value: 5, label: "جمعه" },
];
function dayLabel(d: number) {
  return DAYS.find((x) => x.value === d)?.label ?? String(d);
}

const ROLES: { value: AdminRole; label: string }[] = [
  { value: "admin", label: "مدیر" },
  { value: "finance", label: "مالی" },
  { value: "warehouse", label: "انبار" },
  { value: "superAdmin", label: "مدیر ارشد" },
];
const roleLabel = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;

function EditForm({
  initial,
  onClose,
}: {
  initial: Admin;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [email, setEmail] = useState(initial.email ?? "");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<AdminRole>(initial.role);
  const [schedules, setSchedules] = useState<ScheduleEntry[]>(
    initial.schedules ?? [],
  );

  const schedulesQ = useQuery({
    queryKey: ["admin-schedules", initial.id],
    queryFn: async () =>
      unwrap<ScheduleEntry[]>((await api.get(`/admin/schedules/${initial.id}`)).data),
    enabled: initial.role === "finance" || initial.role === "warehouse",
  });

  const save = useMutation({
    mutationFn: (body: any) => api.patch(`/admin/accounts/${initial.id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admins"] });
      onClose();
    },
  });

  const saveSchedule = useMutation({
    mutationFn: (entries: ScheduleEntry[]) =>
      Promise.all(
        entries.map((s) => {
          const body = {
            adminId: initial.id,
            dayOfWeek: s.dayOfWeek,
            dayLabel: s.dayLabel,
            startTime: s.startTime,
            endTime: s.endTime,
          };
          return s.id
            ? api.patch(`/admin/schedules/${s.id}`, { startTime: s.startTime, endTime: s.endTime })
            : api.post("/admin/schedules", body);
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedules", initial.id] });
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = { role };
    if (email) payload.email = email;
    if (password) payload.password = password;
    save.mutate(payload);
  }

  const deleteSchedule = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/schedules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-schedules", initial.id] });
    },
  });

  function toggleDay(day: number) {
    setSchedules((prev) => {
      const exists = prev.find((s) => s.dayOfWeek === day);
      if (exists) {
        if (exists.id) deleteSchedule.mutate(exists.id);
        return prev.filter((s) => s.dayOfWeek !== day);
      }
      return [
        ...prev,
        {
          id: undefined,
          dayOfWeek: day,
          dayLabel: dayLabel(day),
          startTime: "09:00",
          endTime: "18:00",
        },
      ];
    });
  }

  function updateTime(day: number, field: "startTime" | "endTime", val: string) {
    setSchedules((prev) =>
      prev.map((s) => (s.dayOfWeek === day ? { ...s, [field]: val } : s)),
    );
  }

  return (
    <Modal title="ویرایش مدیر" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label>موبایل (غیرقابل تغییر)</label>
          <input className="input mono" dir="ltr" value={initial.phone ?? ""} disabled />
        </div>
        <div className="field">
          <label>ایمیل</label>
          <input
            className="input mono"
            dir="ltr"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@domain.com"
          />
        </div>
        <div className="field">
          <label>رمز عبور جدید (در صورت نیاز)</label>
          <input
            className="input mono"
            dir="ltr"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="حداقل ۶ کاراکتر — خالی = بدون تغییر"
          />
        </div>
        <div className="field">
          <label>نقش</label>
          <select className="select" value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {(role === "finance" || role === "warehouse") && (
          <div className="field" style={{ marginTop: 12 }}>
            <label>ساعت کاری</label>
            {schedulesQ.isLoading && <Loading />}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {DAYS.map((d) => {
                const s = schedules.find((x) => x.dayOfWeek === d.value);
                return (
                  <label
                    key={d.value}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={!!s}
                      onChange={() => toggleDay(d.value)}
                    />
                    <span style={{ minWidth: 70 }}>{d.label}</span>
                    {s && (
                      <>
                        <input
                          className="input mono"
                          style={{ width: 70, textAlign: "center" }}
                          value={s.startTime}
                          onChange={(e) => updateTime(d.value, "startTime", e.target.value)}
                          placeholder="09:00"
                        />
                        <span>تا</span>
                        <input
                          className="input mono"
                          style={{ width: 70, textAlign: "center" }}
                          value={s.endTime}
                          onChange={(e) => updateTime(d.value, "endTime", e.target.value)}
                          placeholder="18:00"
                        />
                      </>
                    )}
                  </label>
                );
              })}
            </div>
            <button
              type="button"
              className="btn sm"
              style={{ marginTop: 8 }}
              disabled={saveSchedule.isPending}
              onClick={() => saveSchedule.mutate(schedules)}
            >
              ذخیره ساعت کاری
            </button>
          </div>
        )}

        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 16 }}>
          <button type="button" className="btn ghost" onClick={onClose}>
            انصراف
          </button>
          <button className="btn primary" disabled={save.isPending}>
            {save.isPending ? <span className="spin" /> : "ذخیره"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function DetailsModal({ id, onClose }: { id: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ["admin-detail", id],
    queryFn: async () => unwrap<Admin>((await api.get(`/admin/accounts/${id}`)).data),
  });
  const schedulesQ = useQuery({
    queryKey: ["admin-schedules", id],
    queryFn: async () =>
      unwrap<ScheduleEntry[]>((await api.get(`/admin/schedules/${id}`)).data),
    enabled: q.data?.role === "finance" || q.data?.role === "warehouse",
  });
  const a = q.data;
  return (
    <Modal title="جزئیات مدیر" onClose={onClose}>
      {q.isLoading ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState message={apiError(q.error)} />
      ) : a ? (
        <>
          <div className="kv">
            <span className="k">شناسه</span>
            <span className="mono" style={{ fontSize: 12 }}>{a.id}</span>
            <span className="k">موبایل</span>
            <span className="mono" dir="ltr">{a.phone ?? "—"}</span>
            <span className="k">ایمیل</span>
            <span className="mono">{a.email ?? "—"}</span>
            <span className="k">نقش</span>
            <span>
              <Badge kind={a.role === "superAdmin" ? "gold" : "gray"}>{roleLabel(a.role)}</Badge>
            </span>
            <span className="k">وضعیت</span>
            <span>{a.isSuspended ? <Badge kind="red">معلق</Badge> : <Badge kind="green">فعال</Badge>}</span>
            <span className="k">ایجاد</span>
            <span>{fmtDate(a.createAt)}</span>
            <span className="k">آخرین ورود</span>
            <span>{fmtDate(a.lastLoginAt)}</span>
          </div>
          {(a.role === "finance" || a.role === "warehouse") && (
            <div style={{ marginTop: 16 }}>
              <h4 style={{ margin: "0 0 8px" }}>ساعت کاری</h4>
              {schedulesQ.isLoading ? (
                <Loading />
              ) : schedulesQ.data && schedulesQ.data.length > 0 ? (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>روز</th>
                        <th>از</th>
                        <th>تا</th>
                      </tr>
                    </thead>
                    <tbody>
                      {schedulesQ.data.map((s) => (
                        <tr key={s.id}>
                          <td>{dayLabel(s.dayOfWeek)}</td>
                          <td>{s.startTime}</td>
                          <td>{s.endTime}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="muted">هیچ برنامه کاری ثبت نشده</div>
              )}
            </div>
          )}
        </>
      ) : null}
    </Modal>
  );
}

export default function AdminsPage() {
  const qc = useQueryClient();
  const { admin: me } = useAuth();
  const [form, setForm] = useState<{
    phone: string;
    role: AdminRole;
    schedules: ScheduleEntry[];
  }>({ phone: "", role: "admin", schedules: [] });
  const [editing, setEditing] = useState<Admin | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ["admins"],
    queryFn: async () => unwrap<Admin[]>((await api.get("/admin/accounts")).data),
  });

  const create = useMutation({
    mutationFn: (p: { phone: string; role: AdminRole; schedules: ScheduleEntry[] }) =>
      api.post("/admin/accounts", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admins"] });
      setForm({ phone: "", role: "admin", schedules: [] });
    },
  });
  const suspend = useMutation({
    mutationFn: (p: { id: string; isSuspended: boolean }) =>
      api.patch(`/admin/accounts/${p.id}/suspend`, { isSuspended: p.isSuspended }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admins"] }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/accounts/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admins"] }),
  });

  const admins = list.data ?? [];

  function toggleDay(day: number) {
    setForm((prev) => {
      const exists = prev.schedules.find((s) => s.dayOfWeek === day);
      if (exists) {
        return { ...prev, schedules: prev.schedules.filter((s) => s.dayOfWeek !== day) };
      }
      return {
        ...prev,
        schedules: [
          ...prev.schedules,
          { dayOfWeek: day, dayLabel: dayLabel(day), startTime: "09:00", endTime: "18:00" },
        ],
      };
    });
  }

  function updateTime(day: number, field: "startTime" | "endTime", val: string) {
    setForm((prev) => ({
      ...prev,
      schedules: prev.schedules.map((s) =>
        s.dayOfWeek === day ? { ...s, [field]: val } : s,
      ),
    }));
  }

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
              onChange={(e) => setForm({ ...form, role: e.target.value as AdminRole, schedules: [] })}
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

        {(form.role === "finance" || form.role === "warehouse") && (
          <div style={{ marginTop: 12 }}>
            <label style={{ fontWeight: 600, fontSize: 13, display: "block", marginBottom: 6 }}>ساعت کاری</label>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {DAYS.map((d) => {
                const s = form.schedules.find((x) => x.dayOfWeek === d.value);
                return (
                  <label
                    key={d.value}
                    style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
                  >
                    <input
                      type="checkbox"
                      checked={!!s}
                      onChange={() => toggleDay(d.value)}
                    />
                    <span style={{ minWidth: 70 }}>{d.label}</span>
                    {s && (
                      <>
                        <input
                          className="input mono"
                          style={{ width: 70, textAlign: "center" }}
                          value={s.startTime}
                          onChange={(e) => updateTime(d.value, "startTime", e.target.value)}
                          placeholder="09:00"
                        />
                        <span>تا</span>
                        <input
                          className="input mono"
                          style={{ width: 70, textAlign: "center" }}
                          value={s.endTime}
                          onChange={(e) => updateTime(d.value, "endTime", e.target.value)}
                          placeholder="18:00"
                        />
                      </>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        )}

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
                          <button className="btn sm" onClick={() => setDetailId(a.id)}>
                            جزئیات
                          </button>
                          <button
                            className="btn sm"
                            disabled={isMe}
                            onClick={() => setEditing(a)}
                          >
                            ویرایش
                          </button>
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

      {editing && <EditForm initial={editing} onClose={() => setEditing(null)} />}
      {detailId && <DetailsModal id={detailId} onClose={() => setDetailId(null)} />}
    </>
  );
}
