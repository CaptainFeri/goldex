import { Injectable, Logger } from "@nestjs/common";
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
  private readonly logger = new Logger(KainoWalletService.name);
  private readonly tenant: string;
  private readonly username: string;
  private readonly channelKey: string;
  private readonly prefix: string;

  constructor(
    private readonly client: KainoHttpClient,
    private readonly sig: SignatureService,
    private readonly config: ConfigService,
  ) {
    const kaino = this.config.get("app", { infer: true }).kaino;
    this.tenant = kaino.tenant;
    this.username = kaino.username;
    this.channelKey = kaino.secret;
    this.prefix = kaino.walletPathPrefix;
  }

  private p(path: string): string {
    return `${this.prefix}${path}`;
  }

  /** Plain amount without any decimal normalization. */
  private plainAmount(v: number | string): string {
    return String(Number(v));
  }

  /** Kaino localDate format: yyyy-MM-dd HH:mm:ss */
  private now(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
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
   * POST /chargeWallet - IPG wallet charge (open gateway).
   * The sign is built over the reference SDK order: identifier, tenant,
   * amount, username, localDate, callBackUrl —
   * dropping empty fields. Extra body fields (currency, payerMobileNumber,
   * autoVerify, validCards, ...) are sent unsigned.
   */
  async chargeWallet(dto: ChargeWalletDto) {
    const keys = [
      "identifier",
      "tenant",
      "amount",
      "username",
      "localDate",
      "callBackUrl",
    ];
    const body: Record<string, any> = {
      identifier: dto.identifier,
      tenant: dto.tenant,
      amount: this.plainAmount(dto.amount),
      username: dto.username ?? this.username,
      localDate: dto.localDate ?? this.now(),
      callBackUrl: dto.callBackUrl,
    };
    if (dto.currency) body.currency = dto.currency;
    if (dto.payerMobileNumber) body.payerMobileNumber = dto.payerMobileNumber;
    if (dto.accountNumber) body.accountNumber = dto.accountNumber;
    if (dto.ipgTenantCode) body.ipgTenantCode = dto.ipgTenantCode;
    if (dto.description) body.description = dto.description;
    if (dto.autoVerify !== undefined) body.autoVerify = dto.autoVerify;
    if (dto.validCards?.length) body.validCards = dto.validCards;
    if (dto.walletBeneficiaries?.length)
      body.walletBeneficiaries = dto.walletBeneficiaries;
    if (dto.ibanBeneficiaries?.length)
      body.ibanBeneficiaries = dto.ibanBeneficiaries;
    if (dto.additionalData) body.additionalData = dto.additionalData;

    const signText = this.sig.build(body, keys);
    const sign = this.sig.sign(signText, this.channelKey);
    this.logger.log(
      `chargeWallet identifier=${dto.identifier} signText=${signText} sign=${sign}`,
    );
    return this.client.post<any>(this.p("/chargeWallet"), {
      ...body,
      sign,
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
      "tenant",
      "amount",
      "sourceAccountNumber",
      "beneficiaryId",
      "beneficiaryName",
      "beneficiaryIban",
      "username",
      "stan",
      "localDate",
      "description",
    ];
    const body = {
      sourceAccountNumber: dto.sourceAccountNumber,
      amount: dto.amount,
      beneficiaryId: dto.beneficiaryId,
      beneficiaryName: dto.beneficiaryName,
      beneficiaryIban: dto.beneficiaryIban,
      description: dto.description,
      username: dto.username,
      tenant: dto.tenant,
      stan: dto.stan,
      localDate: dto.localDate,
    };
    return this.signPost<any>(path, body, keys);
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
      "username",
      "product",
      "fromDate",
      "toDate",
      "currency",
      "invoiceNumber",
      "stan",
      "fromTransactionId",
      "toTransactionId",
      "channel",
      "accountNumber",
      "fromPostDate",
      "toPostDate",
      "ascending",
      "from",
      "size",
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
      "accountNumber",
      "username",
      "tenantCode",
      "fromAmount",
      "toAmount",
      "state",
      "paymentReference",
      "from",
      "size",
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