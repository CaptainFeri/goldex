/**
 * Reading the credentials an admin pasted out of a provider's own web panel.
 *
 * This is the manual way to activate a provider whose login the engine cannot
 * drive — one behind a captcha or a second factor. The admin signs in in a real
 * browser, copies the login response out of the network tab, and pastes it
 * here. What they paste is whatever that provider answered with, so the shape
 * varies: Zaryar nests the session under `Data.user`, Talaab under `data`, and
 * a copy taken from a different spot may be the session object on its own.
 *
 * Parsing is deliberately generous about where the session sits and strict
 * about one thing only: there has to be a token. Everything else is passed
 * through untouched, because the engine's provider implementations are what
 * read the rest and they know their own provider better than this does.
 */

export interface ParsedProviderAuth {
  auth: Record<string, unknown>;
  /** The fields recognised, so the admin can see what was understood. */
  recognised: string[];
}

export type ProviderAuthParse =
  | { ok: true; value: ParsedProviderAuth }
  | { ok: false; error: string };

/** Fields worth naming back to the admin when they appear. */
const KNOWN_FIELDS = ['token', 'uId', 'userId', 'sessionId', 'shopkeeperId', 'roleType'];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Finds the object holding the token, wherever the provider chose to put it.
 * Only the nestings these providers actually use are searched — an open-ended
 * deep scan could just as easily surface some unrelated token from elsewhere
 * in the response.
 */
function findSession(root: Record<string, unknown>): Record<string, unknown> | null {
  const candidates: (Record<string, unknown> | null)[] = [
    root,
    asRecord(asRecord(root.Data)?.user),
    asRecord(root.Data),
    asRecord(asRecord(root.data)?.user),
    asRecord(root.data),
    asRecord(root.user),
  ];
  for (const candidate of candidates) {
    if (candidate && typeof candidate.token === 'string' && candidate.token.trim()) {
      return candidate;
    }
  }
  return null;
}

export function parseProviderAuth(raw: string): ProviderAuthParse {
  const text = raw.trim();
  if (!text) {
    return { ok: false, error: "پاسخ لاگین تأمین‌کننده را اینجا بچسبانید." };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "متن واردشده JSON معتبر نیست." };
  }

  const root = asRecord(parsed);
  if (!root) {
    return { ok: false, error: "انتظار یک شیء JSON می‌رفت." };
  }

  const session = findSession(root);
  if (!session) {
    return {
      ok: false,
      error: "فیلد token در این پاسخ پیدا نشد؛ مطمئن شوید کل پاسخ لاگین را کپی کرده‌اید.",
    };
  }

  // Only string and number fields are carried over: a session object can also
  // hold nested menus and permission trees, and sending those as credentials
  // would store a great deal of noise as if it were part of the login.
  const auth: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(session)) {
    if (typeof value === 'string' || typeof value === 'number') {
      auth[key] = typeof value === 'string' ? value.trim() : value;
    }
  }

  return {
    ok: true,
    value: {
      auth,
      recognised: KNOWN_FIELDS.filter((field) => auth[field] !== undefined && auth[field] !== ''),
    },
  };
}
