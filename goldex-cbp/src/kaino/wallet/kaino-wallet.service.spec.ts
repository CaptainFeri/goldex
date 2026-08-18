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
      localDate: "20260810",
    });

    // sign is derived from the full 13-field order (dropping empty fields);
    // localDate participates in the sign but is not sent in the body.
    const expectedSign = crypto
      .createHmac("sha256", "secret-key")
      .update(
        "#PAY001#TENANT001#300000#user123#09123456789#100012345678#20260810#https://example.com/callback#true#شارژ کیف پول#",
      )
      .digest("hex");
    expect(bodies[0].sign).toBe(expectedSign);
    // the body contains only the documented non-empty fields (+ sign).
    expect(bodies[0]).toEqual({
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
      sign: expectedSign,
    });
  });
});