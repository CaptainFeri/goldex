/**
 * Telling a dead session apart from a dead connection.
 *
 * The two look the same from a distance — the provider stops answering — but
 * they call for opposite responses. A dropped connection is retried, and
 * retrying is right however many times it takes. An expired session is not:
 * every retry reaches the provider, is refused for the same reason, and the
 * only thing that changes it is a fresh login. Retrying one as though it were
 * the other is how a provider stays down for a day while the engine looks busy.
 *
 * This is the one place that decides which it is.
 */

/** What a provider answers when it no longer recognises the session. */
const AUTH_STATUSES = new Set([401, 403]);

interface MaybeAxiosError {
  response?: { status?: number };
  status?: number;
  isAxiosError?: boolean;
}

/**
 * Whether this error means the credentials are no longer accepted.
 *
 * Deliberately narrow: only an explicit status from the provider counts. A
 * timeout, a refused socket or a DNS failure carries no opinion about the
 * session, and treating one as an expiry would ask the provider for a fresh
 * code every time the network hiccuped.
 */
export function isAuthFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as MaybeAxiosError;
  const status = candidate.response?.status ?? candidate.status;
  return typeof status === 'number' && AUTH_STATUSES.has(status);
}

/** A short reason to carry with the event, so a log says which call failed. */
export function authFailureReason(error: unknown, where: string): string {
  const status = (error as MaybeAxiosError)?.response?.status ?? (error as MaybeAxiosError)?.status;
  return `${where} answered ${status ?? 'an auth error'}`;
}
