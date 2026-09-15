import { useQuery } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../../api/client";
import { Card, Loading, ErrorState, Empty, Badge } from "../../components/ui";

interface LoginCandidate {
  id: string | null;
  key: string;
  persianName?: string | null;
  phone?: string | null;
  status: string;
  eligible: boolean;
  reason: string | null;
  attempts: number;
  cooldownUntil: string | null;
  leasedBy: string | null;
}

interface LoginAttempt {
  id: string;
  providerKey: string;
  deviceName: string | null;
  outcome: "started" | "succeeded" | "failed";
  reason: string | null;
  attempt: number;
  startedAt: string | null;
  finishedAt: string | null;
}

const OUTCOME: Record<string, { label: string; kind: "green" | "red" | "gold" }> = {
  succeeded: { label: "موفق", kind: "green" },
  failed: { label: "ناموفق", kind: "red" },
  started: { label: "در جریان", kind: "gold" },
};

const when = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("fa-IR") : "—";

/**
 * What the unattended system is doing, and what it has done.
 *
 * Two questions an operator actually asks. The first is "why is this provider
 * still down" — answered by `reason`, which is the backend's own sentence, not
 * a status code re-worded here. The second is asked in the morning, about the
 * night: that is the feed, and it exists because an automatic system that fails
 * silently is indistinguishable from one that was never switched on.
 */
export default function AutoLoginPanel() {
  const candidates = useQuery({
    queryKey: ["providers-need-login"],
    queryFn: () =>
      api.get("/admin/providers/needs-login").then(unwrap<LoginCandidate[]>),
    // The state changes without anyone here doing anything — a handset acts, a
    // cooldown lapses — so the view has to go and look.
    refetchInterval: 15000,
  });

  const attempts = useQuery({
    queryKey: ["provider-login-attempts"],
    queryFn: () =>
      api.get("/admin/providers/login-attempts?limit=15").then(unwrap<LoginAttempt[]>),
    refetchInterval: 30000,
  });

  const waiting = candidates.data ?? [];
  const history = attempts.data ?? [];

  return (
    <Card title="ورود خودکار تأمین‌کنندگان">
      <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
        تأمین‌کننده‌ای که نشستش رد شده اینجا می‌آید و دستگاه‌های ثبت‌شده خودشان
        واردش می‌شوند. سقف تلاش و فاصله‌ی بین تلاش‌ها را سرور تعیین می‌کند؛ کاربر
        پنل هیچ‌وقت پشت cooldown نمی‌ماند.
      </div>

      {candidates.isLoading ? (
        <Loading />
      ) : candidates.isError ? (
        <ErrorState message={apiError(candidates.error)} />
      ) : waiting.length === 0 ? (
        <Empty label="هیچ تأمین‌کننده‌ای منتظر ورود نیست" />
      ) : (
        <div className="table-wrap" style={{ marginBottom: 18 }}>
          <table>
            <thead>
              <tr>
                <th>تأمین‌کننده</th>
                <th>تلاش‌ها</th>
                <th>وضعیت</th>
                <th>توضیح</th>
              </tr>
            </thead>
            <tbody>
              {waiting.map((c) => (
                <tr key={c.key}>
                  <td>
                    {c.persianName || c.key}
                    <div className="mono muted" style={{ fontSize: 11 }}>{c.key}</div>
                  </td>
                  <td>{c.attempts}</td>
                  <td>
                    {c.eligible ? (
                      <Badge kind="gold">آماده‌ی تلاش</Badge>
                    ) : c.leasedBy ? (
                      <Badge kind="green">در حال تلاش</Badge>
                    ) : (
                      <Badge kind="gray">در انتظار</Badge>
                    )}
                  </td>
                  {/*
                    The backend's own sentence. Re-wording it here would mean
                    two places to keep true, and the one on screen would be the
                    one that drifted.
                  */}
                  <td style={{ fontSize: 12 }}>{c.reason || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ fontSize: 13, marginBottom: 8 }}>آخرین تلاش‌ها</div>
      {attempts.isLoading ? (
        <Loading />
      ) : attempts.isError ? (
        <ErrorState message={apiError(attempts.error)} />
      ) : history.length === 0 ? (
        <Empty label="تلاشی ثبت نشده است" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>تأمین‌کننده</th>
                <th>دستگاه</th>
                <th>نتیجه</th>
                <th>علت</th>
                <th>زمان</th>
              </tr>
            </thead>
            <tbody>
              {history.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.providerKey}</td>
                  {/* Null means a person did it from the panel. */}
                  <td>{a.deviceName || "پنل"}</td>
                  <td>
                    <Badge kind={OUTCOME[a.outcome]?.kind ?? "gray"}>
                      {OUTCOME[a.outcome]?.label ?? a.outcome}
                    </Badge>
                  </td>
                  <td style={{ fontSize: 12 }}>{a.reason || "—"}</td>
                  <td style={{ fontSize: 12 }}>{when(a.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
