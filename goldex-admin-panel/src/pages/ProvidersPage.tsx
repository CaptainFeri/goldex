import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";
import {
  providerFormInitial,
  providerFormIsComplete,
  providerFormPayload,
} from "../lib/provider-form";
import { parseProviderAuth } from "../lib/provider-auth-paste";
import BrowserSimulator from "./providers/BrowserSimulator";

interface Provider {
  id: string;
  key: string;
  category: string;
  baseUrl: string;
  apiBaseUrl?: string;
  persianName?: string;
  webPanelUrl?: string;
  sendOtpUrl?: string;
  verifyCodeUrl?: string;
  phone?: string;
  /** Unit the provider quotes in; the engine converts everything to Rial. */
  priceUnit?: "IRR" | "TOMAN";
  /** Whether the engine reaches this provider through the outbound proxy. */
  useProxy?: boolean;
  active: boolean;
  status: string;
  lastStatusChangeAt?: string;
  metadataRefreshIntervalMs?: number;
}

const STATUS_KIND: Record<string, "green" | "red" | "gray" | "gold"> = {
  connected: "green",
  connecting: "gold",
  reconnecting: "gold",
  disconnected: "red",
  stopped: "gray",
  inactive: "gray",
  error: "red",
};

const STATUS_LABEL: Record<string, string> = {
  connected: "متصل",
  connecting: "در حال اتصال",
  reconnecting: "در حال اتصال مجدد",
  disconnected: "قطع",
  stopped: "متوقف",
  inactive: "غیرفعال",
  error: "خطا",
};

const PRICE_UNIT_LABEL: Record<string, string> = {
  IRR: "ریال",
  TOMAN: "تومان",
};

function ProviderForm({
  initial,
  onClose,
}: {
  initial?: Provider;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const editing = !!initial?.id;
  const [form, setForm] = useState(() => providerFormInitial(initial));

  const save = useMutation({
    mutationFn: (p: any) =>
      editing
        ? api.patch(`/admin/providers/${initial.id}`, p)
        : api.post("/admin/providers", p),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["providers-admin"] });
      onClose();
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!providerFormIsComplete(form)) return;
    save.mutate(providerFormPayload(form));
  }

  return (
    <Modal title={editing ? "ویرایش تأمین‌کننده" : "افزودن تأمین‌کننده"} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="row" style={{ gap: 12 }}>
          <div className="field grow">
            <label>کلید (key)</label>
            <input className="input mono" dir="ltr" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} required disabled={editing} />
          </div>
          <div className="field">
            <label>دسته</label>
            <select className="select" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required>
              <option value="zaryar">zaryar</option>
              <option value="talaab">talaab</option>
            </select>
          </div>
        </div>
        <div className="field">
          <label>نام فارسی</label>
          <input className="input" value={form.persianName} onChange={(e) => setForm({ ...form, persianName: e.target.value })} />
        </div>
        <div className="field">
          <label>آدرس پایه (baseUrl)</label>
          <input className="input mono" dir="ltr" value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })} required />
        </div>
        <div className="field">
          <label>آدرس API (اختیاری)</label>
          <input className="input mono" dir="ltr" value={form.apiBaseUrl} onChange={(e) => setForm({ ...form, apiBaseUrl: e.target.value })} />
        </div>
        <div className="field">
          <label>آدرس پنل وب (اختیاری)</label>
          <input className="input mono" dir="ltr" value={form.webPanelUrl} onChange={(e) => setForm({ ...form, webPanelUrl: e.target.value })} />
        </div>
        <div className="field">
          <label>تلفن (برای OTP)</label>
          <input className="input mono" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="field">
          <label>آدرس ارسال کد (sendOtpUrl)</label>
          <input className="input mono" dir="ltr" value={form.sendOtpUrl} onChange={(e) => setForm({ ...form, sendOtpUrl: e.target.value })} />
        </div>
        <div className="field">
          <label>آدرس تایید کد (verifyCodeUrl)</label>
          <input className="input mono" dir="ltr" value={form.verifyCodeUrl} onChange={(e) => setForm({ ...form, verifyCodeUrl: e.target.value })} />
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            بدون این دو آدرس، «فعال‌سازی OTP» کار نمی‌کند؛ موتور قیمت‌گذاری برای گرفتن و تایید کد پیامکی به آن‌ها درخواست می‌زند.
          </div>
        </div>
        <div className="field">
          <label>واحد قیمت اعلامی</label>
          <select
            className="select"
            value={form.priceUnit}
            onChange={(e) => setForm({ ...form, priceUnit: e.target.value })}
            required
          >
            <option value="TOMAN">تومان</option>
            <option value="IRR">ریال</option>
          </select>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            واحدی که این تأمین‌کننده قیمت‌ها را با آن اعلام می‌کند. قیمت‌های تومانی هنگام دریافت در ۱۰ ضرب و به ریال تبدیل می‌شوند؛ کل حسابداری سامانه بر مبنای ریال است.
          </div>
        </div>
        <div className="field">
          <label>
            <input
              type="checkbox"
              checked={form.useProxy}
              onChange={(e) => setForm({ ...form, useProxy: e.target.checked })}
            />
            <span style={{ marginRight: 6 }}>عبور از پروکسی</span>
          </label>
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            اگر این تأمین‌کننده فقط از داخل ایران در دسترس است، این گزینه را روشن بگذارید؛ همه ترافیک آن — دریافت و تایید کد، سفارش‌ها، موجودی و سوکت قیمت — از پروکسی خروجی موتور عبور می‌کند. برای تأمین‌کننده‌ای که مستقیم در دسترس است خاموشش کنید.
          </div>
        </div>
        {save.isError && <div className="error-text">{apiError(save.error)}</div>}
        <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
          <button className="btn primary" disabled={save.isPending}>
            {save.isPending ? <span className="spin" /> : "ذخیره"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * Activation by pasting a session the admin captured themselves.
 *
 * The OTP path only reaches a provider whose login is a plain exchange of a
 * phone number for a code. Behind a captcha or a second factor there is no such
 * exchange to drive, and this is the way in for those: sign in to the provider
 * in a real browser, copy the login response, paste it here.
 */
function ManualAuthPanel({
  provider,
  onClose,
}: {
  provider: Provider;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [raw, setRaw] = useState("");
  const parsed = raw.trim() ? parseProviderAuth(raw) : null;

  const activate = useMutation({
    mutationFn: (auth: Record<string, unknown>) =>
      api.post(`/admin/providers/${provider.id}/set-auth`, { auth }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["providers-admin"] });
      onClose();
    },
  });

  return (
    <>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        در پنل وب تأمین‌کننده وارد شوید، پاسخ درخواست لاگین را از تب Network کپی کنید و اینجا بچسبانید.
        {provider.webPanelUrl && (
          <>
            {" "}
            <a href={provider.webPanelUrl} target="_blank" rel="noreferrer" dir="ltr">
              {provider.webPanelUrl}
            </a>
          </>
        )}
      </div>
      <div className="field">
        <label>پاسخ لاگین (JSON)</label>
        <textarea
          className="input mono"
          dir="ltr"
          rows={7}
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='{"Data":{"user":{"token":"…","uId":"…"}}}'
        />
      </div>
      {parsed && !parsed.ok && <div className="error-text">{parsed.error}</div>}
      {parsed?.ok && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          ✓ شناسایی شد: <span dir="ltr">{parsed.value.recognised.join("، ")}</span>
        </div>
      )}
      {activate.isError && <div className="error-text">{apiError(activate.error)}</div>}
      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
        <button
          className="btn primary"
          disabled={activate.isPending || !parsed?.ok}
          onClick={() => parsed?.ok && activate.mutate(parsed.value.auth as Record<string, unknown>)}
        >
          {activate.isPending ? <span className="spin" /> : "ذخیره و فعال‌سازی"}
        </button>
      </div>
    </>
  );
}

function OtpPanel({
  provider,
  onClose,
}: {
  provider: Provider;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(provider.phone ?? "");
  const [otp, setOtp] = useState("");

  // The request now waits on the engine's real answer, which takes as long as
  // the provider takes to reply. Both buttons say so while they wait.
  const send = useMutation({
    mutationFn: () => api.post(`/admin/providers/${provider.id}/send-otp`, { phone }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["providers-admin"] }),
  });
  const verify = useMutation({
    mutationFn: () => api.post(`/admin/providers/${provider.id}/verify-otp`, { otp }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["providers-admin"] });
      onClose();
    },
  });

  return (
    <>
      <div className="field">
        <label>تلفن</label>
        <input
          className="input mono"
          dir="ltr"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          disabled={send.isPending || send.isSuccess}
        />
      </div>
      <div className="row" style={{ justifyContent: "flex-end", gap: 10, margin: "6px 0 14px" }}>
        <button className="btn sm" disabled={send.isPending || !phone.trim()} onClick={() => send.mutate()}>
          {send.isPending ? <span className="spin" /> : send.isSuccess ? "ارسال مجدد کد" : "ارسال کد"}
        </button>
      </div>
      {send.isPending && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          در حال درخواست کد از تأمین‌کننده…
        </div>
      )}
      {send.isError && <div className="error-text">{apiError(send.error)}</div>}
      {send.isSuccess && !send.isPending && (
        <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
          ✓ کد برای {phone} ارسال شد. کد دریافتی روی سیم‌کارت را وارد کنید.
        </div>
      )}
      <div className="field">
        <label>کد تایید</label>
        <input className="input mono" dir="ltr" value={otp} onChange={(e) => setOtp(e.target.value)} />
      </div>
      {verify.isError && <div className="error-text">{apiError(verify.error)}</div>}
      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
        <button className="btn primary" disabled={verify.isPending || !otp.trim()} onClick={() => verify.mutate()}>
          {verify.isPending ? <span className="spin" /> : "تایید و فعال‌سازی"}
        </button>
      </div>
    </>
  );
}

/**
 * The three ways a provider gets turned on, in one place.
 *
 * All reach the same end — stored credentials and a running provider — and
 * differ only in who performs the login. The OTP tab has the engine do it,
 * which works when the provider's login is a plain phone-for-code exchange.
 * The simulator has the admin do it in a real browser on the server, for a
 * login behind a captcha. The manual tab takes a session the admin captured
 * in their own browser, for when neither of the others fits.
 */
function ActivationModal({
  provider,
  onClose,
}: {
  provider: Provider;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"otp" | "simulator" | "manual">("otp");

  return (
    <Modal title={`فعال‌سازی ${provider.persianName || provider.key}`} onClose={onClose} wide>
      <div className="row" style={{ gap: 8, marginBottom: 14 }}>
        <button
          type="button"
          className={"btn sm " + (tab === "otp" ? "primary" : "ghost")}
          onClick={() => setTab("otp")}
        >
          کد پیامکی
        </button>
        <button
          type="button"
          className={"btn sm " + (tab === "simulator" ? "primary" : "ghost")}
          onClick={() => setTab("simulator")}
        >
          شبیه‌ساز مرورگر
        </button>
        <button
          type="button"
          className={"btn sm " + (tab === "manual" ? "primary" : "ghost")}
          onClick={() => setTab("manual")}
        >
          ورود دستی توکن
        </button>
      </div>
      {tab === "otp" && <OtpPanel provider={provider} onClose={onClose} />}
      {tab === "simulator" && (
        <BrowserSimulator
          providerId={provider.id}
          providerKey={provider.persianName || provider.key}
          onActivated={() => {
            qc.invalidateQueries({ queryKey: ["providers-admin"] });
            onClose();
          }}
        />
      )}
      {tab === "manual" && <ManualAuthPanel provider={provider} onClose={onClose} />}
    </Modal>
  );
}

export default function ProvidersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<{ open: boolean; initial?: Provider }>({ open: false });
  const [otpFor, setOtpFor] = useState<Provider | null>(null);

  const providers = useQuery({
    queryKey: ["providers-admin"],
    queryFn: async () => unwrap<Provider[]>((await api.get("/admin/providers")).data),
  });

  const toggle = useMutation({
    mutationFn: (id: string) => api.post(`/admin/providers/${id}/toggle-active`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["providers-admin"] }),
  });
  const reconcile = useMutation({
    mutationFn: () => api.post("/admin/providers/reconcile"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["providers-admin"] }),
  });
  const refresh = useMutation({
    mutationFn: (key: string) => api.post(`/admin/providers/${key}/refresh`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["providers-admin"] }),
  });

  const list = Array.isArray(providers.data) ? providers.data : [];

  return (
    <>
      <Card
        title="تأمین‌کنندگان قیمت"
        action={
          <div className="row" style={{ gap: 8 }}>
            <button className="btn sm" disabled={reconcile.isPending} onClick={() => reconcile.mutate()}>
              {reconcile.isPending ? <span className="spin" /> : "همگام‌سازی"}
            </button>
            <button className="btn primary sm" onClick={() => setForm({ open: true })}>
              + تأمین‌کننده جدید
            </button>
          </div>
        }
      >
        <div className="muted" style={{ fontSize: 12, marginBottom: 12 }}>
          مدیریت تأمین‌کنندگان از این پنل انجام می‌شود؛ تغییرات از طریق صف فرمان به موتور قیمت‌گذاری ارسال و وضعیت اتصال به‌صورت خودکار بازتاب می‌یابد.
        </div>
        {form.open && <ProviderForm initial={form.initial} onClose={() => setForm({ open: false })} />}
      </Card>

      <Card title="لیست تأمین‌کنندگان">
        {toggle.isError && <div className="error-text">{apiError(toggle.error)}</div>}
        {providers.isLoading ? (
          <Loading />
        ) : providers.isError ? (
          <ErrorState message={apiError(providers.error)} />
        ) : list.length === 0 ? (
          <Empty label="تأمین‌کننده‌ای ثبت نشده است" />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>نام</th>
                  <th>کلید</th>
                  <th>دسته</th>
                  <th>واحد قیمت</th>
                  <th>پروکسی</th>
                  <th>تلفن</th>
                  <th>وضعیت</th>
                  <th>فعال</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>{p.persianName || "—"}</td>
                    <td className="mono">{p.key}</td>
                    <td>{p.category}</td>
                    <td>
                      <Badge kind={p.priceUnit === "IRR" ? "green" : "gold"}>
                        {PRICE_UNIT_LABEL[p.priceUnit ?? "TOMAN"]}
                      </Badge>
                    </td>
                    <td>
                      {p.useProxy === false
                        ? <Badge kind="gray">مستقیم</Badge>
                        : <Badge kind="gold">از پروکسی</Badge>}
                    </td>
                    <td className="mono" dir="ltr">{p.phone || "—"}</td>
                    <td>
                      <Badge kind={STATUS_KIND[p.status] ?? "gray"}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </td>
                    <td>{p.active ? <Badge kind="green">فعال</Badge> : <Badge kind="red">غیرفعال</Badge>}</td>
                    <td>
                      <div className="row">
                        {/* A provider the engine reports but the backend could not
                            adopt has no id, and every id-addressed route would
                            resolve to /admin/providers/undefined/…. Show it, but
                            offer only the actions keyed by `key`. */}
                        <button className="btn sm" disabled={!p.id} onClick={() => setForm({ open: true, initial: p })}>ویرایش</button>
                        <button className="btn sm" onClick={() => setOtpFor(p)} disabled={p.active || !p.id}>فعال‌سازی</button>
                        <button className="btn sm" disabled={refresh.isPending} onClick={() => refresh.mutate(p.key)}>بازنشانی</button>
                        <button
                          className={"btn sm " + (p.active ? "danger" : "")}
                          disabled={toggle.isPending || !p.id}
                          onClick={() => toggle.mutate(p.id)}
                        >
                          {p.active ? "غیرفعال کن" : "فعال کن"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {otpFor && <ActivationModal provider={otpFor} onClose={() => setOtpFor(null)} />}
    </>
  );
}
