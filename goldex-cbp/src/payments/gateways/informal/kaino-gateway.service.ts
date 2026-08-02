import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { KainoWalletService } from "../../../kaino/wallet/kaino-wallet.service";
import { PaymentCategoryEnum } from "../../enum/payment-category.enum";
import { PaymentGatewayKindEnum } from "../../enum/payment-gateway-kind.enum";
import {
  DepositParams,
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
    private readonly config: ConfigService,
  ) {}

  private plainAmount(v: number | string): string {
    return String(Number(v));
  }

  /** Kaino date format: yyyy/MM/dd HH:mm:ss */
  private now(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(
      d.getHours(),
    )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
      amount: this.plainAmount(params.amount),
      username: params.userId,
      payerMobileNumber:
        params.meta?.mobile ?? kaino.payerMobile ?? undefined,
      accountNumber: params.meta?.accountNumber,
      localDate,
      callBackUrl: params.callbackUrl,
      autoVerify: params.meta?.autoVerify,
      validCards: params.meta?.validCards,
      description: params.meta?.description,
    });
    return { ...res, _localDate: localDate, _stan: params.reference };
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
    const localDate = payment.metadata?.localDate;
    const stan = payment.stan ?? payment.identifier;
    if (!localDate) {
      return { success: false, error: "localDate not stored on payment" };
    }
    const res = await this.wallet.inquiry(stan, localDate);
    return { success: this.isSuccess(res), raw: res };
  }
}
