import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { UserKycService } from "../service/user-kyc.service";
import { VerifyLevel1Dto } from "../dto/verifyLevel1.dto";
import { VerifyBankAccountDto } from "../dto/verifyBankAccount.dto";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserAuthGuard } from "../auth/Guard/user.guard";
import { UserExpressRequest } from "../auth/types/user-express-request";
import { FileInterceptor } from "@nestjs/platform-express";
import { UploadKycDocumentDto } from "../dto/upload-kyc-document.dto";

@ApiTags("User-Kyc")
@Controller("kyc")
export class UserKycController {
  constructor(private readonly kycService: UserKycService) {}

  @Post("upload")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Upload KYC document (max 5 documents total)" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file"))
  async uploadDocument(@Req() req, @UploadedFile() file: Express.Multer.File, @Body() dto: UploadKycDocumentDto) {
    if (!file) {
      throw new Error("No file uploaded");
    }
    return { data: await this.kycService.uploadDocument(req.user.id, file, dto) };
  }

  @Get("documents")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get all user KYC documents" })
  async getUserDocuments(@Req() req) {
    return { data: await this.kycService.getUserDocuments(req.user.id) };
  }

  @Get("documents/status/:status")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get user documents by status" })
  async getUserDocumentsByStatus(@Req() req, @Param("status") status: string) {
    return { data: await this.kycService.getUserDocumentsByStatus(req.user.id, status as any) };
  }

  @Get("stats")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get user upload statistics" })
  async getUserUploadStats(@Req() req) {
    return { data: await this.kycService.getUserUploadStats(req.user.id) };
  }

  @Get("documents/:documentId")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get specific document by ID" })
  async getDocumentById(@Req() req, @Param("documentId", ParseUUIDPipe) documentId: string) {
    return { data: await this.kycService.getDocumentById(documentId, req.user.id) };
  }

  @Delete("documents/:documentId")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete a KYC document (only pending or rejected)" })
  async deleteDocument(@Req() req, @Param("documentId", ParseUUIDPipe) documentId: string) {
    await this.kycService.deleteDocument(req.user.id, documentId);
    return { data: "Document deleted successfully" };
  }

  @Post("level-1")
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async verifyLevel1(@Req() req: UserExpressRequest, @Body() dto: VerifyLevel1Dto) {
    return { data: await this.kycService.verifyLevel1(req.user.id, dto.nationalId) };
  }

  @Post("level-2")
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async verifyLevel2(@Req() req: UserExpressRequest, @Body() dto: VerifyBankAccountDto) {
    return { data: await this.kycService.verifyLevel2(req.user, dto) };
  }

  @Get("")
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async getKyc(@Req() req: UserExpressRequest) {
    return { data: await this.kycService.getKyc(req.user.id) };
  }
}
