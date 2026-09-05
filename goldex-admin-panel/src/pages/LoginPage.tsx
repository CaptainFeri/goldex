import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/auth";
import { apiError } from "../api/client";

export default function LoginPage() {
  const { sendOtp, verifyOtp, token } = useAuth();
  const nav = useNavigate();
  const [step, setStep] = useState<"phone" | "password" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (token) {
    nav("/", { replace: true });
  }

  async function submitPhone(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!/^09[0-9]{9}$/.test(phone)) {
      setErr("شماره موبایل معتبر نیست (۰۹xxxxxxxxx)");
      return;
    }
    setStep("password");
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (password.length < 6) {
      setErr("رمز عبور باید حداقل ۶ کاراکتر باشد");
      return;
    }
    setBusy(true);
    try {
      await sendOtp(phone, password);
      setStep("otp");
    } catch (e) {
      setErr(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      await verifyOtp(phone, otp);
      nav("/", { replace: true });
    } catch (e) {
      setErr(apiError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="brand" style={{ padding: "0 0 20px" }}>
          <div className="brand-logo">G</div>
          <div>
            <div className="brand-name">Goldex</div>
            <div className="brand-sub">پنل مدیریت</div>
          </div>
        </div>

        {step === "phone" ? (
          <form onSubmit={submitPhone}>
            <div className="login-title">ورود مدیران</div>
            <div className="login-sub">شماره موبایل خود را وارد کنید.</div>
            <div className="field">
              <label>شماره موبایل</label>
              <input
                className="input mono"
                placeholder="09123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value.trim())}
                autoFocus
                dir="ltr"
              />
            </div>
            <button className="btn primary" style={{ width: "100%" }} disabled={busy}>
              {busy ? <span className="spin" /> : "ادامه"}
            </button>
            <div className="error-text">{err}</div>
          </form>
        ) : step === "password" ? (
          <form onSubmit={submitPassword}>
            <div className="login-title">ورود مدیران</div>
            <div className="login-sub">رمز عبور حساب خود را وارد کنید تا کد تأیید ارسال شود.</div>
            <div className="field">
              <label>رمز عبور</label>
              <input
                className="input"
                type="password"
                placeholder="••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                dir="ltr"
              />
            </div>
            <button className="btn primary" style={{ width: "100%" }} disabled={busy}>
              {busy ? <span className="spin" /> : "ارسال کد"}
            </button>
            <button
              type="button"
              className="btn ghost sm"
              style={{ width: "100%", marginTop: 10 }}
              onClick={() => {
                setStep("phone");
                setPassword("");
                setErr("");
              }}
            >
              تغییر شماره
            </button>
            <div className="error-text">{err}</div>
          </form>
        ) : (
          <form onSubmit={submitOtp}>
            <div className="login-title">کد تأیید</div>
            <div className="login-sub">
              کد ۵ رقمی ارسال‌شده به <b dir="ltr">{phone}</b> را وارد کنید.
            </div>
            <div className="field">
              <label>کد یک‌بارمصرف</label>
              <input
                className="input mono"
                placeholder="-----"
                value={otp}
                onChange={(e) => setOtp(e.target.value.trim())}
                maxLength={5}
                autoFocus
                dir="ltr"
                style={{ letterSpacing: "0.4em", textAlign: "center", fontSize: 20 }}
              />
            </div>
            <button className="btn primary" style={{ width: "100%" }} disabled={busy}>
              {busy ? <span className="spin" /> : "ورود"}
            </button>
            <button
              type="button"
              className="btn ghost sm"
              style={{ width: "100%", marginTop: 10 }}
              onClick={() => {
                setStep("password");
                setOtp("");
                setErr("");
              }}
            >
              تغییر رمز
            </button>
            <div className="error-text">{err}</div>
          </form>
        )}
      </div>
    </div>
  );
}
