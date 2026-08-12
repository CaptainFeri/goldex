import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HttpService } from "@nestjs/axios";
import { firstValueFrom, catchError, throwError } from "rxjs";
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

/**
 * Shahin (Pars Zargar) bank gateway for RIAL payouts.
 *
 * Mirrors the shahin proxy implemented in goldex-backend
 * (src/shahin/shahin-proxy.controller.ts): same URL layout
 * (/api/shahin/...), X-API-Key header, Gregorian->Jalali date
 * conversion and the `transactionState: SUCCESS | CORE_FAILED`
 * response envelope.
 *
 * Withdraws use the `/batch-transfer` endpoint with a single
 * destination entry (the canonical shape for one payout; it also
 * matches the backend proxy's amount aggregation over
 * `destination[].amount`).
 */
@Injectable()
export class ShahinGatewayService implements IPaymentGateway {
  private readonly logger = new Logger(ShahinGatewayService.name);

  readonly metadata: GatewayMetadata = {
    code: "shahin",
    name: "Shahin (Pars Zargar)",
    category: PaymentCategoryEnum.RIAL,
    kind: PaymentGatewayKindEnum.FORMAL,
  };

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  private cfg() {
    const sh = this.config.get<Record<string, any>>("app", { infer: true })?.shahin ?? {};
    return {
      baseUrl: (sh.baseUrl ?? "https://9eb6cj.parszargar.com").replace(/\/+$/, ""),
      apiKey: sh.apiKey ?? "",
      bankCode: sh.bankCode ?? "BKV",
      companyNationalCode: sh.companyNationalCode ?? "",
      sourceAccount: sh.sourceAccount ?? "",
      timeoutMs: parseInt(sh.timeoutMs ?? "60000", 10) || 60000,
    };
  }

  /** Convert Gregorian YYYY-MM-DD to Jalali YYYYMMDD (shahin style). */
  private toJalali(gregorianDate?: string): string | undefined {
    if (!gregorianDate) return undefined;
    if (/^\d{8}$/.test(gregorianDate)) return gregorianDate;
    const m = gregorianDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return gregorianDate;

    const gy0 = parseInt(m[1], 10);
    const gm = parseInt(m[2], 10);
    const gd = parseInt(m[3], 10);

    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = gy0 <= 1600 ? 0 : 979;
    let gy = gy0 - (gy0 <= 1600 ? 621 : 1600);
    const gy2 = gm > 2 ? gy + 1 : gy;
    let days =
      365 * gy +
      Math.floor((gy2 + 3) / 4) -
      Math.floor((gy2 + 99) / 100) +
      Math.floor((gy2 + 399) / 400) -
      80 +
      gd +
      g_d_m[gm - 1];
    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    jy += Math.floor((days - 1) / 365);
    if (days > 365) days = (days - 1) % 365;
    const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
    const jd = days < 186 ? 1 + (days % 31) : 1 + ((days - 186) % 30);
    return `${jy}${String(jm).padStart(2, "0")}${String(jd).padStart(2, "0")}`;
  }

  /** Local date yyyy/MM/dd HH:mm:ss (used for statement/inquiry joins). */
  private nowLocal(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(
      d.getHours(),
    )}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  private isProviderFailure(payload: any): boolean {
    const data = payload?.data ?? payload;
    return (
      !data ||
      data.transactionState === "CORE_FAILED" ||
      data.transactionState === "FAILED" ||
      data.statusCode >= 400 ||
      (data.respObject && (data.respObject.errorCode || data.respObject.failureReason))
    );
  }

  private async post(path: string, body: any): Promise<any> {
    const cfg = this.cfg();
    const url = `${cfg.baseUrl}/api/shahin${path}`;
    const start = Date.now();
    this.logger.debug(`POST ${url} body=${JSON.stringify(body)}`);

    const res = await firstValueFrom(
      this.http
        .post(url, body, {
          timeout: cfg.timeoutMs,
          validateStatus: () => true,
          headers: {
            "Content-Type": "application/json",
            "X-API-Key": cfg.apiKey,
          },
        })
        .pipe(
          catchError((err: any) => {
            this.logger.error(`Shahin request failed after ${Date.now() - start}ms: ${err.message}`);
            return throwError(() => err);
          }),
        ),
    );

    this.logger.debug(`Shahin response ${res.status}: ${JSON.stringify(res.data)}`);
    // Return the raw shahin envelope as-is (mirrors the backend proxy's
    // forwardRequest which returns the body on both SUCCESS and CORE_FAILED).
    // The caller decides success/failure from the `transactionState` field.
    return res.data?.data ?? res.data;
  }

  async deposit(_params: DepositParams): Promise<any> {
    throw new Error("Deposit is not supported by the shahin gateway");
  }

  /**
   * Executes an automatic RIAL payout via Shahin `/batch-transfer`
   * with a single destination entry per withdrawal request.
   */
  async withdraw(params: WithdrawParams): Promise<any> {
    const cfg = this.cfg();
    const sh = params.meta?.shahin ?? {};
    const localDate = this.nowLocal();
    const dto = {
      sourceAccount: sh.sourceAccount ?? cfg.sourceAccount,
      bank: sh.bank ?? cfg.bankCode,
      nationalCode: sh.nationalCode ?? cfg.companyNationalCode,
      destination: [
        {
          destinationIban: params.iban,
          amount: String(Number(params.amount)),
          ownerName: params.beneficiaryName,
          nationalCode: params.beneficiaryId,
          ...(sh.destination ?? {}),
        },
      ],
      description: params.meta?.description,
      localDate,
      logYearMonthDay: this.toJalali(String(params.meta?.logDate ?? "")) ?? undefined,
    };

    if (!dto.sourceAccount || !dto.nationalCode) {
      throw new Error(
        "Shahin gateway: sourceAccount and nationalCode must be configured (SHAHIN_SOURCE_ACCOUNT, SHAHIN_COMPANY_NATIONAL_CODE)",
      );
    }

    const data = await this.post("/batch-transfer", dto);

    // The post() now returns the raw envelope; decide success/failure here so
    // the payment stays consistent with the backend proxy's CORE_FAILED shape.
    if (this.isProviderFailure(data)) {
      const message =
        data?.respObject?.message ??
        data?.respObject?.errorCode ??
        data?.message ??
        "Shahin provider failure";
      this.logger.warn(`Shahin failure: ${JSON.stringify(data)}`);
      const e = new Error(String(message)) as Error & { shahinProviderData?: any };
      e.shahinProviderData = data;
      throw e;
    }

    return {
      ...data,
      _localDate: localDate,
      _stan: params.reference,
      transactionId: data?.transactionId ?? data?.uuid,
    };
  }

  async verify(
    payment: GatewayPaymentRef,
    data: Record<string, any>,
  ): Promise<GatewayVerifyResult> {
    // Shahin payouts have no callback/verify endpoint; the initial
    // transfer response is the source of truth. Manual verification
    // can be layered on later via `inquiry()`.
    return { success: true, raw: data };
  }

  async inquiry(payment: GatewayPaymentRef): Promise<GatewayVerifyResult> {
    const meta = payment.metadata ?? {};
    const txDate = meta.localDate ?? payment.stan;
    if (!txDate) {
      return { success: false, error: "inquiry date not stored on payment" };
    }
    try {
      const result = await this.post("/account/statement", {
        sourceAccount: this.cfg().sourceAccount,
        fromDate: this.toJalali(String(txDate).split(" ")[0]),
        toDate: this.toJalali(String(txDate).split(" ")[0]),
        bank: this.cfg().bankCode,
        nationalCode: this.cfg().companyNationalCode,
      });
      const success =
        result?.transactionState === "SUCCESS" &&
        result?.statusCode >= 200 &&
        result?.statusCode < 300;
      return { success, raw: result };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Health probe: lightweight HTTP reachability check against the shahin
   * base URL. Reports `not_configured` when the API key is missing.
   */
  async healthCheck(): Promise<GatewayHealthResult> {
    const cfg = this.cfg();
    const start = Date.now();
    if (!cfg.apiKey) {
      return {
        code: this.metadata.code,
        name: this.metadata.name,
        category: this.metadata.category,
        kind: this.metadata.kind,
        status: "not_configured",
        message: "SHAHIN_SERVICE_API_KEY is not configured",
        checkedAt: new Date().toISOString(),
      };
    }
    try {
      const res = await firstValueFrom(
        this.http
          .get(cfg.baseUrl, {
            timeout: 10_000,
            validateStatus: () => true,
            headers: { "X-API-Key": cfg.apiKey },
          })
          .pipe(
            catchError((err: any) => {
              this.logger.error(`Shahin health check failed: ${err.message}`);
              return throwError(() => err);
            }),
          ),
      );
      return {
        code: this.metadata.code,
        name: this.metadata.name,
        category: this.metadata.category,
        kind: this.metadata.kind,
        status: res.status < 500 ? "up" : "down",
        latencyMs: Date.now() - start,
        message: `HTTP ${res.status}`,
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