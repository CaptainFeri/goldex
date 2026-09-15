import { useCallback, useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { api, apiError, getToken, unwrap } from "../../api/client";
import {
  keyEvent,
  mouseEvent,
  toRemotePoint,
  wheelEvent,
  type Viewport,
} from "../../lib/browser-input";

interface BrowserSession {
  id: string;
  providerKey: string;
  loginUrl: string;
  currentUrl: string;
  allowedHosts: string[];
  expiresAt: string;
  captured: boolean;
  blockAppDownloads: boolean;
}

/** The remote viewport, fixed server-side; frames arrive at this size. */
const REMOTE: Viewport = { width: 1280, height: 800 };

/**
 * A real browser, running on the server, that the admin drives to sign in to a
 * provider.
 *
 * For a provider whose login the engine cannot drive — behind a captcha, or a
 * second factor — this is the way in: the admin does the login here, with a
 * real mouse on a real page, and the credentials are read out of the browser's
 * own network layer rather than by injecting anything into the provider's page.
 *
 * The picture is JPEG frames on a canvas; clicks and keystrokes go back the
 * same way. The canvas is scaled to fit, so every coordinate is converted back
 * into the remote page's pixels before it is sent.
 */
export default function BrowserSimulator({
  providerId,
  providerKey,
  onActivated,
}: {
  providerId: string;
  providerKey: string;
  onActivated: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [session, setSession] = useState<BrowserSession | null>(null);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [captured, setCaptured] = useState<{ fields: string[]; sourceUrl: string } | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState("");
  /**
   * The open session, for the unmount cleanup below — which cannot read state
   * captured at mount time.
   */
  const sessionRef = useRef<BrowserSession | null>(null);
  const [blockApp, setBlockApp] = useState(true);
  const [steering, setSteering] = useState(false);

  /**
   * Steering the page: a new address, reload, back, or the app-download
   * toggle. The address a provider is configured with is a guess about where
   * its login lives, and a person watching a browser can just try the next one.
   */
  const control = useCallback(
    (message: string, payload: Record<string, unknown> = {}) => {
      if (!socketRef.current || !session) return;
      setSteering(true);
      setError("");
      socketRef.current.emit(
        "control",
        { sessionId: session.id, message, payload },
        (reply: { ok: boolean; error?: string; currentUrl?: string }) => {
          setSteering(false);
          if (!reply?.ok) setError(reply?.error ?? "مرورگر پاسخ نداد");
          else if (reply.currentUrl) setAddress(reply.currentUrl);
        },
      );
    },
    [session],
  );

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  /**
   * Closes the browser if the admin simply closes the modal.
   *
   * Leaving it to the ten-minute TTL meant the provider stayed occupied, and
   * the next attempt to open one was refused as already open — so walking away
   * from a session locked the provider out of the feature for ten minutes.
   * Activating or stopping already closes it; this is the path where they just
   * leave.
   */
  useEffect(
    () => () => {
      const id = sessionRef.current?.id;
      if (!id) return;
      void api.delete(`/admin/providers/browser-session/${id}`).catch(() => undefined);
    },
    [],
  );

  const send = useCallback((event: Record<string, unknown> | null) => {
    if (!event || !socketRef.current || !session) return;
    socketRef.current.emit("input", { sessionId: session.id, event });
  }, [session]);

  const remotePointFrom = (e: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return toRemotePoint(e.clientX - rect.left, e.clientY - rect.top, rect, REMOTE);
  };

  // Frames arrive faster than they need to be painted; drawing on the next
  // animation frame keeps a slow canvas from queueing up behind the stream.
  useEffect(() => {
    if (!session) return;
    const token = getToken();
    if (!token) return;

    const socket = io("/admin-provider-browser", {
      auth: { token },
      transports: ["websocket"],
    });
    socketRef.current = socket;

    let pending: string | null = null;
    let scheduled = false;
    const paint = () => {
      scheduled = false;
      const data = pending;
      pending = null;
      const canvas = canvasRef.current;
      if (!data || !canvas) return;
      const image = new Image();
      image.onload = () => {
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(image, 0, 0, canvas.width, canvas.height);
      };
      image.src = `data:image/jpeg;base64,${data}`;
    };

    socket.on("connect", () => {
      socket.emit("watch", { sessionId: session.id }, (reply: { ok: boolean; error?: string }) => {
        if (!reply?.ok) setError(reply?.error ?? "اتصال به مرورگر برقرار نشد");
        else setStatus("متصل — وارد پنل تأمین‌کننده شوید");
      });
    });
    socket.on("frame", ({ data }: { data: string }) => {
      pending = data;
      if (!scheduled) {
        scheduled = true;
        requestAnimationFrame(paint);
      }
    });
    socket.on("captured", (payload: { fields: string[]; sourceUrl: string }) => {
      setCaptured(payload);
      setStatus("✓ ورود موفق شناسایی شد");
    });
    socket.on("blocked", ({ url }: { url: string }) => {
      setBlocked((prev) => (prev.includes(url) ? prev : [...prev.slice(-4), url]));
    });
    // The canvas stays blank when a page fails to load, and the reason would
    // otherwise only exist in a container log the admin cannot read.
    socket.on("navigation-failed", ({ message }: { message: string }) => {
      setError(message);
      setStatus("");
    });
    socket.on("closed", ({ reason }: { reason: string }) => {
      setStatus(reason === "expired" ? "مهلت نشست تمام شد" : "نشست بسته شد");
      setSession(null);
    });
    socket.on("connect_error", (err) => setError(err.message));

    return () => {
      socket.emit("unwatch", { sessionId: session.id });
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [session]);

  // Keystrokes are captured on the window while a session is open, so the admin
  // does not have to keep a canvas focused to type into the remote page.
  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => {
      // …but not the ones meant for this panel's own fields. Forwarding every
      // key on the window swallowed the address bar: preventDefault on keydown
      // stops the character ever reaching the input the admin is typing into.
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key === "Escape") return; // left to the modal, to close it
      e.preventDefault();
      send(keyEvent(e.type === "keydown" ? "keyDown" : "keyUp", e));
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [session, send]);

  async function start() {
    setBusy(true);
    setError("");
    setBlocked([]);
    setCaptured(null);
    try {
      const data = await api.post(`/admin/providers/${providerId}/browser-session`);
      const opened = unwrap<BrowserSession>(data.data);
      setSession(opened);
      // The session is handed back before the first navigation finishes, so the
      // page is still on about:blank — a real URL string, and a useless one to
      // put in front of the admin. Where it is going is what they want to see.
      const settled = opened.currentUrl && opened.currentUrl !== "about:blank";
      setAddress(settled ? opened.currentUrl : opened.loginUrl);
      setBlockApp(opened.blockAppDownloads ?? true);
      setStatus("در حال باز کردن مرورگر…");
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (!session) return;
    setBusy(true);
    setError("");
    try {
      await api.post(`/admin/providers/${providerId}/browser-session/${session.id}/activate`);
      setSession(null);
      onActivated();
    } catch (err) {
      setError(apiError(err));
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (!session) return;
    const id = session.id;
    setSession(null);
    await api.delete(`/admin/providers/browser-session/${id}`).catch(() => undefined);
    setStatus("نشست بسته شد");
  }

  return (
    <>
      <div className="muted" style={{ fontSize: 12, marginBottom: 10 }}>
        یک مرورگر واقعی روی سرور باز می‌شود و صفحهٔ ورود «{providerKey}» را نشان می‌دهد. همان‌جا وارد
        شوید — اگر کپچا داشت، خودتان حلش کنید. به‌محض موفقیت ورود، اطلاعات نشست خودکار شناسایی می‌شود.
      </div>

      {!session ? (
        <div className="row" style={{ justifyContent: "flex-end", gap: 10 }}>
          <button className="btn primary" disabled={busy} onClick={start}>
            {busy ? <span className="spin" /> : "باز کردن مرورگر"}
          </button>
        </div>
      ) : (
        <>
          <form
            className="row"
            style={{ gap: 6, marginBottom: 8 }}
            onSubmit={(e) => {
              e.preventDefault();
              if (address.trim()) control("navigate", { url: address.trim() });
            }}
          >
            <button type="button" className="btn sm" disabled={steering} onClick={() => control("page-action", { action: "back" })}>
              ←
            </button>
            <button type="button" className="btn sm" disabled={steering} onClick={() => control("page-action", { action: "reload" })}>
              ⟳
            </button>
            <input
              className="input mono grow"
              dir="ltr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="https://…"
            />
            <button className="btn sm primary" disabled={steering || !address.trim()}>
              برو
            </button>
          </form>

          <div className="row" style={{ gap: 6, marginBottom: 8 }}>
            <label className="muted" style={{ fontSize: 12 }}>
              <input
                type="checkbox"
                checked={blockApp}
                onChange={(e) => {
                  setBlockApp(e.target.checked);
                  control("set-block-app-downloads", { enabled: e.target.checked });
                }}
              />
              <span style={{ marginRight: 6 }}>
                دانلود اپ و پاپ‌آپ سایت رد شود
              </span>
            </label>
            <span className="muted" style={{ fontSize: 11 }}>
              اگر صفحه نمی‌آید، خاموشش کنید تا سایت طبیعی رفتار کند و خودتان پاپ‌آپ را ببندید.
            </span>
          </div>

          <div
            style={{
              position: "relative",
              width: "100%",
              aspectRatio: `${REMOTE.width} / ${REMOTE.height}`,
              background: "#111",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <canvas
              ref={canvasRef}
              width={REMOTE.width}
              height={REMOTE.height}
              style={{ width: "100%", height: "100%", cursor: "crosshair", display: "block" }}
              onMouseDown={(e) => send(mouseEvent("mousePressed", remotePointFrom(e), e.button))}
              onMouseUp={(e) => send(mouseEvent("mouseReleased", remotePointFrom(e), e.button))}
              onMouseMove={(e) => send(mouseEvent("mouseMoved", remotePointFrom(e)))}
              onWheel={(e) => send(wheelEvent(remotePointFrom(e), e.deltaX, e.deltaY))}
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>

          <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            {status}
            {session.allowedHosts.length > 0 && (
              <>
                {" · "}دسترسی محدود به: <span dir="ltr">{session.allowedHosts.join("، ")}</span>
              </>
            )}
          </div>

          {blocked.length > 0 && (
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              مسدود شد (خارج از دامنهٔ این تأمین‌کننده): <span dir="ltr">{blocked.join(" · ")}</span>
            </div>
          )}

          {captured && (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
              ✓ شناسایی شد: <span dir="ltr">{captured.fields.join("، ")}</span>
            </div>
          )}

          {error && <div className="error-text">{error}</div>}

          <div className="row" style={{ justifyContent: "flex-end", gap: 10, marginTop: 10 }}>
            <button type="button" className="btn ghost" onClick={stop}>
              بستن مرورگر
            </button>
            <button className="btn primary" disabled={busy || !captured} onClick={activate}>
              {busy ? <span className="spin" /> : "ذخیره و فعال‌سازی"}
            </button>
          </div>
        </>
      )}

      {!session && error && <div className="error-text">{error}</div>}
      {!session && status && (
        <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>{status}</div>
      )}
    </>
  );
}
