import { useCallback, useEffect, useRef, useState } from "react";
import { api, unwrap, apiError } from "../api/client";
import { Modal, ErrorState } from "./ui";
import { fmtNum } from "../lib/format";
import { hashPayload, refKeyOf } from "../lib/operation-otp";

interface OtpChallenge {
  challengeId: string;
  expiresIn: number;
  maskedPhone: string;
}

const ERRORS: Record<string, string> = {
  "OTP.EXPIRED": "مهلت این کد به پایان رسیده است. کد تازه‌ای بگیرید.",
  "OTP.INVALID": "کد وارد شده درست نیست.",
  "OTP.TOO_MANY_ATTEMPTS": "تعداد تلاش‌ها بیش از حد مجاز بود. کد تازه‌ای بگیرید.",
  "OTP.CHALLENGE_MISMATCH": "این کد برای عملیات دیگری صادر شده است.",
  "OTP.PAYLOAD_MISMATCH":
    "مشخصات عملیات از زمان دریافت کد تغییر کرده است. برای همین مبلغ و همین سند، کد تازه‌ای بگیرید.",
  "OTP.NO_PHONE_ON_FILE": "برای حساب شما شماره موبایلی ثبت نشده است.",
  "SMS.SEND_FAILED": "ارسال پیامک ناموفق بود. دوباره تلاش کنید.",
};

function otpError(e: unknown): string {
  const raw = apiError(e);
  for (const [code, message] of Object.entries(ERRORS)) {
    if (raw.includes(code)) return message;
  }
  return raw;
}

/**
 * Confirms one operation with a code sent to the operator's own phone.
 *
 * `payload` must be the same object the action will submit. The server
 * recomputes the hash from the body it receives, so anything that changes
 * between requesting the code and confirming — the amount above all — makes
 * the code refuse rather than approve the wrong thing.
 */
export default function OtpConfirmModal({
  title,
  description,
  scope,
  refId,
  refIds,
  fields,
  payload,
  confirmLabel = "تأیید",
  pending,
  /** The action's own failure, so a refused code is visible where it happened. */
  actionError,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: string;
  scope: string;
  refId?: string;
  refIds?: string[];
  /** The scope's declared fields, in order — from GET /admin/operations/otp/scopes. */
  fields: string[];
  payload: Record<string, unknown>;
  confirmLabel?: string;
  pending?: boolean;
  actionError?: unknown;
  onConfirm: (confirmation: { challengeId: string; otp: string }) => void;
  onClose: () => void;
}) {
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);
  const requestedRef = useRef(false);

  const request = useCallback(async () => {
    setRequesting(true);
    setError(null);
    try {
      const key = await refKeyOf(refId ?? null, refIds ?? null);
      const payloadHash = await hashPayload(scope, key, fields, payload);
      const res = await api.post("/admin/operations/otp", {
        scope,
        refId,
        refIds,
        payloadHash,
      });
      const data = unwrap<OtpChallenge>(res.data);
      setChallenge(data);
      setSecondsLeft(data.expiresIn);
    } catch (e) {
      const raw = apiError(e);
      // A live challenge from a previous attempt: count it down rather than
      // texting the operator again.
      const alreadySent = raw.match(/OTP\.ALREADY_SENT:(\d+)/);
      if (alreadySent) {
        setSecondsLeft(Number(alreadySent[1]));
        setError("کدی که پیش‌تر فرستاده شد هنوز معتبر است؛ همان را وارد کنید.");
      } else {
        setError(otpError(e));
      }
    } finally {
      setRequesting(false);
    }
  }, [scope, refId, refIds, fields, payload]);

  // Once, on open. A dependency-driven effect would re-request every time the
  // parent re-rendered and handed down a fresh `payload` object.
  useEffect(() => {
    if (requestedRef.current) return;
    requestedRef.current = true;
    void request();
  }, [request]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  const expired = secondsLeft <= 0;
  // A challenge is needed to confirm; after ALREADY_SENT we have a countdown
  // but no id, so the operator must re-request once it lapses.
  const canConfirm = !!challenge && !expired && otp.trim().length >= 4 && !pending;

  return (
    <Modal title={title} onClose={onClose}>
      {description && <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>{description}</p>}

      <p style={{ fontSize: 13 }}>
        {challenge
          ? <>کد تأیید به شماره <span dir="ltr">{challenge.maskedPhone}</span> فرستاده شد.</>
          : requesting
            ? "در حال ارسال کد…"
            : "برای ادامه، کد تأیید لازم است."}
      </p>

      <label>
        <span>کد تأیید</span>
        <input
          className="input"
          dir="ltr"
          inputMode="numeric"
          autoFocus
          value={otp}
          onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canConfirm && challenge) {
              onConfirm({ challengeId: challenge.challengeId, otp });
            }
          }}
        />
      </label>

      <div className="row spread" style={{ marginTop: 8 }}>
        <span className="muted" style={{ fontSize: 12 }}>
          {expired ? "مهلت کد تمام شد." : `اعتبار کد: ${fmtNum(secondsLeft)} ثانیه`}
        </span>
        <button
          className="btn ghost sm"
          disabled={!expired || requesting}
          onClick={() => void request()}
        >
          {requesting ? "…" : "ارسال دوباره"}
        </button>
      </div>

      {/* Both are shown: one is "the code could not be sent", the other is
          "the code was refused" — they are different problems. */}
      {error && <ErrorState message={error} />}
      {actionError != null && <ErrorState message={otpError(actionError)} />}

      <div className="row" style={{ gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
        <button className="btn ghost" onClick={onClose}>انصراف</button>
        <button
          className="btn"
          disabled={!canConfirm}
          onClick={() => challenge && onConfirm({ challengeId: challenge.challengeId, otp })}
        >
          {pending ? "در حال انجام…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

export { otpError };
