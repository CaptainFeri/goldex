import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KainoAuthService } from "../../../kaino/auth/kaino-auth.service";
import { KainoWalletService } from "../../../kaino/wallet/kaino-wallet.service";
import { PaymentCategoryEnum } from "../../enum/payment-category.enum";
import { PaymentGatewayKindEnum } from "../../enum/payment-gateway-kind.enum";
import {
  DepositParams,
  GatewayHealthResult,
  GatewayMetadata,
  GatewayPaymentRef,
  GatewayVerifyResult,
  IPaymentGateway,
  WithdrawParams,
} from "../payment-gateway.interface";

@Injectable()
export class KainoGatewayService implements IPaymentGateway {
  static readonly METADATA: GatewayMetadata = {
    code: "kaino-informal",
    name: "Kaino Wallet",
    category: PaymentCategoryEnum.FIAT,
    kind: PaymentGatewayKindEnum.INFORMAL,
  };

  readonly metadata: GatewayMetadata = KainoGatewayService.METADATA;

  constructor(
    private readonly wallet: KainoWalletService,
    private readonly auth: KainoAuthService,
    private readonly config: ConfigService,
  ) {}

  private plainAmount(v: number | string): string {
    return String(Number(v));
  }

  /** Kaino date format: yyyyMMdd */
  private now(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  }

  private isSuccess(res: any): boolean {
    return !(
      res &&
      (res.success === false ||
        res.status === "FAILED" ||
        res.status === "FAILURE" ||
        res.error)
    );
  }

  async deposit(params: DepositParams): Promise<any> {
    const kaino = this.config.get("app", { infer: true }).kaino;
    const localDate = this.now();
    const res = await this.wallet.chargeWallet({
      identifier: params.reference,
      tenant: kaino.tenant,
      currency: "IRR",
      amount: this.plainAmount(params.amount),
      payerMobileNumber:
        params.meta?.mobile ?? kaino.payerMobile ?? undefined,
      accountNumber: params.meta?.accountNumber,
      callBackUrl: params.callbackUrl,
      autoVerify: true,
      validCards: params.meta?.validCards,
      description: params.meta?.description,
      localDate,
    });
    return {
      ...res,
      _localDate: localDate,
      _stan: params.reference,
      payUrl: this.buildPayUrl(res, params.reference),
    };
  }

  /** IPG payment page the payer must be redirected to (fiat gateway). */
  private buildPayUrl(res: any, fallbackReference: string): string | undefined {
    const ipgReference =
      res?.ipgReference ??
      res?.result?.ipgReference ??
      res?.reference ??
      fallbackReference;
    if (!ipgReference) return undefined;
    const base = this.config.get("app", { infer: true }).kaino;
    const link =
      res?.link ??
      res?.result?.link ??
      res?.payUrl ??
      res?.result?.payUrl ??
      res?.paymentUrl;
    if (link) return link;
    return `${base.baseUrl}${base.ipgPayPath}?reference=${encodeURIComponent(ipgReference)}`;
  }

  async withdraw(params: WithdrawParams): Promise<any> {
    const kaino = this.config.get("app", { infer: true }).kaino;
    const localDate = this.now();
    const dto = {
      amount: this.plainAmount(params.amount),
      beneficiaryId: params.beneficiaryId,
      beneficiaryName: params.beneficiaryName,
      beneficiaryIban: params.iban,
      externalReference: params.reference,
      description: params.meta?.description,
      username: params.userId,
      tenant: kaino.tenant,
      stan: params.reference,
      localDate,
      sourceAccountNumber: params.meta?.sourceAccountNumber,
    };
    const res =
      params.meta?.settlementType === "rtgs"
        ? await this.wallet.paymentOrderRtgs(dto)
        : await this.wallet.paymentOrderPaya(dto);
    return { ...res, _localDate: localDate, _stan: params.reference };
  }

  async verify(
    payment: GatewayPaymentRef,
    data: Record<string, any>,
  ): Promise<GatewayVerifyResult> {
    const kaino = this.config.get("app", { infer: true }).kaino;
    const res = await this.wallet.verifyCharge({
      tenant: kaino.tenant,
      identifier: payment.identifier,
      amount: this.plainAmount(payment.amount),
      reference:
        data?.reference ?? data?.ipgReference ?? payment.identifier,
      stan: data?.stan,
      isVerify: true,
    });
    return { success: this.isSuccess(res), raw: res };
  }

  async inquiry(payment: GatewayPaymentRef): Promise<GatewayVerifyResult> {
    const res = await this.wallet.listTransactions({
      tenant: this.config.get("app", { infer: true }).kaino.tenant,
      from: 0,
      size: 1,
      voucherReference: payment.identifier,
    });
    const items = res?.transactions ?? res?.items ?? [];
    const found = Array.isArray(items) && items.length > 0 ? items[0] : undefined;
    return { success: !!found, raw: found };
  }

  /**
   * Health probe: a fresh Kaino login validates both reachability and
   * credentials without mutating any business data.
   */
  async healthCheck(): Promise<GatewayHealthResult> {
    const start = Date.now();
    try {
      await this.auth.login();
      return {
        code: this.metadata.code,
        name: this.metadata.name,
        category: this.metadata.category,
        kind: this.metadata.kind,
        status: "up",
        latencyMs: Date.now() - start,
        message: "Login succeeded",
        checkedAt: new Date().toISOString(),
      };
    } catch (err: any) {
      return {
        code: this.metadata.code,
        name: this.metadata.name,
        category: this.metadata.category,
        kind: this.metadata.kind,
        status: "down",
        latencyMs: Date.now() - start,
        message: (err as Error)?.message ?? String(err),
        checkedAt: new Date().toISOString(),
      };
    }
  }
}
