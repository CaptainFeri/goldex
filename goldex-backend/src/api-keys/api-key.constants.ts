/**
 * Leaf module: imports nothing.
 *
 * The header name and the keyed-route registry are needed by the service, the
 * guard and the decorator alike. Holding them in the decorator's file made the
 * import graph a cycle (service → decorator → guard → service), which left the
 * guard's injected service undefined at runtime while still typechecking.
 */
export const API_KEY_HEADER = "x-api-key";

/**
 * Routes that accept an API key, recorded as they are declared.
 *
 * Decorators run at import time, so by the time the app has booted this holds
 * every keyed route. The API stats endpoint reports the count so an operator
 * seeing zero traffic can tell "nothing calls us yet" apart from "the
 * dashboard is broken" — with no keyed routes, zero is the correct answer.
 */
export const KEYED_ROUTES: string[] = [];
