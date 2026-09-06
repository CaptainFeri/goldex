import { useMemo, useState } from "react";
import { Line } from "react-chartjs-2";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Stat, Badge, Loading, ErrorState, Empty, Modal } from "../components/ui";
import { fmtNum, fmtDate } from "../lib/format";
import { gridColor } from "../lib/chart";
import type { ApiKey, ApiKeyStatus, ApiStats, ApiTraffic, CreatedApiKey } from "../api/types";

const STATUS_LABEL: Record<ApiKeyStatus, string> = {
  active: "فعال",
  limited: "محدود",
  revoked: "باطل‌شده",
};
const STATUS_KIND: Record<ApiKeyStatus, "green" | "gold" | "red"> = {
  active: "green",
  limited: "gold",
  revoked: "red",
};

/** "—" rather than a number the server did not have. */
export const orDash = (v: number | null, suffix = "") => (v === null ? "—" : `${fmtNum(v, 2)}${suffix}`);

function CreatedKeyModal({ created, onClose }: { created: CreatedApiKey; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(created.plaintextKey);
      setCopied(true);
    } catch {
      // Clipboard access can be refused; the key is on screen to select by hand.
      setCopied(false);
    }
  };

  return (
    <Modal title={`کلید «${created.name}» ساخته شد`} onClose={onClose} wide>
      <div style={{ marginBottom: 12, fontWeight: 600, color: "var(--gold)" }}>
        این کلید فقط همین یک بار نمایش داده می‌شود.
      </div>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        سرور تنها هش کلید را نگه می‌دارد، بنابراین بازیابی آن ممکن نیست. اگر آن را
        گم کنید باید کلید تازه‌ای بسازید.
      </p>
      <div
        dir="ltr"
        style={{
          background: "var(--bg-soft)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          padding: 12,
          fontFamily: "monospace",
          fontSize: 13,
          wordBreak: "break-all",
          userSelect: "all",
        }}
      >
        {created.plaintextKey}
      </div>
      <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn ghost" onClick={copy}>{copied ? "کپی شد ✓" : "کپی کلید"}</button>
        <button className="btn" onClick={onClose}>ذخیره کردم، ببند</button>
      </div>
    </Modal>
  );
}

function CreateKeyModal({
  onCreated,
  onClose,
}: {
  onCreated: (k: CreatedApiKey) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [quota, setQuota] = useState("");

  const save = useMutation({
    mutationFn: async () =>
      unwrap<CreatedApiKey>(
        (await api.post("/admin/api-keys", {
          name,
          monthlyQuota: quota ? Number(quota) : undefined,
        })).data,
      ),
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      qc.invalidateQueries({ queryKey: ["api-stats"] });
      onCreated(created);
    },
  });

  return (
    <Modal title="کلید API جدید" onClose={onClose}>
      <div className="form-grid">
        <label>
          <span>نام کلید</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          <span>سقف ماهانه درخواست (اختیاری)</span>
          <input className="input" inputMode="numeric" value={quota} onChange={(e) => setQuota(e.target.value)} />
        </label>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        سقف ماهانه تنها زمانی اعمال می‌شود که وضعیت کلید روی «محدود» باشد.
      </p>
      {save.isError && <ErrorState message={apiError(save.error)} />}
      <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn ghost" onClick={onClose}>انصراف</button>
        <button className="btn" disabled={!name.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "در حال ساخت…" : "ساخت کلید"}
        </button>
      </div>
    </Modal>
  );
}

function LimitModal({ apiKey, onClose }: { apiKey: ApiKey; onClose: () => void }) {
  const qc = useQueryClient();
  const [quota, setQuota] = useState(String(apiKey.monthlyQuota ?? ""));

  const save = useMutation({
    mutationFn: async () =>
      api.patch(`/admin/api-keys/${apiKey.id}/status`, {
        status: "limited",
        monthlyQuota: Number(quota),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      onClose();
    },
  });

  return (
    <Modal title={`محدود کردن «${apiKey.name}»`} onClose={onClose}>
      <p className="muted" style={{ fontSize: 13, marginTop: 0 }}>
        پس از عبور از این سقف، درخواست‌های این کلید با خطای ۴۲۹ رد می‌شوند.
      </p>
      <label>
        <span>سقف ماهانه درخواست</span>
        <input className="input" inputMode="numeric" value={quota} onChange={(e) => setQuota(e.target.value)} />
      </label>
      {save.isError && (
        <ErrorState
          message={
            apiError(save.error).includes("QUOTA_REQUIRED")
              ? "برای وضعیت «محدود» باید یک سقف ماهانه تعیین کنید."
              : apiError(save.error)
          }
        />
      )}
      <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn ghost" onClick={onClose}>انصراف</button>
        <button className="btn" disabled={!Number(quota) || save.isPending} onClick={() => save.mutate()}>
          ذخیره
        </button>
      </div>
    </Modal>
  );
}

export default function ApiPage() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [limiting, setLimiting] = useState<ApiKey | null>(null);
  const [deleting, setDeleting] = useState<ApiKey | null>(null);

  const stats = useQuery({
    queryKey: ["api-stats"],
    queryFn: async () => unwrap<ApiStats>((await api.get("/admin/api/stats")).data),
  });
  const traffic = useQuery({
    queryKey: ["api-traffic"],
    queryFn: async () => unwrap<ApiTraffic>((await api.get("/admin/api/traffic", { params: { window: "24h" } })).data),
  });
  const keys = useQuery({
    queryKey: ["api-keys"],
    queryFn: async () => unwrap<ApiKey[]>((await api.get("/admin/api-keys")).data),
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: ApiKeyStatus }) =>
      api.patch(`/admin/api-keys/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/admin/api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["api-keys"] });
      setDeleting(null);
    },
  });

  const chart = useMemo(() => {
    const points = traffic.data?.points;
    if (!points?.length) return null;
    return {
      labels: points.map((p) => new Date(p.bucket).toLocaleTimeString("fa-IR", { hour: "2-digit" })),
      datasets: [
        {
          label: "درخواست",
          data: points.map((p) => p.requests),
          borderColor: "#d4af37",
          backgroundColor: "rgba(212,175,55,0.18)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
        {
          label: "خطا",
          data: points.map((p) => p.errors),
          borderColor: "#e5484d",
          backgroundColor: "rgba(229,72,77,0.15)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
        },
      ],
    };
  }, [traffic.data]);

  // Zero traffic is only meaningful alongside this: with no keyed routes the
  // figures are correct rather than broken, and saying so stops an operator
  // chasing a bug that isn't there.
  const noKeyedRoutes = stats.data?.keyedRouteCount === 0;

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <Stat label="درخواست امروز" value={fmtNum(stats.data?.requestsToday ?? 0)} />
        <Stat label="میانگین پاسخ" value={stats.data ? orDash(stats.data.avgResponseMs, " ms") : "…"} />
        <Stat label="نرخ موفقیت" value={stats.data ? orDash(stats.data.successPercent, "٪") : "…"} />
        <Stat label="نرخ خطا" value={stats.data ? orDash(stats.data.errorPercent, "٪") : "…"} />
      </div>

      {noKeyedRoutes && (
        <Card title="هنوز هیچ مسیری با کلید API احراز هویت نمی‌شود">
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            کلیدها ساخته و مدیریت می‌شوند، اما در حال حاضر هیچ endpoint‌ای کلید API
            را نمی‌پذیرد؛ بنابراین اعداد بالا واقعاً صفر هستند و نشانهٔ خرابی نیستند.
            پس از مشخص شدن اینکه کدام endpointها در دسترس شرکای بیرونی قرار می‌گیرند،
            ترافیک اینجا دیده خواهد شد.
          </p>
        </Card>
      )}

      {/* With no keyed routes the chart is a guaranteed flat zero, and the
          banner above already says why — a tall empty chart adds nothing. Once
          a route accepts keys it is shown even at zero traffic, because then a
          flat line is real information. */}
      {!noKeyedRoutes && (
      <div>
        <Card title="ترافیک ۲۴ ساعت اخیر">
          {traffic.isLoading ? <Loading /> : traffic.isError ? <ErrorState message={apiError(traffic.error)} /> :
          !chart ? <Empty label="داده‌ای برای نمایش نیست" /> : (
            <div className="chart-box">
              <Line
                data={chart}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  interaction: { mode: "index", intersect: false },
                  scales: {
                    x: { grid: { color: gridColor() } },
                    // Request counts are integers; fractional ticks read as noise.
                    y: { grid: { color: gridColor() }, beginAtZero: true, ticks: { precision: 0 } },
                  },
                  plugins: { legend: { position: "bottom" } },
                }}
              />
            </div>
          )}
        </Card>
      </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Card
          title="کلیدهای API"
          action={<button className="btn" onClick={() => setCreating(true)}>کلید جدید</button>}
        >
          {keys.isLoading ? <Loading /> : keys.isError ? <ErrorState message={apiError(keys.error)} /> :
          !keys.data?.length ? <Empty label="هیچ کلیدی ساخته نشده است" /> : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>نام</th>
                    <th>کلید</th>
                    <th>درخواست این ماه</th>
                    <th>سقف</th>
                    <th>وضعیت</th>
                    <th>آخرین استفاده</th>
                    <th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.data.map((k) => (
                    <tr key={k.id}>
                      <td style={{ fontWeight: 600 }}>{k.name}</td>
                      <td><code dir="ltr">{k.maskedKey}</code></td>
                      <td>{fmtNum(k.monthlyRequests)}</td>
                      <td>{k.monthlyQuota ? fmtNum(k.monthlyQuota) : "—"}</td>
                      <td><Badge kind={STATUS_KIND[k.status]}>{STATUS_LABEL[k.status]}</Badge></td>
                      <td>{k.lastUsedAt ? fmtDate(k.lastUsedAt) : "—"}</td>
                      <td>
                        <div className="row" style={{ gap: 6 }}>
                          {k.status !== "active" && (
                            <button
                              className="btn ghost sm"
                              disabled={setStatus.isPending}
                              onClick={() => setStatus.mutate({ id: k.id, status: "active" })}
                            >
                              فعال‌سازی
                            </button>
                          )}
                          {k.status !== "limited" && (
                            <button className="btn ghost sm" onClick={() => setLimiting(k)}>محدود</button>
                          )}
                          {k.status !== "revoked" && (
                            <button
                              className="btn ghost sm"
                              disabled={setStatus.isPending}
                              onClick={() => setStatus.mutate({ id: k.id, status: "revoked" })}
                            >
                              باطل کردن
                            </button>
                          )}
                          <button className="btn ghost sm" onClick={() => setDeleting(k)}>حذف</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {setStatus.isError && <ErrorState message={apiError(setStatus.error)} />}
        </Card>
      </div>

      {creating && (
        <CreateKeyModal
          onClose={() => setCreating(false)}
          onCreated={(k) => {
            setCreating(false);
            setCreated(k);
          }}
        />
      )}
      {created && <CreatedKeyModal created={created} onClose={() => setCreated(null)} />}
      {limiting && <LimitModal apiKey={limiting} onClose={() => setLimiting(null)} />}
      {deleting && (
        <Modal title="حذف کلید" onClose={() => setDeleting(null)}>
          <p>کلید «{deleting.name}» حذف شود؟ برنامه‌هایی که از آن استفاده می‌کنند بلافاصله قطع می‌شوند.</p>
          {remove.isError && <ErrorState message={apiError(remove.error)} />}
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn ghost" onClick={() => setDeleting(null)}>انصراف</button>
            <button className="btn danger" disabled={remove.isPending} onClick={() => remove.mutate(deleting.id)}>
              حذف
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
