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

  it("signs with plain SHA-256 over channelKey + payload", () => {
    const raw = "#user#TENANT001#";
    const channelKey = "secret-key";
    const expected = crypto
      .createHash("sha256")
      .update(channelKey + raw)
      .digest("hex");
    expect(service.sign(raw, channelKey)).toBe(expected);
  });
});
