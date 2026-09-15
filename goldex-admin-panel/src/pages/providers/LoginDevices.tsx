import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../../api/client";
import { Card, Loading, ErrorState, Empty, Badge } from "../../components/ui";

interface LoginDevice {
  id: string;
  name: string;
  lastSeenAt: string | null;
  revokedAt: string | null;
  active: boolean;
  createdAt: string | null;
}

interface EnrolledDevice extends LoginDevice {
  token: string;
}

/**
 * The handsets trusted to log providers back in on their own.
 *
 * Kept beside the providers rather than on a page of its own, because a device
 * exists for nothing else: what it is allowed to do is exactly this list of
 * providers, and an operator wondering why one is still down should find the
 * phone that was supposed to fix it in the same place.
 */
export default function LoginDevices() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [issued, setIssued] = useState<EnrolledDevice | null>(null);
  const [copied, setCopied] = useState(false);

  const devices = useQuery({
    queryKey: ["login-devices"],
    queryFn: () => api.get("/admin/login-devices").then(unwrap<LoginDevice[]>),
  });

  const enroll = useMutation({
    mutationFn: () =>
      api.post("/admin/login-devices", { name }).then(unwrap<EnrolledDevice>),
    onSuccess: (device) => {
      setIssued(device);
      setName("");
      setCopied(false);
      qc.invalidateQueries({ queryKey: ["login-devices"] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/login-devices/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["login-devices"] }),
  });

  const list = devices.data ?? [];

  return (
    <Card title="دستگاه‌های ورود خودکار">
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        هر دستگاه یک اعتبارنامه‌ی محدود می‌گیرد که فقط اجازه‌ی دیدن تأمین‌کننده‌ها و
        انجام مراحل ورود مجدد را دارد — نه دسترسی ادمین. هر زمان قابل ابطال است.
      </div>

      <div className="row" style={{ gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input
          className="input"
          placeholder="نام دستگاه، مثلاً: گوشی میز اپراتور"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ maxWidth: 320 }}
        />
        <button
          className="btn primary sm"
          disabled={enroll.isPending || name.trim().length < 2}
          onClick={() => enroll.mutate()}
        >
          {enroll.isPending ? <span className="spin" /> : "افزودن دستگاه"}
        </button>
      </div>
      {enroll.isError && <div className="error-text">{apiError(enroll.error)}</div>}

      {/*
        Shown once and never again — only a hash is stored. Saying so where the
        token is, rather than in documentation, is the difference between an
        operator copying it now and enrolling a second device tomorrow.
      */}
      {issued && (
        <div
          style={{
            border: "1px solid var(--gold, #E8B45C)",
            borderRadius: 10,
            padding: 12,
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            توکن «{issued.name}» — <b>فقط همین یک‌بار نمایش داده می‌شود</b>. اگر
            گم شود، باید دستگاه تازه‌ای تعریف کنید.
          </div>
          <div className="mono" dir="ltr" style={{ wordBreak: "break-all", fontSize: 12 }}>
            {issued.token}
          </div>
          <div className="row" style={{ gap: 10, marginTop: 10 }}>
            <button
              className="btn sm"
              onClick={() => {
                navigator.clipboard?.writeText(issued.token).then(
                  () => setCopied(true),
                  () => setCopied(false),
                );
              }}
            >
              {copied ? "کپی شد ✓" : "کپی"}
            </button>
            <button className="btn ghost sm" onClick={() => setIssued(null)}>
              بستن
            </button>
          </div>
        </div>
      )}

      {devices.isLoading ? (
        <Loading />
      ) : devices.isError ? (
        <ErrorState message={apiError(devices.error)} />
      ) : list.length === 0 ? (
        <Empty label="دستگاهی ثبت نشده است" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>نام</th>
                <th>وضعیت</th>
                <th>آخرین تماس</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>
                    {d.active ? (
                      <Badge kind="green">فعال</Badge>
                    ) : (
                      <Badge kind="gray">ابطال‌شده</Badge>
                    )}
                  </td>
                  {/*
                    The only thing that says whether a phone left to work
                    unattended is still alive; one killed by a battery
                    optimiser fails silently.
                  */}
                  <td className="mono" dir="ltr">
                    {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString("fa-IR") : "—"}
                  </td>
                  <td>
                    {d.active && (
                      <button
                        className="btn sm danger"
                        disabled={revoke.isPending}
                        onClick={() => revoke.mutate(d.id)}
                      >
                        ابطال
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {revoke.isError && <div className="error-text">{apiError(revoke.error)}</div>}
    </Card>
  );
}
