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
  it("builds the sign payload from the documented key order", async () => {
    const { client } = mockClient();
    const sig = new SignatureService();
    const buildSpy = jest.spyOn(sig, "build");
    const service = new KainoWalletService(client, sig, mockConfig());

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

    expect(buildSpy).toHaveBeenCalledTimes(1);
    const [, keys] = buildSpy.mock.calls[0];
    expect(keys).toEqual([
      "tenant",
      "identifier",
      "amount",
      "callBackUrl",
      "username",
      "currency",
      "payerMobileNumber",
      "accountNumber",
      "ipgTenantCode",
      "description",
      "autoVerify",
      "validCards",
      "walletBeneficiaries",
      "ibanBeneficiaries",
      "additionalData",
    ]);
    expect(
      buildSpy.mock.calls[0][0],
    ).toMatchObject({
      identifier: "PAY001",
      amount: "300000",
      autoVerify: true,
      validCards: ["603799", "627412"],
    });
  });

  it("signs the raw payload with HMAC-SHA256 using the channel key", async () => {
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

    expect(bodies[0].sign).toBe(
      crypto
        .createHmac("sha256", "secret-key")
        .update(
          "#TENANT001#PAY001#300000#https://example.com/callback#" +
            "user123#09123456789#100012345678#شارژ کیف پول#true#" +
            "603799,627412#",
        )
        .digest("hex"),
    );
  });
});