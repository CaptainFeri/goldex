import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SignatureService } from "../../common/signature/signature.service";
import { KainoHttpClient } from "../kaino-http.client";

@Injectable()
export class KainoAuthService implements OnModuleInit {
  private readonly logger = new Logger(KainoAuthService.name);

  constructor(
    private readonly client: KainoHttpClient,
    private readonly config: ConfigService,
    private readonly sig: SignatureService,
  ) {
    this.client.onUnauthorized = () => this.login().then(() => undefined);
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.login();
    } catch (err) {
      // Do not crash on startup when Kaino is unreachable.
      // The client will re-login lazily on the first 401.
      this.logger.warn(`Initial Kaino login failed: ${(err as Error)?.message ?? err}`);
    }
  }

  async login(): Promise<string> {
    const { loginBaseUrl, loginPath, username, password, secret } = this.config.get(
      "app",
      { infer: true },
    ).kaino;
    const body = { username, password };
    const res = await this.client.post<Record<string, any>>(
      loginPath,
      {
        ...body,
        sign: this.sig.sign(this.sig.build(body, ["username", "password"]), secret),
      },
      loginBaseUrl,
    );
    const token =
      res?.token ?? res?.accessToken ?? res?.data?.token ?? res?.value?.token;
    if (!token) {
      throw new Error("Kaino login failed: no token in response");
    }
    this.client.setToken(token);
    this.logger.log("Kaino logged in");
    return token;
  }
}
