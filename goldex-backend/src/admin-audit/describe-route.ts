/**
 * What a request was doing, derived from the route it matched.
 *
 * Taken from the *pattern* (`/admin/accounting/vouchers/:id/finalize`) rather
 * than the concrete URL, so every call to one endpoint groups under one
 * `action` instead of fragmenting by id.
 */
export interface RouteDescription {
  /** `POST /admin/accounting/vouchers/:id/finalize` */
  action: string;
  /** `accounting/vouchers` — the resource family, for "everything about vouchers". */
  entity: string | null;
  entityId: string | null;
}

const PREFIX = /^\/?(api\/)?(v\d+\/)?/;

export function describeRoute(
  method: string,
  routePath: string | undefined,
  params: Record<string, unknown> = {},
): RouteDescription {
  const path = (routePath ?? "").split("?")[0];
  const trimmed = "/" + path.replace(PREFIX, "").replace(/^admin\//, "").replace(/^\/+|\/+$/g, "");

  const action = `${method.toUpperCase()} ${"/" + path.replace(PREFIX, "").replace(/^\/+/, "")}`;

  const segments = trimmed.split("/").filter(Boolean);
  // Everything up to the first parameter is the resource family; a route with
  // no parameter keeps all its literal segments except a trailing verb.
  const firstParam = segments.findIndex((s) => s.startsWith(":"));
  const literal = firstParam === -1 ? segments : segments.slice(0, firstParam);

  const entity = literal.length ? literal.join("/") : null;

  // The first path parameter is the record being acted on. `:id` is the common
  // case; anything else (`:walletId`, `:settlementId`) works the same way.
  const paramName = firstParam === -1 ? null : segments[firstParam].slice(1);
  const raw = paramName ? params[paramName] : undefined;
  const entityId = raw === undefined || raw === null ? null : String(raw).slice(0, 100);

  return { action, entity, entityId };
}
