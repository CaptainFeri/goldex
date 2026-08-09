import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PaymentEntity } from "../entity/payment.entity";

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
}
