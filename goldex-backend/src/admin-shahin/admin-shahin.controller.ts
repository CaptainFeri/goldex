import { Body, Controller, Get, HttpCode, Param, ParseIntPipe, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { RequirePermissions } from "../admin-role/guard/require-permissions.decorator";
import { OtpScope } from "../operation-otp/operation-otp.enums";
import { RequireOperationOtp } from "../operation-otp/guard/require-otp.decorator";
import { ApiAdminErrorResponses, ApiEnvelopeResponse } from "../shared/swagger";
import { AdminShahinService } from "./admin-shahin.service";
import { ShahinExportService } from "./shahin-export.service";
import {
  AccountBalanceDto,
  BatchTransferDto,
  InquiryDto,
  InquiryResultDto,
  OpenBankingConnectionDto,
  ShahinAccountDto,
  StatementExportQueryDto,
  StatementQueryDto,
  StatementRowDto,
  TransferDto,
} from "./dto/admin-shahin.dto";

/**
 * The bank rails, for operators.
 *
 * Reads need `accounting`; anything that moves money needs `wallets_ops` *and*
 * an operation OTP. These replace the `api/shahin` transfer routes, which were
 * behind `UserAuthGuard` — see docs/SHAHIN-ADMIN.md.
 */
@ApiTags("Admin-Shahin")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@Controller("admin/shahin")
export class AdminShahinController {
  constructor(
    private readonly shahin: AdminShahinService,
    private readonly exporter: ShahinExportService,
  ) {}

  private adminId(req: AdminExpressRequest): string {
    return req.admin?.id ?? "system";
  }

  @Get("accounts")
  @RequirePermissions("accounting")
  @ApiOperation({ summary: "The company's bank accounts" })
  @ApiEnvelopeResponse(ShahinAccountDto, { isArray: true })
  async accounts() {
    return { data: await this.shahin.listAccounts() };
  }

  @Get("open-banking")
  @RequirePermissions("accounting")
  @ApiOperation({
    summary: "Connection state per account",
    description:
      "Derived from the last call actually made to each account. Scope and consent expiry are " +
      "null unless the bank supplies them — this does not infer either.",
  })
  @ApiEnvelopeResponse(OpenBankingConnectionDto, { isArray: true })
  async openBanking() {
    return { data: await this.shahin.openBanking() };
  }

  @Post("open-banking/:id/sync")
  // Nothing is created; these act on an existing account.
  @HttpCode(200)
  @RequirePermissions("accounting")
  @ApiOperation({ summary: "Re-ask the bank for this account", description: "Refreshes the balance and the timestamp." })
  @ApiEnvelopeResponse(OpenBankingConnectionDto)
  async sync(@Req() req: AdminExpressRequest, @Param("id", ParseIntPipe) id: number) {
    return { data: await this.shahin.syncOpenBanking(id, this.adminId(req)) };
  }

  @Get("statement/export")
  @RequirePermissions("accounting")
  @ApiOperation({ summary: "Statements for a date range, as a workbook", description: "One sheet per account." })
  @ApiProduces("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @ApiResponse({ status: 200, description: "The workbook", schema: { type: "string", format: "binary" } })
  async exportStatements(
    @Req() req: AdminExpressRequest,
    @Query() query: StatementExportQueryDto,
    @Res() res: Response,
  ) {
    const ids = query.accountIds
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n) && n > 0);

    const accounts = await this.shahin.accountsByIds(ids);
    const sections = [];
    for (const account of accounts) {
      const rows = await this.shahin.statement(
        account.id,
        { from: query.from, to: query.to },
        this.adminId(req),
      );
      sections.push({ accountNumber: account.accountNumber, bankName: account.bankName ?? null, rows });
    }
    await this.exporter.streamStatements(sections, res);
  }

  @Get("accounts/:id")
  @RequirePermissions("accounting")
  @ApiOperation({ summary: "One stored account" })
  @ApiEnvelopeResponse(ShahinAccountDto)
  async account(@Param("id", ParseIntPipe) id: number) {
    return { data: await this.shahin.account(id) };
  }

  @Get("accounts/:id/balance")
  @RequirePermissions("accounting")
  @ApiOperation({
    summary: "Ask the bank for the balance now",
    description: "Not the stored figure — `fetchedAt` says when the bank was asked.",
  })
  @ApiEnvelopeResponse(AccountBalanceDto)
  async balance(@Req() req: AdminExpressRequest, @Param("id", ParseIntPipe) id: number) {
    return { data: await this.shahin.balance(id, this.adminId(req)) };
  }

  @Get("accounts/:id/statement")
  @RequirePermissions("accounting")
  @ApiOperation({
    summary: "Statement rows",
    description: "`trackNo`, `minAmount` and `maxAmount` are applied here; the bank filters only by date.",
  })
  @ApiEnvelopeResponse(StatementRowDto, { isArray: true })
  async statement(
    @Req() req: AdminExpressRequest,
    @Param("id", ParseIntPipe) id: number,
    @Query() query: StatementQueryDto,
  ) {
    return { data: await this.shahin.statement(id, query, this.adminId(req)) };
  }

  @Post("accounts/inquiry")
  // Nothing is created; these act on an existing account.
  @HttpCode(200)
  @RequirePermissions("wallets_ops")
  @ApiOperation({
    summary: "Who owns this destination account",
    description: "The «استعلام» step. Refused rather than answered blank when the bank names no owner.",
  })
  @ApiEnvelopeResponse(InquiryResultDto)
  async inquiry(@Req() req: AdminExpressRequest, @Body() dto: InquiryDto) {
    return { data: await this.shahin.inquiry(dto.destAccount, this.adminId(req)) };
  }

  @Post("transfer")
  // Nothing is created; these act on an existing account.
  @HttpCode(200)
  @RequirePermissions("wallets_ops")
  @RequireOperationOtp(OtpScope.SHAHIN_TRANSFER)
  @ApiOperation({
    summary: "Move money",
    description:
      "Requires an operation OTP bound to the source, destination and amount — a code issued for " +
      "one amount cannot be spent on another.",
  })
  @ApiEnvelopeResponse(Object)
  async transfer(@Req() req: AdminExpressRequest, @Body() dto: TransferDto) {
    return { data: await this.shahin.transfer(dto, this.adminId(req)) };
  }

  @Post("batch-transfer")
  // Nothing is created; these act on an existing account.
  @HttpCode(200)
  @RequirePermissions("wallets_ops")
  @RequireOperationOtp(OtpScope.WITHDRAW_BULK)
  @ApiOperation({
    summary: "Move money to several destinations",
    description: "One code covers the whole batch, bound to the set of destination accounts in `refIds`.",
  })
  @ApiEnvelopeResponse(Object)
  async batchTransfer(@Req() req: AdminExpressRequest, @Body() dto: BatchTransferDto) {
    return { data: await this.shahin.batchTransfer({ ...dto }, this.adminId(req)) };
  }
}
