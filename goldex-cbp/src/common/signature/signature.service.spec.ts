import * as crypto from "crypto";
import { SignatureService } from "./signature.service";

describe("SignatureService", () => {
  const service = new SignatureService();

  it("builds the '#p1#p2#' payload in orderedKeys order", () => {
    expect(service.build({ a: "1", b: "2" }, ["a", "b"])).toBe("#1#2#");
  });

  it("drops empty, null and undefined params entirely", () => {
    expect(
      service.build(
        { a: "1", b: null, c: "", d: undefined, e: "5" },
        ["a", "b", "c", "d", "e"],
      ),
    ).toBe("#1#5#");
  });

  it("stringifies numeric params", () => {
    expect(service.build({ amount: 500000, tenant: "T1" }, ["amount", "tenant"])).toBe(
      "#500000#T1#",
    );
  });

  it("signs with HMAC-SHA256 hex", () => {
    const raw = "#user#TENANT001#";
    const secret = "secret-key";
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    expect(service.sign(raw, secret)).toBe(expected);
  });
});
