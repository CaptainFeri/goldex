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
  it("signs every request with the constant credential-based sign", async () => {
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

    // sign is derived from channel username+password, NOT the request params.
    const expectedSign = crypto
      .createHmac("sha256", "secret-key")
      .update("#2000004855092#Rr123456@#")
      .digest("hex");
    expect(bodies[0].sign).toBe(expectedSign);
    // request params still forwarded unchanged
    expect(bodies[0]).toMatchObject({
      tenant: "TENANT001",
      identifier: "PAY001",
      amount: "300000",
      callBackUrl: "https://example.com/callback",
    });
  });
});