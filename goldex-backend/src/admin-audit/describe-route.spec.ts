import { describeRoute } from "./describe-route";

/**
 * `action` and `entity` are what the log is searched by, so they have to group
 * the way an investigator expects: every finalize under one action, everything
 * about one voucher under one entity/id pair.
 */
describe("describeRoute", () => {
  it("names the action by pattern, not by concrete url", () => {
    const a = describeRoute("POST", "/api/v1/admin/accounting/vouchers/:id/finalize", { id: "v-1" });
    const b = describeRoute("POST", "/api/v1/admin/accounting/vouchers/:id/finalize", { id: "v-2" });
    // Otherwise every voucher gets its own "action" and the log cannot be grouped.
    expect(a.action).toBe(b.action);
    // The action keeps the `admin/` prefix: it is the route as declared, and
    // not every audited route lives under it.
    expect(a.action).toBe("POST /admin/accounting/vouchers/:id/finalize");
  });

  it("takes the resource family up to the first parameter", () => {
    expect(describeRoute("POST", "/api/v1/admin/accounting/vouchers/:id/finalize", { id: "v-1" }))
      .toMatchObject({ entity: "accounting/vouchers", entityId: "v-1" });
  });

  it("reads the id whatever the parameter is called", () => {
    expect(describeRoute("POST", "/api/v1/admin/wallets/:walletId/operations", { walletId: "w-9" }))
      .toMatchObject({ entity: "wallets", entityId: "w-9" });
    expect(describeRoute("POST", "/api/v1/admin/credits/settlements/:settlementId/approve", { settlementId: "s-1" }))
      .toMatchObject({ entity: "credits/settlements", entityId: "s-1" });
  });

  it("keeps the literal segments when a route has no parameter", () => {
    expect(describeRoute("POST", "/api/v1/admin/shahin/transfer"))
      .toMatchObject({ entity: "shahin/transfer", entityId: null });
  });

  it("handles a route with no id supplied", () => {
    expect(describeRoute("DELETE", "/api/v1/admin/roles/:id", {}))
      .toMatchObject({ entity: "roles", entityId: null });
  });

  it("strips the api and version prefixes however they appear", () => {
    for (const p of ["/api/v1/admin/roles", "api/v1/admin/roles", "/v1/admin/roles", "/admin/roles"]) {
      expect(describeRoute("POST", p).entity).toBe("roles");
    }
  });

  it("survives a missing route pattern rather than throwing", () => {
    // Express does not always populate `route` — a 404 or a middleware short
    // circuit gets here with nothing.
    expect(describeRoute("POST", undefined)).toEqual({ action: "POST /", entity: null, entityId: null });
  });

  it("caps a preposterous id instead of storing it whole", () => {
    const long = "x".repeat(500);
    expect(describeRoute("PATCH", "/admin/roles/:id", { id: long }).entityId).toHaveLength(100);
  });

  it("groups nested resources under their parent family", () => {
    expect(describeRoute("PATCH", "/api/v1/admin/em/requests/:id/enclosure", { id: "r-1" }).entity)
      .toBe("em/requests");
  });
});
