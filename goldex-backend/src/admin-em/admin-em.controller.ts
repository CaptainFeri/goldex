import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { RequirePermissions } from "../admin-role/guard/require-permissions.decorator";
import { OtpScope } from "../operation-otp/operation-otp.enums";
import { RequireOperationOtp } from "../operation-otp/guard/require-otp.decorator";
import { paginate } from "../shared/dto/paginated.dto";
import { ApiAdminErrorResponses, ApiEnvelopeNoDataResponse, ApiEnvelopeResponse, ApiPaginatedResponse } from "../shared/swagger";
import { AdminEmService } from "./admin-em.service";
import { P2pEmViewService } from "./p2p-em-view.service";
import {
  AssignAccountDto,
  EmDecisionDto,
  EmProofDto,
  EmQueryDto,
  EmRequestDetailDto,
  EmRequestRowDto,
  EmStatsDto,
  SetEnclosureDto,
} from "./dto/admin-em.dto";

/**
 * The Withdrawal EM desk.
 *
 * A projection over `src/p2p`, not a second source of truth — see
 * docs/ADMIN-EM.md for the mapping and for what the P2P model does not answer.
 */
@ApiTags("Admin-EM")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@Controller("admin/em")
export class AdminEmController {
  constructor(
    private readonly view: P2pEmViewService,
    private readonly em: AdminEmService,
  ) {}

  private actor(req: AdminExpressRequest) {
    return {
      adminId: req.admin?.id ?? "system",
      ip: (req as any).ip,
      userAgent: (req as any).headers?.["user-agent"],
    };
  }

  @Get("stats")
  @RequirePermissions("withdrawals_view")
  @ApiOperation({ summary: "The desk's counters", description: "Counted off the projection, not stored." })
  @ApiEnvelopeResponse(EmStatsDto)
  async stats() {
    return { data: await this.view.stats() };
  }

  @Get("receipts/:id")
  @RequirePermissions("withdrawals_view")
  @ApiOperation({
    summary: "One receipt, for the print view",
    description: "`receiptUrl` is a short-lived signed URL; receipts share a bucket with KYC documents.",
  })
  @ApiEnvelopeResponse(EmProofDto)
  async receipt(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.em.receipt(id) };
  }

  @Get("requests")
  @RequirePermissions("withdrawals_view")
  @ApiOperation({
    summary: "Withdraw requests and deposit intents, as one list",
    description: "`expiresAt` is a timestamp; the countdown is the client's to render.",
  })
  @ApiPaginatedResponse(EmRequestRowDto)
  async list(@Query() query: EmQueryDto) {
    const { items, total } = await this.view.list(query);
    return { data: paginate(items, total, query) };
  }

  @Get("requests/:id")
  @RequirePermissions("withdrawals_view")
  @ApiOperation({ summary: "One request with its parts, matches and receipts" })
  @ApiEnvelopeResponse(EmRequestDetailDto)
  async findOne(@Param("id", ParseUUIDPipe) id: string) {
    const found = await this.view.findOne(id);
    if (!found) return { data: null };
    return { data: { ...found.row, proofs: found.proofs, parts: found.parts, escalationId: found.escalationId } };
  }

  @Post("requests/:id/account")
  @HttpCode(200)
  @RequirePermissions("withdrawals_approve")
  @ApiOperation({
    summary: "Assign the company account this request settles from",
    description: "Validated through AdminBankAccountService, so a wrong-symbol account is refused now.",
  })
  @ApiEnvelopeNoDataResponse()
  async assignAccount(@Param("id", ParseUUIDPipe) id: string, @Body() dto: AssignAccountDto) {
    await this.em.assignAccount(id, dto.bankAccountId);
    return { data: null };
  }

  @Patch("requests/:id/enclosure")
  @HttpCode(200)
  @RequirePermissions("withdrawals_approve")
  @ApiOperation({ summary: "Set دارای لف", description: "Display only; no settlement logic reads it." })
  @ApiEnvelopeNoDataResponse()
  async setEnclosure(@Param("id", ParseUUIDPipe) id: string, @Body() dto: SetEnclosureDto) {
    await this.em.setEnclosure(id, dto.hasEnclosure);
    return { data: null };
  }

  @Post("requests/:id/approve")
  @HttpCode(200)
  @RequirePermissions("withdrawals_approve")
  @RequireOperationOtp(OtpScope.EM_APPROVE)
  @ApiOperation({
    summary: "Confirm the payment",
    description:
      "Resolves the request's open escalation as CONFIRM_PAYMENT through P2pEscalationService — " +
      "which may stage the decision for a second admin when the amount is above the two-person " +
      "threshold. Refused when there is no open escalation to resolve.",
  })
  @ApiEnvelopeNoDataResponse()
  async approve(@Req() req: AdminExpressRequest, @Param("id", ParseUUIDPipe) id: string, @Body() dto: EmDecisionDto) {
    await this.em.approve(id, dto, this.actor(req));
    return { data: null };
  }

  @Post("requests/:id/reject")
  @HttpCode(200)
  @RequirePermissions("withdrawals_approve")
  @RequireOperationOtp(OtpScope.EM_APPROVE)
  @ApiOperation({ summary: "Refuse the payment", description: "Resolves the escalation as REJECT_PAYMENT." })
  @ApiEnvelopeNoDataResponse()
  async reject(@Req() req: AdminExpressRequest, @Param("id", ParseUUIDPipe) id: string, @Body() dto: EmDecisionDto) {
    await this.em.reject(id, dto, this.actor(req));
    return { data: null };
  }
}
