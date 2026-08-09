import { Controller, Get, Param, Query, UseGuards } from "@nestjs/common";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRolesGuard } from "../admin/auth/Guard/admin.role.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";

/**
 * Proxy for the CBP admin surface. goldex-cbp is never exposed publicly —
 * the admin panel reaches its health checks and payment logs through this
 * controller, which forwards to the internal service with the admin key.
 */
@Controller("admin/cbp")
export class CbpAdminController {
  private readonly cbpUrl: string;
  private readonly adminKey: string;

  constructor(
    private readonly http: HttpService,
    config: ConfigService,
  ) {
    const base = config.get("cbp", { infer: true }).url.replace(/\/+$/, "");
    this.cbpUrl = `${base}/api/v1/admin/cbp`;
    this.adminKey = process.env.GOLDEX_CBP_ADMIN_KEY ?? "";
  }

  private async forward<T>(path: string, params?: Record<string, any>): Promise<T> {
    const { data } = await firstValueFrom(
      this.http.get<T>(`${this.cbpUrl}${path}`, {
        params,
        headers: { "X-Admin-Key": this.adminKey },
      }),
    );
    return data;
  }

  @Get("health")
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN)
  async health() {
    return this.forward("/health");
  }

  @Get("gateways")
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN)
  async gateways() {
    return this.forward("/gateways");
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
    @Query("identifier") identifier?: string,
  ) {
    return this.forward("/payments", {
      page,
      limit,
      status,
      operation,
      gatewayCode,
      userId,
      externalReference,
      identifier,
    });
  }

  @Get("payments/:id")
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN)
  async payment(@Param("id") id: string) {
    return this.forward(`/payments/${id}`);
  }
}
