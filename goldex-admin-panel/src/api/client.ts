import axios from "axios";

const TOKEN_KEY = "goldex_admin_token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export const api = axios.create({
  baseURL: "/api/v1",
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// On 401 the token is stale/invalid — drop it and bounce to login.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      clearToken();
      if (!location.pathname.startsWith("/login")) {
        location.href = "/login";
      }
    }
    return Promise.reject(err);
  }
);

// The backend wraps every payload as { status, message, data, errors }.
export function unwrap<T>(payload: any): T {
  return (payload?.data ?? payload) as T;
}

export function apiError(err: any): string {
  return (
    err?.response?.data?.message ||
    err?.response?.data?.errors?.message ||
    err?.message ||
    "خطای ناشناخته"
  );
}
