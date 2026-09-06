import { useQuery } from "@tanstack/react-query";
import { api, unwrap } from "../api/client";

/**
 * The caller's permission keys, read live from the server.
 *
 * Deliberately not taken from the cached login profile: a role can be changed
 * while someone is signed in, and a stale cached copy would show them a sidebar
 * full of pages the server then refuses. The server is the authority — this
 * only decides what to render.
 */
export function usePermissions() {
  const q = useQuery({
    queryKey: ["me-permissions"],
    queryFn: async () => unwrap<string[]>((await api.get("/admin/me/permissions")).data),
    staleTime: 60_000,
  });

  const keys = q.data;
  return {
    /** Undefined until loaded, so callers can hold off rather than flash a wrong menu. */
    permissions: keys,
    isLoading: q.isLoading,
    can: (key: string) => !!keys?.includes(key),
    canAny: (want: string[]) => want.length === 0 || want.some((k) => keys?.includes(k)),
  };
}
