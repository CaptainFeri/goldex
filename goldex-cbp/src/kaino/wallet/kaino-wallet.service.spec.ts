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
  it("signs tenant, identifier, amount and callBackUrl in documented order", async () => {
    const { client, bodies } = mockClient();
    const service = new KainoWalletService(
      client,
      new SignatureService(),
      mockConfig(),
    );

    await service.chargeWallet({
      tenant: "TENANT001",
      identifier: "PAY001",
      amount: "300000",
      callBackUrl: "https://example.com/callback",
      username: "user123",
      payerMobileNumber: "09123456789",
      accountNumber: "100012345678",
      autoVerify: true,
      validCards: ["603799", "627412"],
      description: "شارژ کیف پول",
    });

    // sign is derived from the request params, in documented order.
    const expectedSign = crypto
      .createHmac("sha256", "secret-key")
      .update("#TENANT001#PAY001#300000#https://example.com/callback#")
      .digest("hex");
    expect(bodies[0].sign).toBe(expectedSign);
    // only the documented fields are sent; optional fields are dropped.
    expect(bodies[0]).toEqual({
      tenant: "TENANT001",
      identifier: "PAY001",
      amount: "300000",
      callBackUrl: "https://example.com/callback",
      sign: expectedSign,
    });
  });
});