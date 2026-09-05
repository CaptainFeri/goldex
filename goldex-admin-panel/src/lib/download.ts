import { api } from "../api/client";

/**
 * Fetch a guarded export endpoint and hand the file to the browser.
 *
 * These endpoints stream the bytes behind a bearer token, so a plain `<a href>`
 * would arrive unauthenticated. The response is pulled through axios and
 * released as an object URL instead — and revoked immediately after, since a
 * leaked one keeps the whole blob in memory for the life of the document.
 */
export async function downloadExport(
  path: string,
  params: Record<string, unknown>,
  fileName: string,
): Promise<void> {
  const res = await api.get(path, { params, responseType: "blob" });
  const url = URL.createObjectURL(new Blob([res.data]));
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** `name-YYYY-MM-DD.xlsx`, matching what the server sets in its own header. */
export const stampedName = (name: string) =>
  `${name}-${new Date().toISOString().slice(0, 10)}.xlsx`;
