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
  it("signs identifier, tenant, amount, username, localDate, callBackUrl in the reference SDK order", async () => {
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
      localDate: "2026-01-15 10:30:00",
    });

    // Reference SDK order: identifier, tenant, amount (Double.toString),
    // username, localDate, callBackUrl (dropping empty fields).
    const expectedSign = crypto
      .createHmac("sha256", "secret-key")
      .update(
        "#PAY001#TENANT001#300000.0#2000004855092#2026-01-15 10:30:00#https://example.com/callback#",
      )
      .digest("hex");
    expect(bodies[0].sign).toBe(expectedSign);
    // body follows the reference key sequence + unsigned extras (validCards...).
    expect(bodies[0]).toEqual({
      identifier: "PAY001",
      amount: 300000,
      callBackUrl: "https://example.com/callback",
      sign: expectedSign,
      localDate: "2026-01-15 10:30:00",
      username: "2000004855092",
      tenant: "TENANT001",
      currency: "IRR",
      payerMobileNumber: "09123456789",
      autoVerify: true,
      validCards: ["603799", "627412"],
    });
  });
});