import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AdminKycService } from "./admin-kyc.service";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  ApiAdminErrorResponses,
  ApiEnvelopeResponse,
} from "../shared/swagger";
import {
  KycDocumentDto,
  KycDocumentPageDto,
  KycDocumentStatsDto,
  KycUserListDto,
} from "./dto/admin-kyc-response.dto";
import { AdminApproveDocumentsDto, AdminRejectDocumentDto, GetKycDocumentsQueryDto } from "./dto/admin-kyc.dto";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { SignedFileUrlService } from "../shared/files/signed-file-url.service";
import {
  withDocumentUrl,
  withDocumentUrls,
  withDocumentUrlPage,
} from "../shared/files/picture-url.mapper";

@Controller("admin/kyc")
@ApiTags("Admin-Kyc")
@ApiAdminErrorResponses()
export class AdminKycController {
  constructor(
    private readonly adminKycService: AdminKycService,
    private readonly signedFileUrlService: SignedFileUrlService
  ) {}

  @Get("admin/pending")
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @UseGuards(AdminAuthGuard)
  @ApiOperation({ summary: "Get pending documents for review" })
  @ApiEnvelopeResponse(KycDocumentPageDto)
  async getPendingDocuments(@Query() query: GetKycDocumentsQueryDto) {
    const page = await this.adminKycService.getPendingDocuments(query);
    return { data: withDocumentUrlPage(this.signedFileUrlService, page) };
  }

  @Get("admin/all")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get all documents (Admin only)" })
  @ApiEnvelopeResponse(KycDocumentPageDto)
  async getAllDocuments(@Query() query: GetKycDocumentsQueryDto) {
    const page = await this.adminKycService.getAllDocumentsForAdmin(query);
    return { data: withDocumentUrlPage(this.signedFileUrlService, page) };
  }

  @Get("admin/stats")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Get document statistics" })
  @ApiEnvelopeResponse(KycDocumentStatsDto)
  async getDocumentStats() {
    return { data: await this.adminKycService.getDocumentStats() };
  }

  @Get("admin/users")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "List users with their KYC level/status and info" })
  @ApiEnvelopeResponse(KycUserListDto)
  @ApiQuery({ name: "pageNumber", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "searchKey", required: false, type: String })
  async getUsersWithKyc(
    @Query("pageNumber") pageNumber?: string,
    @Query("pageSize") pageSize?: string,
    @Query("searchKey") searchKey?: string
  ) {
    const limit = Math.min(Math.max(parseInt(pageSize ?? "50", 10) || 50, 1), 100);
    const page = Math.max(parseInt(pageNumber ?? "1", 10) || 1, 1);
    return { data: await this.adminKycService.getUsersWithKyc(limit, limit * (page - 1), searchKey) };
  }

  @Post("admin/approve")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Approve one or more documents" })
  @ApiEnvelopeResponse(KycDocumentDto, { status: 201, isArray: true, description: "The approved documents, in the order requested" })
  async approveDocuments(@Req() req, @Body() dto: AdminApproveDocumentsDto) {
    const documents = await this.adminKycService.approveDocuments(req.admin.id, dto.documentIds, dto.notes);
    return { data: withDocumentUrls(this.signedFileUrlService, documents) };
  }

  @Post("admin/reject")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Reject a single document" })
  @ApiEnvelopeResponse(KycDocumentDto, { status: 201 })
  async rejectDocument(@Req() req, @Body() dto: AdminRejectDocumentDto) {
    const document = await this.adminKycService.rejectDocument(req.admin.id, dto.documentId, dto.reason, dto.notes);
    return { data: withDocumentUrl(this.signedFileUrlService, document) };
  }

  //   @Post("admin/reject-multiple")
  //   @UseGuards(AdminAuthGuard)
  //   //   @Roles(UserRole.ADMIN, UserRole.SUPPORT)
  //   @ApiOperation({ summary: "Reject multiple documents" })
  //   async rejectMultipleDocuments(@Req() req, @Body() dto: AdminRejectMultipleDocumentsDto) {
  //     return await this.adminKycService.rejectMultipleDocuments(req.user.id, dto.documentIds, dto.reason, dto.notes);
  //   }

  @Get("users/:userId/documents")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Get documents for a specific user (Admin)" })
  @ApiEnvelopeResponse(KycDocumentDto, { isArray: true })
  async getUserDocumentsById(@Param("userId", ParseUUIDPipe) userId: string) {
    return { data: withDocumentUrls(this.signedFileUrlService, await this.adminKycService.getUserDocuments(userId)) };
  }
}
