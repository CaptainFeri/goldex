import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal, Stat } from "../components/ui";
import { fmtNum, fmtDate } from "../lib/format";
import type {
  Paginated,
  ReportDownload,
  ReportFormat,
  ReportJob,
  ReportSchedule,
  ReportStats,
  ReportStatus,
  ReportType,
} from "../api/types";

/** The panel's four cards, each a view of the same list. */
type Kpi = "generated" | "schedules" | "downloads" | "duration";

const KPI_META: Record<Kpi, { listTitle: string; empty: string }> = {
  generated: { listTitle: "گزارش‌های تولیدشده", empty: "گزارش تولیدشده‌ای برای نمایش وجود ندارد" },
  schedules: { listTitle: "زمان‌بندی‌های فعال", empty: "زمان‌بندی فعالی برای نمایش وجود ندارد" },
  downloads: { listTitle: "دانلودهای این ماه", empty: "دانلودی در این ماه ثبت نشده است" },
  duration: { listTitle: "گزارش‌ها براساس زمان تولید", empty: "موردی برای نمایش وجود ندارد" },
};

/**
 * The API's four types. آربیتراژ is absent on purpose — those signals are never
 * persisted, so the backend does not offer a type it could not fill.
 */
const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: "trades", label: "معاملات" },
  { value: "users", label: "کاربران" },
  { value: "financial", label: "مالی" },
  { value: "withdrawals", label: "برداشت‌ها" },
];

/** PDF is absent for the same reason: printing stays client-side. */
const FORMATS: { value: ReportFormat; label: string }[] = [
  { value: "xlsx", label: "Excel" },
  { value: "csv", label: "CSV" },
];

const typeLabel = (t: ReportType) => REPORT_TYPES.find((r) => r.value === t)?.label ?? t;
const formatLabel = (f: ReportFormat) => FORMATS.find((x) => x.value === f)?.label ?? f;

const STATUS: Record<ReportStatus, { label: string; kind: "green" | "red" | "gold" | "gray" }> = {
  pending: { label: "در صف", kind: "gold" },
  running: { label: "در حال تولید", kind: "gold" },
  completed: { label: "آماده", kind: "green" },
  failed: { label: "ناموفق", kind: "red" },
};

/** Seconds, because a report that takes minutes is the exception. */
function fmtDuration(ms: number | null): string {
  if (ms === null) return "—";
  return `${fmtNum(ms / 1000, 1)} ثانیه`;
}

function fmtSize(bytes: string | null): string {
  if (!bytes) return "—";
  const n = Number(bytes);
  if (!Number.isFinite(n)) return "—";
  if (n < 1024) return `${fmtNum(n)} بایت`;
  if (n < 1024 * 1024) return `${fmtNum(n / 1024, 1)} کیلوبایت`;
  return `${fmtNum(n / (1024 * 1024), 1)} مگابایت`;
}

/**
 * A report window is day-granular — it is submitted as the start and end of a
 * day — so the range column shows dates without a time. Rendering `۱۹:۰۸` on a
 * boundary suggests a precision the window does not have, and the two full
 * timestamps together pushed the download button off the edge of the table.
 */
function fmtDay(v: string | null): string {
  if (!v) return "—";
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("fa-IR");
}

/** A date input's value is `YYYY-MM-DD`; the API wants an instant. */
const startOfDay = (v: string) => (v ? new Date(`${v}T00:00:00`).toISOString() : undefined);
const endOfDay = (v: string) => (v ? new Date(`${v}T23:59:59.999`).toISOString() : undefined);

function ScheduleModal({
  schedule,
  onClose,
}: {
  schedule: ReportSchedule | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = schedule !== null;
  const [name, setName] = useState(schedule?.name ?? "");
  const [type, setType] = useState<ReportType>(schedule?.type ?? "trades");
  const [format, setFormat] = useState<ReportFormat>(schedule?.format ?? "xlsx");
  const [cron, setCron] = useState(schedule?.cronExpression ?? "0 3 * * 1");
  const [windowDays, setWindowDays] = useState(String(schedule?.windowDays ?? 30));
  const [isActive, setIsActive] = useState(schedule?.isActive ?? true);

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing
        ? api.patch(`/admin/reports/schedules/${schedule!.id}`, body)
        : api.post("/admin/reports/schedules", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-schedules"] });
      qc.invalidateQueries({ queryKey: ["report-stats"] });
      onClose();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = {
      name,
      format,
      cronExpression: cron,
      windowDays: Number(windowDays) || 30,
      isActive,
    };
    // The type is fixed at creation — the API refuses to change it, so that the
    // run history keeps meaning what it says.
    if (!editing) body.type = type;
    save.mutate(body);
  }

  return (
    <Modal title={editing ? `ویرایش زمان‌بندی — ${schedule!.name}` : "زمان‌بندی گزارش"} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label>عنوان</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div className="field">
          <label>نوع گزارش</label>
          <select
            className="select"
            value={type}
            disabled={editing}
            onChange={(e) => setType(e.target.value as ReportType)}
          >
            {REPORT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          {editing && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>نوع گزارش پس از ساخت قابل تغییر نیست.</div>}
        </div>
        <div className="field">
          <label>فرمت</label>
          <select className="select" value={format} onChange={(e) => setFormat(e.target.value as ReportFormat)}>
            {FORMATS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label>زمان‌بندی (cron)</label>
          <input className="input mono" dir="ltr" value={cron} onChange={(e) => setCron(e.target.value)} required />
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            پنج بخشی، به وقت سرور. مثال: <span className="mono" dir="ltr">0 3 * * 1</span> یعنی دوشنبه‌ها ساعت ۳ بامداد.
          </div>
        </div>
        <div className="field">
          <label>بازه هر اجرا (روز)</label>
          <input
            className="input mono"
            dir="ltr"
            type="number"
            min={1}
            max={365}
            value={windowDays}
            onChange={(e) => setWindowDays(e.target.value)}
          />
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
            هر اجرا همین تعداد روز گذشته را پوشش می‌دهد، تا رکوردهای تکراری صادر نشود.
          </div>
        </div>
        <label className="row" style={{ gap: 6, alignItems: "center", marginTop: 4 }}>
          <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
          <span>فعال</span>
        </label>
        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 14 }}>
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={save.isPending}>
            {save.isPending ? <span className="spin" /> : "ذخیره"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function SchedulesCard() {
  const qc = useQueryClient();
  const [modal, setModal] = useState<{ open: boolean; schedule: ReportSchedule | null }>({
    open: false,
    schedule: null,
  });

  const schedules = useQuery({
    queryKey: ["report-schedules"],
    queryFn: async () => unwrap<ReportSchedule[]>((await api.get("/admin/reports/schedules")).data),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/admin/reports/schedules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-schedules"] });
      qc.invalidateQueries({ queryKey: ["report-stats"] });
    },
  });

  const rows = schedules.data ?? [];

  return (
    <Card
      title="زمان‌بندی‌ها"
      action={
        <button className="btn primary sm" onClick={() => setModal({ open: true, schedule: null })}>
          + زمان‌بندی جدید
        </button>
      }
    >
      {schedules.isLoading ? (
        <Loading />
      ) : schedules.isError ? (
        <ErrorState message={apiError(schedules.error)} />
      ) : rows.length === 0 ? (
        <Empty label="زمان‌بندی‌ای ثبت نشده است" />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>عنوان</th><th>نوع</th><th>فرمت</th><th>cron</th><th>بازه</th>
                <th>اجرای بعدی</th><th>آخرین اجرا</th><th>وضعیت</th><th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{typeLabel(s.type)}</td>
                  <td><Badge kind="gold">{formatLabel(s.format)}</Badge></td>
                  <td className="mono" dir="ltr">{s.cronExpression}</td>
                  <td className="mono">{fmtNum(s.windowDays)} روز</td>
                  <td>{fmtDate(s.nextRunAt)}</td>
                  <td>{fmtDate(s.lastRunAt)}</td>
                  <td>
                    {s.isActive ? <Badge kind="green">فعال</Badge> : <Badge kind="gray">غیرفعال</Badge>}
                  </td>
                  <td>
                    <div className="row">
                      <button className="btn sm" onClick={() => setModal({ open: true, schedule: s })}>
                        ویرایش
                      </button>
                      <button
                        className="btn sm ghost"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (window.confirm(`زمان‌بندی «${s.name}» حذف شود؟`)) remove.mutate(s.id);
                        }}
                      >
                        حذف
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal.open && <ScheduleModal schedule={modal.schedule} onClose={() => setModal({ open: false, schedule: null })} />}
    </Card>
  );
}

export default function ReportsPage() {
  const qc = useQueryClient();
  const [kpi, setKpi] = useState<Kpi>("generated");
  const [type, setType] = useState<ReportType>("trades");
  const [format, setFormat] = useState<ReportFormat>("xlsx");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [applied, setApplied] = useState<{ from?: string; to?: string }>({});
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const stats = useQuery({
    queryKey: ["report-stats"],
    queryFn: async () => unwrap<ReportStats>((await api.get("/admin/reports/stats")).data),
  });

  const list = useQuery({
    queryKey: ["reports", kpi, applied],
    queryFn: async () =>
      unwrap<Paginated<ReportJob>>(
        (await api.get("/admin/reports", { params: { kpi, ...applied, pageSize: 50 } })).data,
      ),
    // A queued report becomes ready without the operator doing anything, so the
    // list refreshes on its own rather than needing a manual reload.
    refetchInterval: (query) =>
      (query.state.data?.items ?? []).some((r) => r.status === "pending" || r.status === "running")
        ? 3000
        : false,
  });

  const generate = useMutation({
    mutationFn: () =>
      api.post("/admin/reports/generate", {
        type,
        format,
        from: startOfDay(from),
        to: endOfDay(to),
      }),
    onSuccess: () => {
      // Show the new job immediately, on the card that lists it.
      setKpi("generated");
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["report-stats"] });
    },
  });

  /**
   * Download in two steps, as the API requires.
   *
   * The URL is minted per click and expires in about two minutes, so it is
   * fetched on demand rather than held on the row — a link rendered at page
   * load would be dead by the time anyone pressed it.
   */
  async function download(job: ReportJob) {
    setDownloadError(null);
    try {
      const res = unwrap<ReportDownload>((await api.get(`/admin/reports/${job.id}/download`)).data);
      const a = document.createElement("a");
      a.href = res.url;
      a.download = res.fileName;
      a.click();
      qc.invalidateQueries({ queryKey: ["report-stats"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    } catch (err) {
      setDownloadError(apiError(err));
    }
  }

  const meta = KPI_META[kpi];
  const items = list.data?.items ?? [];
  const s = stats.data;

  return (
    <>
      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        {(
          [
            ["generated", "گزارش تولیدشده", s ? fmtNum(s.generated) : "…"],
            ["schedules", "زمان‌بندی فعال", s ? fmtNum(s.activeSchedules) : "…"],
            ["downloads", "دانلود این ماه", s ? fmtNum(s.downloadsThisMonth) : "…"],
            ["duration", "میانگین تولید", s ? fmtDuration(s.averageDurationMs) : "…"],
          ] as [Kpi, string, string][]
        ).map(([key, label, value]) => (
          <div
            key={key}
            role="button"
            tabIndex={0}
            onClick={() => setKpi(key)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setKpi(key);
            }}
            style={{
              cursor: "pointer",
              outline: kpi === key ? "1px solid var(--gold)" : undefined,
              borderRadius: "var(--radius)",
            }}
          >
            <Stat label={label} value={value} />
          </div>
        ))}
      </div>

      <Card title="گزارش‌ساز سفارشی">
        <div className="toolbar" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
          <div className="field" style={{ margin: 0, minWidth: 160 }}>
            <label>نوع گزارش</label>
            <select className="select" value={type} onChange={(e) => setType(e.target.value as ReportType)}>
              {REPORT_TYPES.map((t) => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ margin: 0, minWidth: 150 }}>
            <label>از تاریخ</label>
            <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0, minWidth: 150 }}>
            <label>تا تاریخ</label>
            <input type="date" className="input" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0, minWidth: 140 }}>
            <label>فرمت خروجی</label>
            <select className="select" value={format} onChange={(e) => setFormat(e.target.value as ReportFormat)}>
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>
          <button
            className="btn"
            onClick={() => setApplied({ from: startOfDay(from), to: endOfDay(to) })}
          >
            جستجو براساس تاریخ
          </button>
          <button className="btn primary" disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? <span className="spin" /> : `تولید گزارش ${typeLabel(type)}`}
          </button>
        </div>
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
          گزارش در صف تولید قرار می‌گیرد و پس از آماده شدن در فهرست زیر قابل دانلود است.
          خروجی PDF از این‌جا گرفته نمی‌شود؛ برای چاپ از خود صفحه استفاده کنید.
        </div>
        {generate.isError && <div className="error-text">{apiError(generate.error)}</div>}
      </Card>

      <Card title={meta.listTitle}>
        {downloadError && <div className="error-text" style={{ marginBottom: 8 }}>{downloadError}</div>}
        {list.isLoading ? (
          <Loading />
        ) : list.isError ? (
          <ErrorState message={apiError(list.error)} />
        ) : items.length === 0 ? (
          <Empty label={meta.empty} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نوع</th><th>فرمت</th><th>بازه</th><th>ردیف</th><th>حجم</th>
                  <th>زمان تولید</th><th>دانلود</th><th>وضعیت</th><th>ساخته‌شده</th><th></th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {typeLabel(r.type)}
                      {r.scheduleId && (
                        <div className="muted" style={{ fontSize: 11 }}>زمان‌بندی‌شده</div>
                      )}
                    </td>
                    <td><Badge kind="gold">{formatLabel(r.format)}</Badge></td>
                    <td style={{ fontSize: 12 }}>
                      {r.fromDate || r.toDate ? `${fmtDay(r.fromDate)} — ${fmtDay(r.toDate)}` : "همه"}
                    </td>
                    <td className="mono">{r.rowCount === null ? "—" : fmtNum(r.rowCount)}</td>
                    <td className="mono">{fmtSize(r.fileSize)}</td>
                    <td className="mono">{fmtDuration(r.durationMs)}</td>
                    <td className="mono">{fmtNum(r.downloadCount)}</td>
                    <td>
                      <Badge kind={STATUS[r.status].kind}>{STATUS[r.status].label}</Badge>
                      {r.status === "failed" && r.error && (
                        <div className="muted" style={{ fontSize: 11, whiteSpace: "normal", maxWidth: 220 }}>
                          {r.error}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{fmtDate(r.createAt)}</td>
                    <td>
                      {/*
                        An expired artefact keeps its row as the audit record but
                        has no file left, so the action says why rather than
                        offering a download that would fail.
                      */}
                      {r.artifactExpired ? (
                        <span className="muted" style={{ fontSize: 12 }}>منقضی شده</span>
                      ) : (
                        <button
                          className="btn sm"
                          disabled={r.status !== "completed"}
                          onClick={() => download(r)}
                        >
                          دانلود
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <SchedulesCard />
    </>
  );
}
