import { ExecutionContext, ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminPermissionsGuard, permissionsOf } from "./admin-permissions.guard";
import { RequirePermissions } from "./require-permissions.decorator";
import { PERMISSION_KEYS, ROOT_ROLE_SLUG } from "../permission.catalog";

/**
 * The guard is the piece that was missing: the pre-existing AdminRolesGuard read
 * a metadata key the decorator never wrote, and read `request.user` where the
 * middleware sets `request.admin`, so it authorised nothing. These tests pin
 * both halves down.
 */

const ctx = (admin: unknown, handler: unknown, cls: unknown): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ admin }) }),
    getHandler: () => handler,
    getClass: () => cls,
  }) as any;

/**
 * Real controllers with the real decorator, read back through a real Reflector.
 * A fake reflector would have happily passed the very bug this replaces — the
 * decorator writing one metadata key and the guard reading another.
 */
class PlainController {
  @RequirePermissions("roles_view", "roles_manage")
  both() {}

  @RequirePermissions("settings", "api")
  privileged() {}

  undecorated() {}
}

@RequirePermissions("roles_view")
class GuardedController {
  @RequirePermissions("roles_manage")
  handler() {}
}

const guard = () => new AdminPermissionsGuard(new Reflector());

const at = (admin: unknown, method: keyof PlainController) =>
  ctx(admin, PlainController.prototype[method], PlainController);

const withRole = (permissions: string[], slug = "custom") =>
  ({ id: "a-1", isSuspended: false, roleRef: { id: "r-1", slug, permissions } }) as any;

describe("AdminPermissionsGuard", () => {
  it("lets a route through when it declares no requirement", () => {
    expect(guard().canActivate(at(withRole([]), "undecorated"))).toBe(true);
  });

  it("is a 401 when no admin was attached — an auth failure, not an access one", () => {
    expect(() => guard().canActivate(at(undefined, "both"))).toThrow(UnauthorizedException);
  });

  it("is a 403 for a suspended admin even when their role would allow it", () => {
    const suspended = { ...withRole(["roles_view", "roles_manage"]), isSuspended: true };
    expect(() => guard().canActivate(at(suspended, "both"))).toThrow(ForbiddenException);
  });

  it("allows when the role holds every declared key", () => {
    expect(guard().canActivate(at(withRole(["roles_view", "roles_manage", "dashboard"]), "both"))).toBe(true);
  });

  it("requires all declared keys, not any of them", () => {
    expect(() => guard().canActivate(at(withRole(["roles_view"]), "both"))).toThrow(ForbiddenException);
  });

  it("names the missing keys in the message, so an operator can be told what to ask for", () => {
    expect(() => guard().canActivate(at(withRole(["roles_view"]), "both"))).toThrow(/roles_manage/);
  });

  it("combines requirements from the controller and the handler", () => {
    const c = (admin: unknown) => ctx(admin, GuardedController.prototype.handler, GuardedController);
    expect(() => guard().canActivate(c(withRole(["roles_manage"])))).toThrow(/roles_view/);
    expect(() => guard().canActivate(c(withRole(["roles_view"])))).toThrow(/roles_manage/);
    expect(guard().canActivate(c(withRole(["roles_manage", "roles_view"])))).toBe(true);
  });

  it("denies an admin carrying no role at all", () => {
    expect(() => guard().canActivate(at({ id: "a-1", isSuspended: false }, "both"))).toThrow(ForbiddenException);
  });

  it("grants the root role everything without consulting its stored column", () => {
    expect(guard().canActivate(at(withRole([], ROOT_ROLE_SLUG), "privileged"))).toBe(true);
  });
});

describe("permissionsOf", () => {
  it("returns the whole catalog for the root role", () => {
    expect(permissionsOf(withRole([], ROOT_ROLE_SLUG))).toEqual([...PERMISSION_KEYS]);
  });

  it("returns the stored set for any other role", () => {
    expect(permissionsOf(withRole(["dashboard"]))).toEqual(["dashboard"]);
  });

  it("returns nothing for an admin with no role, rather than throwing", () => {
    // A legacy admin whose migration left role_id null must be inert, not fatal.
    expect(permissionsOf({ id: "a-1" } as any)).toEqual([]);
    expect(permissionsOf(undefined as any)).toEqual([]);
  });

  it("survives a role whose permissions column is not an array", () => {
    expect(permissionsOf({ roleRef: { slug: "x", permissions: null } } as any)).toEqual([]);
  });
});
