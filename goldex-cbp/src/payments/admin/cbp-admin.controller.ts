import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from "@nestjs/common";
import { GatewayRegistry } from "../gateways/gateway.registry";
import { CbpAdminKeyGuard } from "./cbp-admin-key.guard";
import { CbpAdminService, PaymentListFilters } from "./cbp-admin.service";

/**
 * Admin HTTP surface of the CBP service. Read-only: provider health checks
 * and payment records (including raw gateway request/response logs).
 *
 * Not exposed publicly: goldex-backend proxies `/admin/cbp/*` behind
 * AdminAuthGuard/AdminRolesGuard. Requests must carry `X-Admin-Key`
 * (see CbpAdminKeyGuard).
 */
@Controller("admin/cbp")
@UseGuards(CbpAdminKeyGuard)
export class CbpAdminController {
  constructor(
    private readonly registry: GatewayRegistry,
    private readonly admin: CbpAdminService,
  ) {}

  @Get("health")
  async health() {
    return this.registry.health();
  }

  @Get("gateways")
  async gateways() {
    return this.registry.metadata();
  }

  @Get("payments")
  async payments(
    @Query("page", new ParseIntPipe({ optional: true })) page?: number,
    @Query("limit", new ParseIntPipe({ optional: true })) limit?: number,
    @Query("status") status?: string,
    @Query("operation") operation?: string,
    @Query("gatewayCode") gatewayCode?: string,
    @Query("userId") userId?: string,
    @Query("externalReference") externalReference?: string,
    @Query("identifier") identifier?: string,
  ) {
    const filters: PaymentListFilters = {
      page,
      limit,
      status,
      operation,
      gatewayCode,
      userId,
      externalReference,
      identifier,
    };
    return this.admin.listPayments(filters);
  }

  @Get("payments/:id")
  async payment(@Param("id") id: string) {
    return this.admin.getPayment(id);
  }
}
