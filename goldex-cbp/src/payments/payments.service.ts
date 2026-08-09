import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { randomUUID } from "crypto";
import { Repository } from "typeorm";
import { PaymentRequestMessage } from "../rabbitmq/rabbitmq.interfaces";
import { SymbolsService } from "../symbols/symbols.service";
import {
  GATEWAY_BOUND_TYPES,
  getDefaultDepositTypes,
  getDefaultWithdrawTypes,
} from "../symbols/constants/symbol-type-type-map";
import { SymbolTypeEnum } from "../symbols/enum/symbol.type.enum";
import { PaymentEntity } from "./entity/payment.entity";
import { PaymentCategoryEnum } from "./enum/payment-category.enum";
import { PaymentOperationEnum } from "./enum/payment-operation.enum";
import { PaymentStatusEnum } from "./enum/payment-status.enum";
import { GatewayRegistry } from "./gateways/gateway.registry";
import { PaymentEventsService } from "./payment-events.service";

/**
 * Headless payment engine driven exclusively by RabbitMQ commands from
 * goldex-backend (see PaymentRequestConsumer). The only HTTP entry is the
 * external payment-provider callback endpoint (KainoCallbackController).
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly callbackUrl: string;

  constructor(
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
    private readonly symbolsService: SymbolsService,
    private readonly registry: GatewayRegistry,
    private readonly config: ConfigService,
    private readonly events: PaymentEventsService,
  ) {
    this.callbackUrl = `${this.config.get("app", { infer: true }).callbackBaseUrl}/api/v1/payments/callbacks/kaino`;
  }

  // ── helpers ────────────────────────────────────────────────────────────

  private categoryOf(symbolType: SymbolTypeEnum): PaymentCategoryEnum {
    switch (symbolType) {
      case SymbolTypeEnum.RIAL:
        return PaymentCategoryEnum.RIAL;
      case SymbolTypeEnum.FIAT:
        return PaymentCategoryEnum.FIAT;
      case SymbolTypeEnum.CRYPTO:
        return PaymentCategoryEnum.CRYPTO;
      default:
        return PaymentCategoryEnum.MATERIAL;
    }
  }

  private newIdentifier(operation: PaymentOperationEnum): string {
    const prefix = operation === PaymentOperationEnum.DEPOSIT ? "DP" : "WD";
    return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`;
  }

  private async loadSymbol(symbolId: string) {
    const symbol = await this.symbolsService.findById(symbolId);
    if (!symbol.isActive) {
      throw new BadRequestException(`Symbol "${symbol.slug}" is not active`);
    }
    return symbol;
  }

  private resolveGateway(
    symbol: any,
    operation: PaymentOperationEnum,
    requestedCode?: string,
  ): string {
    if (!symbol.hasPaymentGateway) {
      throw new BadRequestException(
        `Symbol "${symbol.slug}" has no payment gateway configured`,
      );
    }
    const isDeposit = operation === PaymentOperationEnum.DEPOSIT;
    const allowed = isDeposit ? symbol.depositGateways : symbol.withdrawGateways;
    const defaultCode = isDeposit
      ? symbol.defaultDepositGateway
      : symbol.defaultWithdrawGateway;
    const code = requestedCode ?? defaultCode;
    if (!code) {
      throw new BadRequestException(
        `No ${operation} gateway configured for symbol "${symbol.slug}"`,
      );
    }
    if (allowed?.length && !allowed.includes(code)) {
      throw new ForbiddenException(
        `Gateway "${code}" is not allowed for symbol "${symbol.slug}". Allowed: ${allowed.join(", ")}`,
      );
    }
    return code;
  }

  // ── RabbitMQ command flows ─────────────────────────────────────────────

  /**
   * Creates a payment from a backend RabbitMQ command and executes the
   * gateway for deposit requests. Throws when the gateway fails (the
   * payment is already marked FAILED and an event published).
   */
  async createDepositFromCommand(cmd: PaymentRequestMessage): Promise<PaymentEntity> {
    let symbol;
    try {
      symbol = await this.symbolsService.findBySlug(cmd.symbolSlug);
    } catch {
      const payment = this.paymentRepo.create({
        userId: cmd.userId,
        symbolId: null,
        externalReference: cmd.externalReference,
        operation: PaymentOperationEnum.DEPOSIT,
        category: PaymentCategoryEnum.FIAT,
        type: cmd.type,
        amount: Number(cmd.amount),
        currency: cmd.currency,
        status: PaymentStatusEnum.FAILED,
        identifier: this.newIdentifier(PaymentOperationEnum.DEPOSIT),
        metadata: { error: `Payment symbol "${cmd.symbolSlug}" not found in cbp` },
      });
      const saved = await this.paymentRepo.save(payment);
      this.events.failed(saved, `Payment symbol "${cmd.symbolSlug}" not found in cbp`);
      throw new NotFoundException(`Payment symbol "${cmd.symbolSlug}" not found in cbp`);
    }
    return this.createDepositCore(
      cmd.userId,
      symbol,
      {
        type: cmd.type,
        amount: cmd.amount,
        currency: cmd.currency,
        gatewayCode: cmd.gatewayCode,
        picturePath: cmd.picturePath,
        notes: cmd.notes,
        metadata: cmd.metadata,
      },
      cmd.externalReference,
    );
  }

  async createWithdrawFromCommand(cmd: PaymentRequestMessage): Promise<PaymentEntity> {
    let symbol;
    try {
      symbol = await this.symbolsService.findBySlug(cmd.symbolSlug);
    } catch {
      const payment = this.paymentRepo.create({
        userId: cmd.userId,
        symbolId: null,
        externalReference: cmd.externalReference,
        operation: PaymentOperationEnum.WITHDRAW,
        category: PaymentCategoryEnum.FIAT,
        type: cmd.type,
        amount: Number(cmd.amount),
        currency: cmd.currency,
        status: PaymentStatusEnum.FAILED,
        identifier: this.newIdentifier(PaymentOperationEnum.WITHDRAW),
        metadata: { error: `Payment symbol "${cmd.symbolSlug}" not found in cbp` },
      });
      const saved = await this.paymentRepo.save(payment);
      this.events.failed(saved, `Payment symbol "${cmd.symbolSlug}" not found in cbp`);
      throw new NotFoundException(`Payment symbol "${cmd.symbolSlug}" not found in cbp`);
    }
    return this.createWithdrawCore(
      cmd.userId,
      symbol,
      {
        type: cmd.type,
        amount: cmd.amount,
        currency: cmd.currency,
        gatewayCode: cmd.gatewayCode,
        picturePath: cmd.picturePath,
        notes: cmd.notes,
        metadata: {
          ...(cmd.metadata ?? {}),
          beneficiaryIban: cmd.beneficiaryIban,
          beneficiaryName: cmd.beneficiaryName,
          beneficiaryId: cmd.beneficiaryId,
        },
      },
      cmd.externalReference,
    );
  }

  async approveWithdrawByExternalReference(
    externalReference: string,
    adminId: string,
  ): Promise<PaymentEntity> {
    const payment = await this.findByExternalReference(externalReference);
    return this.approveWithdraw(payment.id, adminId);
  }

  // ── internal flows ─────────────────────────────────────────────────────

  private async createDepositCore(
    userId: string,
    symbol: any,
    input: {
      type: string;
      amount: number | string;
      currency?: string;
      gatewayCode?: string;
      picturePath?: string;
      notes?: string;
      metadata?: Record<string, any>;
    },
    externalReference?: string,
  ): Promise<PaymentEntity> {
    const allowed = symbol.depositTypes.length
      ? symbol.depositTypes
      : getDefaultDepositTypes(symbol.symbolType);
    if (!allowed.includes(input.type)) {
      throw new BadRequestException(
        `Deposit type "${input.type}" is not allowed for this symbol. Allowed: ${allowed.join(", ")}`,
      );
    }

    const gatewayBound = GATEWAY_BOUND_TYPES.has(input.type);
    const gatewayCode = gatewayBound
      ? this.resolveGateway(symbol, PaymentOperationEnum.DEPOSIT, input.gatewayCode)
      : undefined;
    const gateway = gatewayCode ? this.registry.getByCode(gatewayCode) : undefined;

    const payment = this.paymentRepo.create({
      userId,
      symbolId: symbol.id,
      externalReference,
      operation: PaymentOperationEnum.DEPOSIT,
      category: this.categoryOf(symbol.symbolType),
      gatewayKind: gateway?.metadata.kind,
      gatewayCode,
      type: input.type,
      amount: Number(input.amount),
      currency: input.currency ?? symbol.name,
      status: PaymentStatusEnum.PENDING,
      identifier: this.newIdentifier(PaymentOperationEnum.DEPOSIT),
      callbackUrl: this.callbackUrl,
      picturePath: input.picturePath,
      notes: input.notes,
      metadata: input.metadata,
    });

    if (!gateway) {
      return this.paymentRepo.save(payment);
    }

    try {
      const res = await gateway.deposit({
        amount: input.amount,
        userId,
        reference: payment.identifier,
        callbackUrl: payment.callbackUrl,
        meta: input.metadata,
      });

      payment.status = PaymentStatusEnum.PROCESSING;
      payment.rawResponse = res;
      payment.stan = res?._stan ?? payment.identifier;
      payment.ipgReference = res?.ipgReference;
      payment.gatewayUrl = res?.payUrl;
      payment.metadata = {
        ...(input.metadata ?? {}),
        ...(res?._localDate ? { localDate: res._localDate } : {}),
      };
      const saved = await this.paymentRepo.save(payment);
      this.events.processing(saved);
      return saved;
    } catch (err) {
      payment.status = PaymentStatusEnum.FAILED;
      payment.rawResponse = { error: (err as Error)?.message ?? String(err) };
      payment.metadata = { ...(input.metadata ?? {}), error: (err as Error)?.message };
      const saved = await this.paymentRepo.save(payment);
      this.events.failed(saved, (err as Error)?.message);
      throw err;
    }
  }

  private async createWithdrawCore(
    userId: string,
    symbol: any,
    input: {
      type: string;
      amount: number | string;
      currency?: string;
      gatewayCode?: string;
      picturePath?: string;
      notes?: string;
      metadata?: Record<string, any>;
    },
    externalReference?: string,
  ): Promise<PaymentEntity> {
    const allowed = symbol.withdrawTypes.length
      ? symbol.withdrawTypes
      : getDefaultWithdrawTypes(symbol.symbolType);
    if (!allowed.includes(input.type)) {
      throw new BadRequestException(
        `Withdraw type "${input.type}" is not allowed for this symbol. Allowed: ${allowed.join(", ")}`,
      );
    }

    const gatewayBound = GATEWAY_BOUND_TYPES.has(input.type);
    const gatewayCode = gatewayBound
      ? this.resolveGateway(symbol, PaymentOperationEnum.WITHDRAW, input.gatewayCode)
      : undefined;
    const gateway = gatewayCode ? this.registry.getByCode(gatewayCode) : undefined;

    if (gatewayBound && (!input.metadata?.beneficiaryIban || !input.metadata?.beneficiaryName || !input.metadata?.beneficiaryId)) {
      throw new BadRequestException(
        "beneficiaryIban, beneficiaryName and beneficiaryId are required for gateway withdrawals",
      );
    }

    const payment = this.paymentRepo.create({
      userId,
      symbolId: symbol.id,
      externalReference,
      operation: PaymentOperationEnum.WITHDRAW,
      category: this.categoryOf(symbol.symbolType),
      gatewayKind: gateway?.metadata.kind,
      gatewayCode,
      type: input.type,
      amount: Number(input.amount),
      currency: input.currency ?? symbol.name,
      status: PaymentStatusEnum.PENDING,
      identifier: this.newIdentifier(PaymentOperationEnum.WITHDRAW),
      picturePath: input.picturePath,
      notes: input.notes,
      metadata: input.metadata,
    });

    return this.paymentRepo.save(payment);
  }

  // ── lookups ────────────────────────────────────────────────────────────

  async findById(id: string): Promise<PaymentEntity> {
    const payment = await this.paymentRepo.findOne({
      where: { id },
      relations: { symbol: true },
    });
    if (!payment) throw new NotFoundException("Payment not found");
    return payment;
  }

  async findByExternalReference(reference: string): Promise<PaymentEntity> {
    const payment = await this.paymentRepo.findOne({
      where: { externalReference: reference },
      relations: { symbol: true },
    });
    if (!payment) {
      throw new NotFoundException("Payment not found for external reference");
    }
    return payment;
  }

  // ── admin command flow ─────────────────────────────────────────────────

  /**
   * Executes the provider transfer for an approved gateway withdrawal.
   * Called when goldex-backend publishes `payment.request.withdraw.approve`.
   */
  async approveWithdraw(id: string, adminId: string): Promise<PaymentEntity> {
    const payment = await this.findById(id);
    if (payment.operation !== PaymentOperationEnum.WITHDRAW) {
      throw new BadRequestException("Only withdrawals can be approved");
    }
    if (!GATEWAY_BOUND_TYPES.has(payment.type)) {
      throw new BadRequestException("Only gateway-bound withdrawals can be approved");
    }
    if (payment.status !== PaymentStatusEnum.PENDING) {
      throw new BadRequestException("Withdrawal is not in an approvable state");
    }
    const gateway = this.registry.getByCode(payment.gatewayCode);

    try {
      const res = await gateway.withdraw({
        amount: payment.amount,
        userId: payment.userId,
        iban: payment.metadata?.beneficiaryIban,
        beneficiaryName: payment.metadata?.beneficiaryName,
        beneficiaryId: payment.metadata?.beneficiaryId,
        reference: payment.identifier,
        meta: payment.metadata,
      });

      payment.status = PaymentStatusEnum.PROCESSING;
      payment.adminId = adminId;
      payment.rawResponse = res;
      payment.stan = res?._stan ?? payment.identifier;
      payment.ipgReference = res?.ipgReference;
      payment.gatewayUrl = res?.payUrl;
      payment.metadata = {
        ...(payment.metadata ?? {}),
        ...(res?._localDate ? { localDate: res._localDate } : {}),
      };
      const saved = await this.paymentRepo.save(payment);
      this.events.processing(saved);
      return saved;
    } catch (err) {
      payment.status = PaymentStatusEnum.FAILED;
      payment.adminId = adminId;
      payment.rawResponse = { error: (err as Error)?.message ?? String(err) };
      payment.metadata = { ...(payment.metadata ?? {}), error: (err as Error)?.message };
      const saved = await this.paymentRepo.save(payment);
      this.events.failed(saved, (err as Error)?.message);
      throw err;
    }
  }

  // ── gateway callbacks ──────────────────────────────────────────────────

  async findByGatewayReference(ref: string): Promise<PaymentEntity> {
    const payment = await this.paymentRepo.findOne({
      where: [{ identifier: ref }, { ipgReference: ref }],
      relations: { symbol: true },
    });
    if (!payment) throw new NotFoundException("Payment not found for reference");
    return payment;
  }

  async handleKainoCallback(reference: string, body: Record<string, any>) {
    const payment = await this.findByGatewayReference(reference);
    if (payment.status === PaymentStatusEnum.SUCCEEDED) {
      return { success: true, alreadyVerified: true };
    }
    const gateway = this.registry.getByCode(payment.gatewayCode);
    if (!gateway.verify) {
      throw new BadRequestException(
        `Gateway "${payment.gatewayCode}" does not support verification`,
      );
    }
    const result = await gateway.verify(
      {
        identifier: payment.identifier,
        stan: payment.stan,
        amount: payment.amount,
        metadata: payment.metadata,
      },
      body,
    );
    if (!result.success) {
      return { success: false, raw: result.raw };
    }
    payment.status = PaymentStatusEnum.SUCCEEDED;
    payment.completedAt = new Date();
    payment.ipgReference = payment.ipgReference ?? body?.ipgReference;
    payment.rawResponse = result.raw;
    const saved = await this.paymentRepo.save(payment);
    this.events.succeeded(saved);
    return { success: true, payment: saved };
  }
}
