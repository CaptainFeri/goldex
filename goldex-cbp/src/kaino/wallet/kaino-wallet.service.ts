import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SignatureService } from "../../common/signature/signature.service";
import { KainoHttpClient } from "../kaino-http.client";
import {
  ChargeWalletDto,
  InquiryDto,
  PaymentOrderDto,
  ReverseDto,
  TransferDto,
  VerifyChargeDto,
} from "./dto";

/**
 * Kaino wallet API client.
 * Every endpoint (except login) is signed with HMAC-SHA256 over a
 * '#param1#param2#' payload built from the exact documented key order.
 */
@Injectable()
export class KainoWalletService {
  private readonly tenant: string;
  private readonly secret: string;

  constructor(
    private readonly client: KainoHttpClient,
    private readonly sig: SignatureService,
    private readonly config: ConfigService,
  ) {
    const kaino = this.config.get("app", { infer: true }).kaino;
    this.tenant = kaino.tenant;
    this.secret = kaino.secret;
  }

  private buildSign(params: Record<string, any>, keys: string[]): string {
    return this.sig.sign(this.sig.build(params, keys), this.secret);
  }

  private signPost<T>(path: string, params: Record<string, any>, keys: string[]): Promise<T> {
    return this.client.post<T>(path, {
      ...params,
      sign: this.buildSign(params, keys),
    });
  }

  async getBalance(username: string, currency: string) {
    const p = { username, currency, tenant: this.tenant };
    return this.client.get("/rest/channel/wallet/v1/balance", {
      ...p,
      sign: this.buildSign(p, ["username", "currency", "tenant"]),
    });
  }

  async transfer(dto: TransferDto) {
    const keys = [
      "channel",
      "fromUsername",
      "fromUsernameTenant",
      "toUsername",
      "toUsernameTenant",
      "facilityId",
      "currency",
      "amount",
      "identifier",
      "stan",
      "localDate",
      "person",
      "bankIban",
    ];
    return this.signPost<any>("/rest/channel/wallet/v1/transfer", dto as any, keys);
  }

  async chargeWallet(dto: ChargeWalletDto) {
    const keys = [
      "identifier",
      "bankDepositIdentifier",
      "tenant",
      "amount",
      "username",
      "payerMobileNumber",
      "accountNumber",
      "localDate",
      "callBackUrl",
      "voucherReference",
      "autoVerify",
      "validCards",
      "description",
    ];
    return this.signPost<any>("/rest/channel/wallet/v1/chargeWallet", dto as any, keys);
  }

  async verifyCharge(dto: VerifyChargeDto) {
    const keys = ["tenant", "identifier", "amount", "reference", "stan", "isVerify"];
    return this.signPost<any>("/rest/channel/wallet/v1/chargeWallet/verify", dto as any, keys);
  }

  async paymentOrderPaya(dto: PaymentOrderDto) {
    return this.paymentOrder(dto, "/rest/channel/wallet/v1/paymentOrder");
  }

  async paymentOrderRtgs(dto: PaymentOrderDto) {
    return this.paymentOrder(dto, "/rest/channel/wallet/v1/paymentOrder/rtgs");
  }

  private paymentOrder(dto: PaymentOrderDto, path: string) {
    const keys = [
      "sourceAccountNumber",
      "amount",
      "beneficiaryId",
      "beneficiaryName",
      "beneficiaryIban",
      "externalReference",
      "description",
      "username",
      "tenant",
      "stan",
      "localDate",
    ];
    return this.signPost<any>(path, dto as any, keys);
  }

  async inquiry(stan: string, localDate: string) {
    const dto: InquiryDto = { stan, localDate, tenant: this.tenant };
    const keys = ["localDate", "stan", "tenant"];
    return this.signPost<any>("/rest/channel/wallet/v1/inquiry", dto as any, keys);
  }

  async reverse(dto: ReverseDto) {
    const keys = ["amount", "localDate", "stan", "tenant"];
    return this.signPost<any>("/rest/channel/wallet/v1/reverse", dto as any, keys);
  }
}
