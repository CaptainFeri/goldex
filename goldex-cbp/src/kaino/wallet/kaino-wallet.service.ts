import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SignatureService } from "../../common/signature/signature.service";
import { KainoHttpClient } from "../kaino-http.client";
import {
  ChangePasswordDto,
  ChargeWalletDto,
  ChargeWalletQueryDto,
  PaymentOrderDto,
  PaymentOrderQueryDto,
  TransactionQueryDto,
  TransferDto,
  VerifyChargeDto,
} from "./dto";

/**
 * Kaino wallet API client.
 * Every endpoint (except login) is authenticated with the login token in the
 * `Authorization` header and signed with a CONSTANT sign computed once from the
 * channel `username + password` (not the per-request params):
 *     sign = HMAC-SHA256(channelKey, '#username#password#')
 * All requests carry this same sign regardless of their parameters.
 */
@Injectable()
export class KainoWalletService {
  private readonly tenant: string;
  private readonly sign: string;
  private readonly prefix: string;

  constructor(
    private readonly client: KainoHttpClient,
    private readonly sig: SignatureService,
    private readonly config: ConfigService,
  ) {
    const kaino = this.config.get("app", { infer: true }).kaino;
    this.tenant = kaino.tenant;
    this.prefix = kaino.walletPathPrefix;
    // The sign is fixed: built from the channel credentials once and reused on
    // every request (matches the documented #username#password# payload).
    this.sign = this.sig.sign(
      this.sig.build({ username: kaino.username, password: kaino.password }, [
        "username",
        "password",
      ]),
      kaino.secret,
    );
  }

  private p(path: string): string {
    return `${this.prefix}${path}`;
  }

  private signPost<T>(path: string, params: Record<string, any>): Promise<T> {
    return this.client.post<T>(path, {
      ...params,
      sign: this.sign,
    });
  }

  private signGet<T>(path: string, params: Record<string, any>): Promise<T> {
    return this.client.get<T>(path, {
      ...params,
      sign: this.sign,
    });
  }

  /** POST /transfer - internal wallet transfer. */
  async transfer(dto: TransferDto) {
    return this.signPost<any>(this.p("/transfer"), dto as any);
  }

  /** POST /chargeWallet - IPG wallet charge. */
  async chargeWallet(dto: ChargeWalletDto) {
    return this.signPost<any>(this.p("/chargeWallet"), dto as any);
  }

  /** POST /chargeWallet/verify - final IPG confirmation. */
  async verifyCharge(dto: VerifyChargeDto) {
    return this.signPost<any>(this.p("/chargeWallet/verify"), dto as any);
  }

  /** POST /paymentOrder - PAYA transfer. */
  async paymentOrderPaya(dto: PaymentOrderDto) {
    return this.paymentOrder(dto, this.p("/paymentOrder"));
  }

  /** POST /paymentOrder/rtgs - SATNA transfer. */
  async paymentOrderRtgs(dto: PaymentOrderDto) {
    return this.paymentOrder(dto, this.p("/paymentOrder/rtgs"));
  }

  private paymentOrder(dto: PaymentOrderDto, path: string) {
    return this.signPost<any>(path, dto as any);
  }

  /** POST /changePassword - change password. */
  async changePassword(dto: ChangePasswordDto) {
    return this.signPost<any>(this.p("/changePassword"), dto as any);
  }

  /** GET /balance - simple account balance (Authorization only). */
  getBalance() {
    return this.client.get<any>(this.p("/balance"), {});
  }

  /** GET /balances - full account balance (Authorization only). */
  getBalances() {
    return this.client.get<any>(this.p("/balances"), {});
  }

  /** GET /transaction - paginated wallet transactions. */
  listTransactions(query: TransactionQueryDto) {
    return this.signGet<any>(this.p("/transaction"), query as any);
  }

  /** GET /transaction/info/{id} - transaction detail. */
  transactionInfo(id: number | string, tenant: string = this.tenant) {
    return this.signGet<any>(`${this.p("/transaction/info")}/${id}`, { tenant });
  }

  /** GET /transaction/data/{id} - full transaction data with relationships. */
  transactionData(id: number | string, tenant: string = this.tenant) {
    return this.signGet<any>(`${this.p("/transaction/data")}/${id}`, { tenant });
  }

  /** GET /paymentOrder - paginated payment orders (PAYA/SATNA). */
  listPaymentOrders(query: PaymentOrderQueryDto) {
    return this.signGet<any>(this.p("/paymentOrder"), query as any);
  }

  /** GET /chargeWallet - paginated IPG charges. */
  listChargeWallets(query: ChargeWalletQueryDto) {
    return this.signGet<any>(this.p("/chargeWallet"), query as any);
  }

  /** GET /key - user encryption key (Authorization only). */
  getKey() {
    return this.client.get<any>(this.p("/key"), {});
  }

  /** GET /account/owner - account owner name. */
  getAccountOwner(params: {
    accountNumber?: string;
    username?: string;
    tenantCode?: string;
    currencyCode?: string;
  }) {
    return this.signGet<any>(this.p("/account/owner"), params);
  }

  /** GET /cashOut/serialNumber/{serialNumber} - cash-out by serial. */
  cashOutBySerialNumber(serialNumber: string) {
    return this.signGet<any>(`${this.p("/cashOut/serialNumber")}/${serialNumber}`, {});
  }

  /** GET /cashOut/externalReference/{externalReference} - cash-out by external ref. */
  cashOutByExternalReference(externalReference: string) {
    return this.signGet<any>(
      `${this.p("/cashOut/externalReference")}/${externalReference}`,
      {},
    );
  }
}