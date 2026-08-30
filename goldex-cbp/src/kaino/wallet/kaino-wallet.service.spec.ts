import * as crypto from "crypto";
import { ConfigService } from "@nestjs/config";
import { KainoWalletService } from "./kaino-wallet.service";
import { KainoHttpClient } from "../kaino-http.client";
import { SignatureService } from "../../common/signature/signature.service";

function mockConfig(): ConfigService {
  const config = {
    get: jest.fn((key: string, _opts?: any) => {
      if (key === "app") {
        return {
          kaino: {
            tenant: "TENANT001",
            secret: "secret-key",
            username: "2000004855092",
            password: "Rr123456@",
            payerMobile: "",
          },
        };
      }
      return undefined;
    }),
  };
  return config as any;
}

function mockClient(): { client: KainoHttpClient; bodies: Record<string, any>[] } {
  const bodies: Record<string, any>[] = [];
  const client = {
    post: jest.fn(async (_path: string, body: object) => {
      bodies.push(body as Record<string, any>);
      return {};
    }),
    get: jest.fn(async () => ({})),
    setToken: jest.fn(),
    onUnauthorized: undefined,
  };
  return { client: client as any, bodies };
}

describe("KainoWalletService.chargeWallet", () => {
  it("signs in the documented order and identifies the user by identifier (not username)", async () => {
    const { client, bodies } = mockClient();
    const service = new KainoWalletService(
      client,
      new SignatureService(),
      mockConfig(),
    );

    await service.chargeWallet({
      tenant: "TENANT001",
      identifier: "PAY001",
      currency: "IRR",
      amount: "300000",
      callBackUrl: "https://example.com/callback",
      payerMobileNumber: "09123456789",
      autoVerify: true,
      validCards: ["603799", "627412"],
    });

    // sign order: tenant, identifier, amount, callBackUrl, currency,
    // payerMobileNumber, autoVerify (dropping empty fields).
    const expectedSign = crypto
      .createHmac("sha256", "secret-key")
      .update(
        "#TENANT001#PAY001#300000#https://example.com/callback#IRR#09123456789#true#",
      )
      .digest("hex");
    expect(bodies[0].sign).toBe(expectedSign);
    // the body uses the identifier key (no username) and only the signed
    // non-empty fields + validCards.
    expect(bodies[0]).toEqual({
      tenant: "TENANT001",
      identifier: "PAY001",
      amount: "300000",
      callBackUrl: "https://example.com/callback",
      currency: "IRR",
      payerMobileNumber: "09123456789",
      autoVerify: true,
      validCards: ["603799", "627412"],
      sign: expectedSign,
    });
  });
});