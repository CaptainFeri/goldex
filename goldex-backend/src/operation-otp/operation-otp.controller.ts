import { Body, Controller, Get, HttpCode, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";
import { ApiAdminErrorResponses, ApiEnvelopeResponse } from "../shared/swagger";
import { OperationOtpService } from "./operation-otp.service";
import { IssueOtpDto, OtpChallengeDto } from "./dto/operation-otp.dto";
import { OTP_SCOPES } from "./otp-scopes";
import { OtpScopeCatalogDto } from "./dto/otp-scope-catalog.dto";

@ApiTags("Admin-Operation-OTP")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard)
@Controller("admin/operations")
export class OperationOtpController {
  constructor(private readonly otp: OperationOtpService) {}

  @Get("otp/scopes")
  @ApiOperation({
    summary: "The scope catalog",
    description:
      "The fields each scope hashes, so the panel derives `payloadHash` from the server's own " +
      "contract instead of a copy that can drift out of step with it.",
  })
  @ApiEnvelopeResponse(OtpScopeCatalogDto, { isArray: true })
  async scopes() {
    return {
      data: Object.entries(OTP_SCOPES).map(([scope, d]) => ({
        scope,
        label: d.label,
        fields: d.fields,
        bulk: !!d.bulk,
        refIdFrom: d.refIdFrom,
      })),
    };
  }

  @Post("otp")
  @HttpCode(200)
  @ApiOperation({
    summary: "Request a code for one operation",
    description:
      "Sends a 60-second code to the caller's own phone. One live challenge per " +
      "(admin, scope, record): while one is alive this answers `OTP.ALREADY_SENT:<seconds>`, " +
      "so the panel can count down rather than re-texting the operator.",
  })
  @ApiEnvelopeResponse(OtpChallengeDto)
  async issue(@Req() req: AdminExpressRequest, @Body() dto: IssueOtpDto) {
    return { data: await this.otp.issue(req.admin, dto) };
  }
}
