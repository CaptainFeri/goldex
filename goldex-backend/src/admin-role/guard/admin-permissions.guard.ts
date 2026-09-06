import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSION_KEYS, PermissionKey, ROOT_ROLE_SLUG } from "../permission.catalog";
import { REQUIRED_PERMISSIONS } from "./require-permissions.decorator";

const ALL_PERMISSIONS: string[] = [...PERMISSION_KEYS];

/**
 * Enforces {@link RequirePermissions}.
 *
 * Reads the metadata from the handler **and** the controller, so a permission
 * declared once on a class covers its routes, and a route may narrow it
 * further — the two sets are combined and all of them are required.
 *
 * Fails closed in every direction that matters:
 *
 * - No admin on the request → 401. The auth middleware attaches `admin`, and
 *   this reads the same property. (The previous guard read `request.user`,
 *   which nothing sets.)
 * - A suspended admin → 403, regardless of what their role holds. A suspension
 *   that only stopped new logins would leave a live token working.
 * - A role that has been deleted or was never assigned → 403 with no
 *   permissions, rather than treating "no role" as "unrestricted".
 *
 * A route with no declared requirement is left alone: this guard adds
 * authorization where it is asked for and never removes it.
 */
@Injectable()
export class AdminPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = [
      ...(this.reflector.get<PermissionKey[]>(REQUIRED_PERMISSIONS, context.getHandler()) ?? []),
      ...(this.reflector.get<PermissionKey[]>(REQUIRED_PERMISSIONS, context.getClass()) ?? []),
    ];
    if (required.length === 0) return true;

    const admin = context.switchToHttp().getRequest().admin;
    if (!admin) throw new UnauthorizedException("UNAUTHORIZED");
    if (admin.isSuspended) throw new ForbiddenException("ADMIN.SUSPENDED");

    const held = permissionsOf(admin);
    const missing = required.filter((p) => !held.includes(p));
    if (missing.length > 0) {
      // Names what is missing: an operator who cannot act needs to know which
      // permission to ask for, and the key is not a secret.
      throw new ForbiddenException(`ADMIN.MISSING_PERMISSION:${missing.join(",")}`);
    }
    return true;
  }
}

/**
 * What an admin actually holds.
 *
 * The root role holds everything by definition rather than by stored list, so
 * it cannot be locked out by an unlucky edit — and, because the row is not
 * editable, the two can never disagree.
 */
export function permissionsOf(admin: {
  roleRef?: { slug?: string; permissions?: string[] } | null;
}): string[] {
  const role = admin?.roleRef;
  if (!role) return [];
  if (role.slug === ROOT_ROLE_SLUG) return ALL_PERMISSIONS;
  return Array.isArray(role.permissions) ? role.permissions : [];
}
