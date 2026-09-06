import { describe, expect, it } from "vitest";
import { roleError } from "../pages/RolesPage";

/**
 * The server refuses role writes with codes, not sentences. An operator who
 * trips an invariant needs to be told what to do about it — "ROLE.
 * LAST_ROLES_MANAGE" on screen is a support ticket.
 */
const err = (message: string) => ({
  isAxiosError: true,
  response: { data: { message } },
});

describe("roleError", () => {
  it("explains each invariant in words an operator can act on", () => {
    expect(roleError(err("ROLE.CANNOT_REMOVE_OWN_ROLES_MANAGE"))).toContain("نقش خودتان");
    expect(roleError(err("ROLE.LAST_ROLES_MANAGE"))).toContain("دست‌کم یک مدیر فعال");
    expect(roleError(err("ROLE.ROOT_IMMUTABLE"))).toContain("مدیر ارشد");
    expect(roleError(err("ROLE.HAS_MEMBERS"))).toContain("عضو");
  });

  it("names the offending keys the escalation error carries after the colon", () => {
    expect(roleError(err("ROLE.CANNOT_GRANT_UNHELD:settings,api"))).toContain("settings,api");
  });

  it("names the unknown key too", () => {
    expect(roleError(err("ROLE.UNKNOWN_PERMISSION:make_me_root"))).toContain("make_me_root");
  });

  it("does not mistake one code for another that shares a prefix", () => {
    // FIXED_CANNOT_RENAME and FIXED_CANNOT_DELETE differ only at the end.
    expect(roleError(err("ROLE.FIXED_CANNOT_RENAME"))).toContain("نام");
    expect(roleError(err("ROLE.FIXED_CANNOT_DELETE"))).toContain("حذف");
  });

  it("passes an unrecognised message through rather than swallowing it", () => {
    expect(roleError(err("something else entirely"))).toContain("something else entirely");
  });
});
