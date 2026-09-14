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

/**
 * Fields that mark a stored value as a provider session rather than any other
 * token a page happens to keep.
 */
const SESSION_COMPANIONS = ['uId', 'userId', 'sessionId', 'shopkeeperId', 'roleType'];

function scalarsOf(source: Record<string, unknown>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') out[key] = value.trim();
    else if (typeof value === 'number') out[key] = value;
  }
  return out;
}

/**
 * Reads the session out of a page's own storage.
 *
 * Not every provider's login puts the session on the wire in a form worth
 * reading. A single-page app commonly answers the login over the network and
 * then keeps what it got in `localStorage`, and from then on the session exists
 * only there — so watching responses alone can watch a perfectly successful
 * login go by and catch nothing.
 *
 * Two shapes are read, because both occur:
 *
 *  - one entry holding the whole session as JSON, under whatever key the app
 *    chose;
 *  - the fields spread across separate entries, one per key.
 *
 * A token alone is not enough to call something a session. Pages keep CSRF
 * tokens, push tokens and analytics keys in storage too, and storing one of
 * those as a provider's credentials would activate a provider that cannot
 * authenticate. So a flat match also has to carry at least one field that
 * belongs to a provider session.
 */
export function captureFromStorage(
  entries: Record<string, string>,
  sourceLabel: string,
): CapturedAuth | null {
  // A whole session kept under one key.
  for (const [key, raw] of Object.entries(entries)) {
    if (!raw || (raw[0] !== '{' && raw[0] !== '[')) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    const session = findSession(parsed);
    if (session) {
      const auth = scalarsOf(session);
      if (auth.token) return { auth, sourceUrl: `${sourceLabel}[${key}]` };
    }
  }

  // The fields spread one per key.
  const flat = scalarsOf(entries);
  const token = typeof flat.token === 'string' ? flat.token : '';
  if (token && SESSION_COMPANIONS.some((field) => flat[field])) {
    const auth: Record<string, string | number> = { token };
    for (const field of SESSION_COMPANIONS) {
      if (flat[field] !== undefined && flat[field] !== '') auth[field] = flat[field];
    }
    return { auth, sourceUrl: sourceLabel };
  }

  return null;
}
