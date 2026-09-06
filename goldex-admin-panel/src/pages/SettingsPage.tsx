import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Badge, Toggle } from "../components/ui";
import { fmtDate } from "../lib/format";
import { toApiAmount, toFormAmount, unitLabel } from "../lib/money";
import { usePermissions } from "../lib/permissions";
import type {
  AdminProfile,
  NotificationSettings,
  PlatformSettings,
  SecuritySettings,
} from "../api/types";

const SECURITY_ROWS: { key: keyof SecuritySettings; label: string; desc: string }[] = [
  { key: "twoFactor", label: "تأیید دو مرحله‌ای", desc: "ورود با کد پیامکی" },
  { key: "biometric", label: "ورود بیومتریک", desc: "اثر انگشت و چهره" },
  { key: "unknownLoginAlert", label: "هشدار ورود ناشناس", desc: "اعلان دستگاه جدید" },
];

const NOTIFICATION_ROWS: { key: keyof NotificationSettings; label: string; desc: string }[] = [
  { key: "tradeAlerts", label: "اعلان معاملات", desc: "هر معامله بزرگ" },
  { key: "dailyEmailReport", label: "ایمیل گزارش روزانه", desc: "خلاصه عملکرد" },
  { key: "systemAlerts", label: "هشدار سیستمی", desc: "رخدادهای زیرساخت" },
];

const LANGUAGES = [
  { value: "fa", label: "فارسی" },
  { value: "en", label: "English" },
];
const CALENDARS = [
  { value: "jalali", label: "شمسی" },
  { value: "gregorian", label: "میلادی" },
];
const CURRENCIES = [
  { value: "TOMAN", label: "تومان" },
  { value: "IRR", label: "ریال" },
];
const TIMEZONES = [
  "Asia/Tehran",
  "Asia/Dubai",
  "Europe/Istanbul",
  "Europe/London",
  "Europe/Berlin",
  "UTC",
];

/** Toggle rows that save on change — there is no "save" button to forget to press. */
function ToggleSection<T extends object>({
  title,
  rows,
  path,
  queryKey,
}: {
  title: string;
  rows: { key: keyof T; label: string; desc: string }[];
  path: string;
  queryKey: string;
}) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: [queryKey],
    queryFn: async () => unwrap<T>((await api.get(path)).data),
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<T>) => unwrap<T>((await api.patch(path, patch)).data),
    onSuccess: (next) => qc.setQueryData([queryKey], next),
  });

  return (
    <Card title={title}>
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={apiError(q.error)} /> : (
        <>
          {rows.map((r) => (
            <div className="settings-row" key={String(r.key)}>
              <div>
                <div style={{ fontWeight: 600 }}>{r.label}</div>
                <div className="settings-row-desc">{r.desc}</div>
              </div>
              <Toggle
                label={r.label}
                on={q.data?.[r.key] === true}
                disabled={save.isPending}
                onChange={(next) => save.mutate({ [r.key]: next } as Partial<T>)}
              />
            </div>
          ))}
          {save.isError && <ErrorState message={apiError(save.error)} />}
        </>
      )}
    </Card>
  );
}

function PlatformSection() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["platform-settings"],
    queryFn: async () => unwrap<PlatformSettings>((await api.get("/admin/settings/platform")).data),
  });

  const [form, setForm] = useState<Record<string, string>>({});
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  // Seeded once the server's values arrive; the inputs are otherwise
  // uncontrolled-then-controlled, which React warns about.
  useEffect(() => {
    if (!q.data) return;
    setForm({
      displayCurrency: q.data.displayCurrency,
      language: q.data.language,
      timezone: q.data.timezone,
      calendar: q.data.calendar,
      // Entered in toman; the API works in rial.
      minWithdrawal: String(toFormAmount(q.data.minWithdrawal, "IRR") ?? 0),
      defaultProfitPercent: q.data.defaultProfitPercent,
    });
  }, [q.data]);

  const save = useMutation({
    mutationFn: async () =>
      unwrap<PlatformSettings>(
        (
          await api.patch("/admin/settings/platform", {
            displayCurrency: form.displayCurrency,
            language: form.language,
            timezone: form.timezone,
            calendar: form.calendar,
            minWithdrawal: toApiAmount(form.minWithdrawal, "IRR"),
            defaultProfitPercent: Number(form.defaultProfitPercent),
          })
        ).data,
      ),
    onSuccess: (next) => qc.setQueryData(["platform-settings"], next),
  });

  if (q.isLoading) return <Card title="تنظیمات پلتفرم"><Loading /></Card>;
  if (q.isError) return <Card title="تنظیمات پلتفرم"><ErrorState message={apiError(q.error)} /></Card>;

  return (
    <Card
      title="تنظیمات پلتفرم"
      action={
        q.data?.updateAt ? (
          <span className="muted" style={{ fontSize: 12 }}>آخرین تغییر: {fmtDate(q.data.updateAt)}</span>
        ) : null
      }
    >
      <div className="form-grid">
        <label>
          <span>واحد نمایش</span>
          <select className="select" value={form.displayCurrency ?? ""} onChange={(e) => set("displayCurrency", e.target.value)}>
            {CURRENCIES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label>
          <span>زبان پنل</span>
          <select className="select" value={form.language ?? ""} onChange={(e) => set("language", e.target.value)}>
            {LANGUAGES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label>
          <span>منطقه زمانی</span>
          <select className="select" value={form.timezone ?? ""} onChange={(e) => set("timezone", e.target.value)}>
            {TIMEZONES.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </label>
        <label>
          <span>تقویم</span>
          <select className="select" value={form.calendar ?? ""} onChange={(e) => set("calendar", e.target.value)}>
            {CALENDARS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </label>
        <label>
          <span>حداقل برداشت ({unitLabel("IRR")})</span>
          <input
            className="input"
            inputMode="numeric"
            value={form.minWithdrawal ?? ""}
            onChange={(e) => set("minWithdrawal", e.target.value)}
          />
        </label>
        <label>
          <span>سود پیش‌فرض (٪)</span>
          <input
            className="input"
            inputMode="decimal"
            value={form.defaultProfitPercent ?? ""}
            onChange={(e) => set("defaultProfitPercent", e.target.value)}
          />
        </label>
      </div>
      {save.isError && <ErrorState message={apiError(save.error)} />}
      <div className="row" style={{ justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn" disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "در حال ذخیره…" : "ذخیره تغییرات"}
        </button>
      </div>
    </Card>
  );
}

function ProfileSection() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-profile"],
    queryFn: async () => unwrap<AdminProfile>((await api.get("/admin/settings/profile")).data),
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "" });

  const save = useMutation({
    mutationFn: async () =>
      unwrap<AdminProfile>(
        (await api.patch("/admin/settings/profile", {
          fullName: form.fullName || undefined,
          email: form.email || undefined,
        })).data,
      ),
    onSuccess: (next) => {
      qc.setQueryData(["admin-profile"], next);
      setEditing(false);
    },
  });

  const startEdit = () => {
    setForm({ fullName: q.data?.fullName ?? "", email: q.data?.email ?? "" });
    setEditing(true);
  };

  return (
    <Card
      title="پروفایل"
      action={
        !editing && q.data ? (
          <button className="btn ghost sm" onClick={startEdit}>ویرایش پروفایل</button>
        ) : null
      }
    >
      {q.isLoading ? <Loading /> : q.isError ? <ErrorState message={apiError(q.error)} /> : !editing ? (
        <div className="row" style={{ gap: 16, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{q.data?.fullName ?? "بدون نام"}</div>
            <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>
              {q.data?.email ?? q.data?.phone ?? "—"}
            </div>
          </div>
          {q.data?.roleName && <Badge kind="gold">{q.data.roleName}</Badge>}
          <span className="muted" style={{ fontSize: 12 }}>
            {q.data?.lastLoginAt ? `آخرین ورود: ${fmtDate(q.data.lastLoginAt)}` : "—"}
          </span>
        </div>
      ) : (
        <>
          <div className="form-grid">
            <label>
              <span>نام و نام خانوادگی</span>
              <input className="input" value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} />
            </label>
            <label>
              <span>ایمیل</span>
              <input className="input" dir="ltr" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </label>
          </div>
          {save.isError && (
            <ErrorState
              message={
                apiError(save.error).includes("ADMIN.EMAIL_TAKEN")
                  ? "این ایمیل قبلاً برای مدیر دیگری ثبت شده است."
                  : apiError(save.error)
              }
            />
          )}
          <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
            <button className="btn ghost" onClick={() => setEditing(false)}>انصراف</button>
            <button className="btn" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "در حال ذخیره…" : "ذخیره"}
            </button>
          </div>
        </>
      )}
    </Card>
  );
}

export default function SettingsPage() {
  const { can } = usePermissions();

  return (
    <>
      <ProfileSection />
      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <ToggleSection<SecuritySettings>
          title="امنیت"
          rows={SECURITY_ROWS}
          path="/admin/settings/security"
          queryKey="security-settings"
        />
        <ToggleSection<NotificationSettings>
          title="اعلان‌ها"
          rows={NOTIFICATION_ROWS}
          path="/admin/settings/notifications"
          queryKey="notification-settings"
        />
      </div>
      {/* Rendered only for `settings`; the server refuses it either way, this
          just avoids showing an operator a card that only ever errors. */}
      {can("settings") && (
        <div style={{ marginTop: 16 }}>
          <PlatformSection />
        </div>
      )}
    </>
  );
}
