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
 * Every endpoint (except login) is authenticated with the Bearer token received
 * from login (sent in the `Authorization` header by KainoHttpClient) and signed
 * with HMAC-SHA256 over its own request params in the documented order:
 *     sign = HMAC-SHA256(channelKey, '#param1#param2#...#')
 * Login signs only username+password and returns the Bearer token.
 */
@Injectable()
export class KainoWalletService {
  private readonly tenant: string;
  private readonly channelKey: string;
  private readonly prefix: string;

  constructor(
    private readonly client: KainoHttpClient,
    private readonly sig: SignatureService,
    private readonly config: ConfigService,
  ) {
    const kaino = this.config.get("app", { infer: true }).kaino;
    this.tenant = kaino.tenant;
    this.channelKey = kaino.secret;
    this.prefix = kaino.walletPathPrefix;
  }

  private p(path: string): string {
    return `${this.prefix}${path}`;
  }

  private buildSign(params: Record<string, any>, keys: string[]): string {
    return this.sig.sign(this.sig.build(params, keys), this.channelKey);
  }

  private signPost<T>(
    path: string,
    params: Record<string, any>,
    keys: string[],
  ): Promise<T> {
    return this.client.post<T>(path, {
      ...params,
      sign: this.buildSign(params, keys),
    });
  }

  private signGet<T>(
    path: string,
    params: Record<string, any>,
    keys: string[],
  ): Promise<T> {
    return this.client.get<T>(path, {
      ...params,
      sign: this.buildSign(params, keys),
    });
  }

  /** POST /transfer - internal wallet transfer. */
  async transfer(dto: TransferDto) {
    const keys = [
      "fromUsername",
      "fromUsernameTenant",
      "fromAccountNumber",
      "toAccountNumber",
      "toUsername",
      "toUsernameTenant",
      "facilityId",
      "tenant",
      "currency",
      "amount",
      "identifier",
      "person",
      "description",
      "channel",
      "stan",
      "isCfmTransaction",
      "bankIban",
      "localDate",
    ];
    return this.signPost<any>(this.p("/transfer"), dto as any, keys);
  }

  /**
   * POST /chargeWallet - IPG wallet charge.
   * The sign is built over the full 13-field order documented by support
   * (dropping empty fields); only the documented non-empty fields are sent in
   * the body. localDate participates in the sign only and is not sent.
   */
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
      "itemText",
      "description",
    ];
    const body: Record<string, any> = {
      tenant: dto.tenant,
      identifier: dto.identifier,
      amount: dto.amount,
      callBackUrl: dto.callBackUrl,
    };
    if (dto.username) body.username = dto.username;
    if (dto.payerMobileNumber) body.payerMobileNumber = dto.payerMobileNumber;
    if (dto.accountNumber) body.accountNumber = dto.accountNumber;
    if (dto.description) body.description = dto.description;
    if (dto.autoVerify !== undefined) body.autoVerify = dto.autoVerify;
    if (dto.validCards?.length) body.validCards = dto.validCards;

    const signParams = { ...body, localDate: dto.localDate };
    return this.client.post<any>(this.p("/chargeWallet"), {
      ...body,
      sign: this.buildSign(signParams, keys),
    });
  }

  /** POST /chargeWallet/verify - final IPG confirmation. */
  async verifyCharge(dto: VerifyChargeDto) {
    const keys = ["identifier", "tenant", "amount", "reference", "isVerify", "stan"];
    return this.signPost<any>(this.p("/chargeWallet/verify"), dto as any, keys);
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

  /** POST /changePassword - change password. */
  async changePassword(dto: ChangePasswordDto) {
    const keys = ["oldPassword", "password", "passwordConfirm"];
    return this.signPost<any>(this.p("/changePassword"), dto as any, keys);
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
    const keys = [
      "tenant",
      "from",
      "size",
      "product",
      "fromDate",
      "toDate",
      "fromTransactionId",
      "toTransactionId",
      "transactionTypes",
      "voucherReference",
      "invoiceNumber",
      "includeDone",
      "includeCanceled",
      "includePending",
      "transactionSign",
      "ascending",
    ];
    return this.signGet<any>(this.p("/transaction"), query as any, keys);
  }

  /** GET /transaction/info/{id} - transaction detail. */
  transactionInfo(id: number | string, tenant: string = this.tenant) {
    return this.signGet<any>(`${this.p("/transaction/info")}/${id}`, { tenant }, ["tenant"]);
  }

  /** GET /transaction/data/{id} - full transaction data with relationships. */
  transactionData(id: number | string, tenant: string = this.tenant) {
    return this.signGet<any>(`${this.p("/transaction/data")}/${id}`, { tenant }, ["tenant"]);
  }

  /** GET /paymentOrder - paginated payment orders (PAYA/SATNA). */
  listPaymentOrders(query: PaymentOrderQueryDto) {
    const keys = [
      "from",
      "size",
      "username",
      "tenantCode",
      "state",
      "paymentReference",
      "fromAmount",
      "toAmount",
      "fromStateDate",
      "toStateDate",
    ];
    return this.signGet<any>(this.p("/paymentOrder"), query as any, keys);
  }

  /** GET /chargeWallet - paginated IPG charges. */
  listChargeWallets(query: ChargeWalletQueryDto) {
    const keys = [
      "tenant",
      "from",
      "size",
      "identifier",
      "ipgReference",
      "username",
      "statusType",
      "fromDate",
      "toDate",
      "fromAmount",
      "toAmount",
    ];
    return this.signGet<any>(this.p("/chargeWallet"), query as any, keys);
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
    const keys = ["accountNumber", "username", "tenantCode", "currencyCode"];
    return this.signGet<any>(this.p("/account/owner"), params, keys);
  }

  /** GET /cashOut/serialNumber/{serialNumber} - cash-out by serial. */
  cashOutBySerialNumber(serialNumber: string) {
    return this.signGet<any>(`${this.p("/cashOut/serialNumber")}/${serialNumber}`, {}, []);
  }

  /** GET /cashOut/externalReference/{externalReference} - cash-out by external ref. */
  cashOutByExternalReference(externalReference: string) {
    return this.signGet<any>(
      `${this.p("/cashOut/externalReference")}/${externalReference}`,
      {},
      [],
    );
  }
}