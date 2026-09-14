/**
 * Recognising the moment a login succeeded, from outside the page.
 *
 * The Android app this replaces injected a script that wrapped `fetch` and
 * `XMLHttpRequest` from inside the provider's own page. That broke whenever the
 * page changed how it made requests. Here the responses are read at the
 * browser's network layer instead, so nothing is injected and nothing to break:
 * the page is untouched and behaves exactly as it would for a person.
 *
 * What a successful login answers with differs per provider — Zaryar nests the
 * session under `Data.user`, Talaab under `data`, and either may answer with
 * the session alone. All are read; a non-empty token is what makes a response a
 * login rather than any other JSON the page happens to fetch.
 */

export interface CapturedAuth {
  auth: Record<string, string | number>;
  /** Where it came from, for the activation log. */
  sourceUrl: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function tokenOf(candidate: Record<string, unknown> | null): string | null {
  if (!candidate) return null;
  const token = candidate.token;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

/**
 * Finds the session object within a login response.
 *
 * Only the nestings these providers actually use are searched. An open-ended
 * deep scan for anything called "token" would just as happily pick up a CSRF
 * token or an analytics key from an unrelated response and store it as the
 * provider's credentials.
 */
export function findSession(body: unknown): Record<string, unknown> | null {
  const root = asRecord(body);
  if (!root) return null;

  const candidates = [
    root,
    asRecord(asRecord(root.Data)?.user),
    asRecord(root.Data),
    asRecord(asRecord(root.data)?.user),
    asRecord(root.data),
    asRecord(root.user),
  ];
  for (const candidate of candidates) {
    if (tokenOf(candidate)) return candidate;
  }
  return null;
}

/**
 * Reads credentials out of one response body, or returns null if this response
 * was not a login.
 *
 * Only strings and numbers are kept: these responses also carry menu trees and
 * permission lists, and storing those as credentials would keep a great deal of
 * noise as though it were part of the login.
 */
export function captureAuth(body: unknown, sourceUrl: string): CapturedAuth | null {
  const session = findSession(body);
  if (!session) return null;

  const auth: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(session)) {
    if (typeof value === 'string') auth[key] = value.trim();
    else if (typeof value === 'number') auth[key] = value;
  }
  if (!auth.token) return null;

  return { auth, sourceUrl };
}

/**
 * A cheap pre-check before a response body is read at all.
 *
 * Reading every response a page produces would mean buffering images, fonts and
 * bundles to look for a token that is never in them. A login answer is JSON and
 * mentions one of these.
 */
export function mightCarryAuth(contentType: string, size: number): boolean {
  if (!contentType.toLowerCase().includes('json')) return false;
  // A login response is small. A megabyte of JSON is a data export, not a session.
  return size <= 1_000_000;
}
