import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { RequirePermissions } from "../admin-role/guard/require-permissions.decorator";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";
import {
  ApiAdminErrorResponses,
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../shared/swagger";
import { AdminAccountingService } from "./admin-accounting.service";
import { AccountingExportService } from "./accounting-export.service";
import {
  AccountingLedgerQueryDto,
  AccountingLedgerRowDto,
  AccountingSeriesDto,
  AccountingSeriesQueryDto,
  AccountingStatsDto,
  CreateVoucherDto,
  ReviewVoucherDto,
  VoucherCatalogsDto,
  VoucherDto,
  VoucherQueryDto,
} from "./dto/accounting.dto";

@ApiTags("Admin-Accounting")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
// Accounting is finance's screen; admins and the root role see it too.
@RequirePermissions("accounting")
@Controller("admin/accounting")
export class AdminAccountingController {
  constructor(
    private readonly accounting: AdminAccountingService,
    private readonly exporter: AccountingExportService,
  ) {}

  private adminId(req: AdminExpressRequest): string {
    return req.admin?.id;
  }

  // ── §5.21 ───────────────────────────────────────────────────────────────

  @Get("stats")
  @ApiOperation({
    summary: "Income, expense, net profit and margin",
    description: "Over the whole ledger. Figures are in `unit`; margin is null when there was no income.",
  })
  @ApiEnvelopeResponse(AccountingStatsDto)
  async stats() {
    return { data: await this.accounting.stats() };
  }

  @Get("series")
  @ApiOperation({
    summary: "A metric over Jalali buckets",
    description:
      "Bucketed by Jalali month, day or hour — the boundaries come from the calendar, not from " +
      "`date_trunc`, which would misfile the edges. `unit` is null for the margin metric, which " +
      "is a percentage rather than money.",
  })
  @ApiEnvelopeResponse(AccountingSeriesDto)
  async series(@Query() query: AccountingSeriesQueryDto) {
    return { data: await this.accounting.series(query) };
  }

  // Declared before the voucher routes so `ledger/export` is not read as an id.
  @Get("ledger/export")
  @ApiOperation({
    summary: "The filtered ledger as a spreadsheet",
    description:
      "Takes the same filters as the list, so an export never disagrees with the screen it was " +
      "taken from. Streams the file; there is no PDF, as §4.7 settled.",
  })
  @ApiProduces("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @ApiResponse({ status: 200, description: "The workbook", schema: { type: "string", format: "binary" } })
  async exportLedger(@Query() query: AccountingLedgerQueryDto, @Res() res: Response) {
    const rows = await this.accounting.ledgerForExport(query);
    await this.exporter.streamLedger(rows, res);
  }

  @Get("ledger")
  @ApiOperation({ summary: "System ledger rows, filtered" })
  @ApiPaginatedResponse(AccountingLedgerRowDto)
  async ledger(@Query() query: AccountingLedgerQueryDto) {
    return { data: await this.accounting.ledgerRows(query) };
  }

  // ── §5.22 ───────────────────────────────────────────────────────────────

  @Get("catalogs")
  @ApiOperation({
    summary: "Options for the voucher form",
    description: "Categories, wallet types, subsets, symbols, customer types and movements.",
  })
  @ApiEnvelopeResponse(VoucherCatalogsDto)
  async catalogs() {
    return { data: await this.accounting.catalogs() };
  }

  @Get("vouchers/export")
  @ApiOperation({ summary: "The filtered vouchers as a spreadsheet" })
  @ApiProduces("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
  @ApiResponse({ status: 200, description: "The workbook", schema: { type: "string", format: "binary" } })
  async exportVouchers(@Query() query: VoucherQueryDto, @Res() res: Response) {
    const rows = await this.accounting.vouchersForExport(query);
    await this.exporter.streamVouchers(rows, res);
  }

  @Get("vouchers")
  @ApiOperation({ summary: "Vouchers, filtered" })
  @ApiPaginatedResponse(VoucherDto)
  async listVouchers(@Query() query: VoucherQueryDto) {
    return { data: await this.accounting.listVouchers(query) };
  }

  @Post("vouchers")
  @ApiOperation({
    summary: "Create a voucher as a draft",
    description:
      "`side` is derived from `movement` and ignored if sent — a voucher whose stated side " +
      "disagreed with its movement reconciles to nothing. Always created as a draft; booking is " +
      "a separate, reviewed step.",
  })
  @ApiEnvelopeResponse(VoucherDto, { status: 201 })
  async createVoucher(@Req() req: AdminExpressRequest, @Body() dto: CreateVoucherDto) {
    return { data: await this.accounting.createVoucher(this.adminId(req), dto) };
  }

  @Get("vouchers/:id")
  @ApiOperation({ summary: "One voucher" })
  @ApiEnvelopeResponse(VoucherDto)
  async findVoucher(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.accounting.findVoucher(id) };
  }

  @Post("vouchers/:id/submit")
  @ApiOperation({ summary: "Move a draft into the approval queue" })
  @ApiEnvelopeResponse(VoucherDto, { status: 201 })
  async submitVoucher(@Req() req: AdminExpressRequest, @Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.accounting.submitVoucher(this.adminId(req), id) };
  }

  @Post("vouchers/:id/finalize")
  @ApiOperation({
    summary: "Book a pending voucher",
    description:
      "Refused for the admin who created it: booking one's own entry removes the only control " +
      "this workflow has, and a finance lead holding both rights could otherwise do both halves " +
      "alone. A second factor belongs in operation OTP (§4.3), which is not built yet — this " +
      "deliberately accepts no otp field it would have to ignore.",
  })
  @ApiEnvelopeResponse(VoucherDto, { status: 201 })
  async finalizeVoucher(
    @Req() req: AdminExpressRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReviewVoucherDto,
  ) {
    return { data: await this.accounting.finalizeVoucher(this.adminId(req), id, dto) };
  }

  @Post("vouchers/:id/reject")
  @ApiOperation({ summary: "Refuse a pending voucher" })
  @ApiEnvelopeResponse(VoucherDto, { status: 201 })
  async rejectVoucher(
    @Req() req: AdminExpressRequest,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReviewVoucherDto,
  ) {
    return { data: await this.accounting.rejectVoucher(this.adminId(req), id, dto) };
  }
}
