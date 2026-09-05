import { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from "react";
import { adminNotificationSocket } from "../api/admin-socket";
import { getToken } from "../api/client";

interface Toast {
  id: number;
  title: string;
  body?: string;
  kind?: "info" | "success" | "error";
  metadata?: Record<string, any>;
}

interface NotifyCtx {
  notify: (t: Omit<Toast, "id">) => void;
}

const Ctx = createContext<NotifyCtx>(null as any);

let nextId = 1;

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const authCheck = useRef(false);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { ...t, id }]);
      window.setTimeout(() => dismiss(id), 6000);
    },
    [dismiss]
  );

  useEffect(() => {
    if (!getToken() || authCheck.current) return;
    authCheck.current = true;

    const cleanup = adminNotificationSocket.connect((payload: any) => {
      const kind = payload?.type === "error" ? "error" : payload?.type === "success" ? "success" : "info";
      notify({
        title: payload?.title ?? "اعلان جدید",
        body: payload?.body,
        kind,
        metadata: payload?.metadata,
      });
    });

    return cleanup;
  }, [notify]);

  return (
    <Ctx.Provider value={{ notify }}>
      {children}
      <div className="admin-toast-container">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`admin-toast admin-toast-${t.kind ?? "info"}`}
            onClick={() => dismiss(t.id)}
          >
            <div className="admin-toast-title">{t.title}</div>
            {t.body && <div>{t.body}</div>}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useNotify() {
  return useContext(Ctx);
}
