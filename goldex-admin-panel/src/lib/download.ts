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

/**
 * Pull a signed file URL and hand the bytes to the browser.
 *
 * A signed URL carries its own credential, so it needs no Authorization header
 * and could in principle be navigated to directly — but then the browser saves
 * whatever comes back. When the object behind the URL is missing or the token
 * has expired, that is an error body written into the operator's downloads
 * folder under a `.xlsx` name, which opens as a corrupt spreadsheet and looks
 * like a broken export rather than a failed request. Fetching it first lets a
 * failure be reported as one.
 */
export async function downloadSignedFile(url: string, fileName: string): Promise<void> {
  const blob = await fetchSignedFile(url);
  saveBlob(blob, fileName);
}

/** The bytes behind a signed URL, or an error carrying what the server said. */
export async function fetchSignedFile(url: string): Promise<Blob> {
  const res = await fetch(url, { credentials: "same-origin" });

  if (!res.ok) {
    throw new Error(await serverMessage(res));
  }

  const blob = await res.blob();
  // A JSON body or an empty one is never the file, whatever the status line
  // said — treat it as the failure it is instead of saving it.
  if (blob.size === 0 || blob.type.startsWith("application/json")) {
    const body = blob.size === 0 ? "" : await blob.text();
    throw new Error(messageFrom(body) ?? "فایل دریافت‌شده خالی یا نامعتبر است");
  }
  return blob;
}

/** Save a blob under a file name, revoking the object URL straight after. */
export function saveBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    // Appended before the click: a detached anchor is ignored in Firefox.
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function serverMessage(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  return messageFrom(body) ?? `دریافت فایل ناموفق بود (${res.status})`;
}

/** The API's `message` when the body is its usual envelope, otherwise nothing. */
function messageFrom(body: string): string | null {
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.message ?? parsed?.error;
    return typeof message === "string" && message ? message : null;
  } catch {
    return null;
  }
}
