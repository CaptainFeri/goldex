import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRolesGuard } from "../admin/auth/Guard/admin.role.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { CbpAdminService } from "./cbp-admin.service";

/**
 * Admin panel entry point for the goldex-cbp admin surface. goldex-cbp is
 * headless (no HTTP API); every query is forwarded over RabbitMQ and the
 * response is awaited via the matching reply pattern.
 */
@Controller("admin/cbp")
export class CbpAdminController {
  constructor(private readonly cbpAdmin: CbpAdminService) {}

  @Get("health")
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN)
  async health() {
    return { data: await this.cbpAdmin.health() };
  }

  @Get("gateways")
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN)
  async gateways() {
    return { data: await this.cbpAdmin.gateways() };
  }

  @Get("payments")
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN)
  async payments(
    @Query("page") page?: string,
    @Query("limit") limit?: string,
    @Query("status") status?: string,
    @Query("operation") operation?: string,
    @Query("gatewayCode") gatewayCode?: string,
    @Query("userId") userId?: string,
    @Query("externalReference") externalReference?: string,
    @Query("identifier") identifier?: string
  ) {
    return { data: await this.cbpAdmin.payments({
      page,
      limit,
      status,
      operation,
      gatewayCode,
      userId,
      externalReference,
      identifier,
    }) };
  }

  @Get("payments/:id")
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN)
  async payment(@Param("id") id: string) {
    return { data: await this.cbpAdmin.payment(id) };
  }
}
