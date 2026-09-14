import { parseProviderAuth } from "./provider-auth-paste";

/**
 * What an admin pastes is whatever the provider's login answered with, copied
 * out of a browser's network tab. These are the shapes the two providers
 * actually produce, plus the ways a copy can go wrong.
 */
describe("pasted provider credentials", () => {
  const ok = (raw: string) => {
    const result = parseProviderAuth(raw);
    if (!result.ok) throw new Error(`expected a parse, got: ${result.error}`);
    return result.value;
  };

  describe("finding the session", () => {
    it("reads a Zaryar response, nested under Data.user", () => {
      const { auth } = ok(
        JSON.stringify({
          IsSuccess: true,
          Data: {
            user: {
              token: "tok-1",
              uId: "u-1",
              sessionId: "s-1",
              shopkeeperId: "42",
              roleType: "0",
            },
          },
        }),
      );
      expect(auth).toMatchObject({
        token: "tok-1",
        uId: "u-1",
        sessionId: "s-1",
        shopkeeperId: "42",
      });
    });

    it("reads a Talaab response, nested under data", () => {
      const { auth } = ok(JSON.stringify({ success: true, data: { token: "tok-2" } }));
      expect(auth.token).toBe("tok-2");
    });

    it("reads a session copied on its own, with no envelope", () => {
      const { auth } = ok(JSON.stringify({ token: "tok-3", uId: "u-3" }));
      expect(auth).toMatchObject({ token: "tok-3", uId: "u-3" });
    });

    it("prefers the outer token when the envelope carries one itself", () => {
      const { auth } = ok(JSON.stringify({ token: "outer", data: { token: "inner" } }));
      expect(auth.token).toBe("outer");
    });

    it("skips an envelope whose token is empty and keeps looking", () => {
      const { auth } = ok(JSON.stringify({ token: "  ", Data: { user: { token: "real" } } }));
      expect(auth.token).toBe("real");
    });
  });

  describe("refusing what cannot be used", () => {
    it("rejects text that is not JSON", () => {
      const result = parseProviderAuth("this is not json");
      expect(result).toMatchObject({ ok: false });
    });

    it("rejects a response with no token anywhere it looks", () => {
      const result = parseProviderAuth(JSON.stringify({ IsSuccess: false, Message: "بد" }));
      expect(result).toMatchObject({ ok: false });
      if (!result.ok) expect(result.error).toContain("token");
    });

    it("rejects an empty paste", () => {
      expect(parseProviderAuth("   ")).toMatchObject({ ok: false });
    });

    it("rejects a JSON array", () => {
      expect(parseProviderAuth("[1,2,3]")).toMatchObject({ ok: false });
    });
  });

  describe("what gets carried over", () => {
    /**
     * A provider's session object can also hold menu trees and permission
     * lists. Storing those as credentials would keep a great deal of noise as
     * if it were part of the login.
     */
    it("keeps strings and numbers, drops nested structures", () => {
      const { auth } = ok(
        JSON.stringify({
          token: "tok",
          roleType: 0,
          menus: [{ id: 1 }],
          permissions: { trade: true },
          active: true,
        }),
      );
      expect(auth).toEqual({ token: "tok", roleType: 0 });
    });

    it("trims the values it keeps", () => {
      expect(ok(JSON.stringify({ token: "  tok  ", uId: " u " }).toString()).auth).toEqual({
        token: "tok",
        uId: "u",
      });
    });

    it("names the fields it recognised, so the admin can check them", () => {
      const { recognised } = ok(
        JSON.stringify({ Data: { user: { token: "t", uId: "u", sessionId: "s" } } }),
      );
      expect(recognised).toEqual(["token", "uId", "sessionId"]);
    });

    it("does not name a field the response did not carry", () => {
      const { recognised } = ok(JSON.stringify({ token: "t" }));
      expect(recognised).toEqual(["token"]);
    });
  });
});
