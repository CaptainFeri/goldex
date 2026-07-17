import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api, getToken, setToken, clearToken, unwrap } from "../api/client";
import type { VerifyOtpResult } from "../api/types";

interface AuthState {
  token: string | null;
  admin: VerifyOtpResult["admin"] | null;
}

interface AuthCtx extends AuthState {
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, otp: string) => Promise<void>;
  logout: () => void;
  checkSession: () => Promise<boolean>;
}

const Ctx = createContext<AuthCtx>(null as any);

const ADMIN_KEY = "goldex_admin_profile";

function loadAdmin(): AuthState["admin"] {
  try {
    const raw = localStorage.getItem(ADMIN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    token: getToken(),
    admin: loadAdmin(),
  });

  async function checkSession(): Promise<boolean> {
    try {
      await api.head("/admin/auth/auth");
      return true;
    } catch {
      clearToken();
      localStorage.removeItem(ADMIN_KEY);
      setState({ token: null, admin: null });
      return false;
    }
  }

  useEffect(() => {
    if (state.token) {
      checkSession();
    }
  }, []);

  async function sendOtp(phone: string) {
    await api.post("/admin/auth/send-otp", { phone });
  }

  async function verifyOtp(phone: string, otp: string) {
    const res = await api.post("/admin/auth/verify-otp", { phone, otp });
    const data = unwrap<VerifyOtpResult>(res.data);
    setToken(data.access_token);
    localStorage.setItem(ADMIN_KEY, JSON.stringify(data.admin));
    setState({ token: data.access_token, admin: data.admin });
  }

  function logout() {
    clearToken();
    localStorage.removeItem(ADMIN_KEY);
    setState({ token: null, admin: null });
  }

  return <Ctx.Provider value={{ ...state, sendOtp, verifyOtp, logout, checkSession }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  return useContext(Ctx);
}
