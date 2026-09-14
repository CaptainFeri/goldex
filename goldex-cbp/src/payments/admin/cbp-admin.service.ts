import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PaymentEntity } from "../entity/payment.entity";
import { PaymentSymbolEntity } from "../../symbols/entity/payment-symbol.entity";

export interface PaymentListFilters {
  page?: number;
  limit?: number;
  status?: string;
  operation?: string;
  gatewayCode?: string;
  userId?: string;
  externalReference?: string;
  identifier?: string;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Read-only query surface for the CBP admin panel: payments with their
 * raw gateway request/response payloads (logs).
 */
@Injectable()
export class CbpAdminService {
  constructor(
    @InjectRepository(PaymentSymbolEntity)
    private readonly symbolRepo: Repository<PaymentSymbolEntity>,
    @InjectRepository(PaymentEntity)
    private readonly paymentRepo: Repository<PaymentEntity>,
  ) {}

  async listPayments(filters: PaymentListFilters): Promise<PaginatedResult<PaymentEntity>> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const qb = this.paymentRepo
      .createQueryBuilder("payment")
      .leftJoinAndSelect("payment.symbol", "symbol")
      .orderBy("payment.createAt", "DESC")
      .addOrderBy("payment.id", "DESC");

    if (filters.status) {
      qb.andWhere("payment.status = :status", { status: filters.status });
    }
    if (filters.operation) {
      qb.andWhere("payment.operation = :operation", { operation: filters.operation });
    }
    if (filters.gatewayCode) {
      qb.andWhere("payment.gatewayCode = :gatewayCode", {
        gatewayCode: filters.gatewayCode,
      });
    }
    if (filters.userId) {
      qb.andWhere("payment.userId = :userId", { userId: filters.userId });
    }
    if (filters.externalReference) {
      qb.andWhere("payment.externalReference ILIKE :externalReference", {
        externalReference: `%${filters.externalReference}%`,
      });
    }
    if (filters.identifier) {
      qb.andWhere("payment.identifier ILIKE :identifier", {
        identifier: `%${filters.identifier}%`,
      });
    }

    const [data, total] = await qb.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getPayment(id: string): Promise<PaymentEntity> {
    const payment = await this.paymentRepo.findOne({
      where: { id },
      relations: { symbol: true },
    });
    if (!payment) {
      throw new NotFoundException("Payment not found");
    }
    return payment;
  }
  /**
   * Every gateway with the symbols actually pointed at it.
   *
   * The gateway list on its own says a provider exists, not whether anything
   * uses it — and a gateway configured on no symbol looks identical to one
   * serving every deposit in the system. Which symbols route to it, in which
   * direction, and which of them call it their default is the thing an
   * operator needs before touching a gateway at all.
   *
   * Read from the symbols cbp actually holds, not from what the backend
   * believes: a sync it refused leaves the two disagreeing, and this is the
   * side that decides whether a payment goes through.
   */
  async gatewayBindings(): Promise<
    Record<
      string,
      {
        deposit: { slug: string; name: string; isActive: boolean; isDefault: boolean }[];
        withdraw: { slug: string; name: string; isActive: boolean; isDefault: boolean }[];
      }
    >
  > {
    const symbols = await this.symbolRepo.find({ order: { slug: "ASC" } });
    const bindings: Record<string, any> = {};

    const bind = (
      code: string,
      direction: "deposit" | "withdraw",
      symbol: PaymentSymbolEntity,
      isDefault: boolean,
    ) => {
      bindings[code] ??= { deposit: [], withdraw: [] };
      bindings[code][direction].push({
        slug: symbol.slug,
        name: symbol.name,
        isActive: symbol.isActive,
        isDefault,
      });
    };

    for (const symbol of symbols) {
      // A symbol with the gateway switch off routes nowhere, whatever lists it
      // still carries from an earlier configuration.
      if (!symbol.hasPaymentGateway) continue;

      for (const code of symbol.depositGateways ?? []) {
        bind(code, "deposit", symbol, symbol.defaultDepositGateway === code);
      }
      for (const code of symbol.withdrawGateways ?? []) {
        bind(code, "withdraw", symbol, symbol.defaultWithdrawGateway === code);
      }
    }

    return bindings;
  }

}
