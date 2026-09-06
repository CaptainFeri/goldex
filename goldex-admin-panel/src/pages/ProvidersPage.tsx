import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, unwrap, apiError } from "../api/client";
import { Card, Loading, ErrorState, Empty, Badge, Modal } from "../components/ui";

interface Provider {
  id: string;
  key: string;
  category: string;
  baseUrl: string;
  apiBaseUrl?: string;
  persianName?: string;
  phone?: string;
  /** Unit the provider quotes in; the engine converts everything to Rial. */
  priceUnit?: "IRR" | "TOMAN";
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

const emptyForm = {
  key: "",
  category: "zaryar",
  baseUrl: "",
  apiBaseUrl: "",
  persianName: "",
  phone: "",
  priceUnit: "TOMAN",
  sendOtpUrl: "",
  verifyCodeUrl: "",
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
  const [form, setForm] = useState(initial ? {
    key: initial.key,
    category: initial.category,
    baseUrl: initial.baseUrl,
    apiBaseUrl: initial.apiBaseUrl ?? "",
    persianName: initial.persianName ?? "",
    phone: initial.phone ?? "",
    priceUnit: initial.priceUnit ?? "TOMAN",
    sendOtpUrl: "",
    verifyCodeUrl: "",
  } : emptyForm);

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
    if (!form.key || !form.category || !form.baseUrl) return;
    save.mutate({
      key: form.key.trim(),
      category: form.category,
      baseUrl: form.baseUrl.trim(),
      apiBaseUrl: form.apiBaseUrl.trim() || undefined,
      persianName: form.persianName.trim() || undefined,
      phone: form.phone.trim(),
      priceUnit: form.priceUnit,
      sendOtpUrl: form.sendOtpUrl.trim() || undefined,
      verifyCodeUrl: form.verifyCodeUrl.trim() || undefined,
    });
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
          <label>تلفن (برای OTP)</label>
          <input className="input mono" dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
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

function OtpModal({
  provider,
  onClose,
}: {
  provider: Provider;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [phone, setPhone] = useState(provider.phone ?? "");
  const [otp, setOtp] = useState("");

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
    <Modal title={`فعال‌سازی ${provider.key}`} onClose={onClose}>
      <div className="field">
        <label>تلفن</label>
        <input className="input mono" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="row" style={{ justifyContent: "flex-end", gap: 10, margin: "6px 0 14px" }}>
        <button className="btn sm" disabled={send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? <span className="spin" /> : "ارسال کد"}
        </button>
      </div>
      {send.isError && <div className="error-text">{apiError(send.error)}</div>}
      <div className="field">
        <label>کد تایید</label>
        <input className="input mono" dir="ltr" value={otp} onChange={(e) => setOtp(e.target.value)} />
      </div>
      <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
        <button type="button" className="btn ghost" onClick={onClose}>انصراف</button>
        <button className="btn primary" disabled={verify.isPending || !otp} onClick={() => verify.mutate()}>
          {verify.isPending ? <span className="spin" /> : "تایید و فعال‌سازی"}
        </button>
      </div>
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
                    <td className="mono" dir="ltr">{p.phone || "—"}</td>
                    <td>
                      <Badge kind={STATUS_KIND[p.status] ?? "gray"}>
                        {STATUS_LABEL[p.status] ?? p.status}
                      </Badge>
                    </td>
                    <td>{p.active ? <Badge kind="green">فعال</Badge> : <Badge kind="red">غیرفعال</Badge>}</td>
                    <td>
                      <div className="row">
                        <button className="btn sm" onClick={() => setForm({ open: true, initial: p })}>ویرایش</button>
                        <button className="btn sm" onClick={() => setOtpFor(p)} disabled={p.active}>فعال‌سازی OTP</button>
                        <button className="btn sm" disabled={refresh.isPending} onClick={() => refresh.mutate(p.key)}>بازنشانی</button>
                        <button
                          className={"btn sm " + (p.active ? "danger" : "")}
                          disabled={toggle.isPending}
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

      {otpFor && <OtpModal provider={otpFor} onClose={() => setOtpFor(null)} />}
    </>
  );
}
