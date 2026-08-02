import { Controller, Get, Patch, Post, Body, Param, Query, UseGuards, Req, Logger, UseInterceptors, UploadedFile, BadRequestException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { WithdrawService } from "./withdraw.service";
import { WithdrawQueryDto } from "./dto/withdraw-query.dto";
import { ProcessWithdrawDto } from "./dto/process-withdraw.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";
import { MinioService } from "../minio/minio.service";
import { OcrService } from "../ocr/ocr.service";

@ApiTags("Admin-Withdraw")
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller("admin/withdraw")
export class WithdrawAdminController {
  private readonly logger = new Logger(WithdrawAdminController.name);

  constructor(
    private readonly withdrawService: WithdrawService,
    private readonly minioService: MinioService,
    private readonly ocrService: OcrService,
  ) {}

  @Get()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "List all withdrawals (admin)" })
  async findAll(@Query() query: WithdrawQueryDto) {
    return { data: await this.withdrawService.findAll(query) };
  }

  @Get(":id")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Get withdrawal details (admin)" })
  async findOne(@Param("id") id: string) {
    return { data: await this.withdrawService.findById(id) };
  }

  @Post("upload-and-ocr")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Upload withdrawal receipt image and run OCR (admin)" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadAndOcr(@Req() req: AdminExpressRequest, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("No file uploaded");

    const adminId = req.admin?.id || "system";
    const objectName = `withdraw-admin/${adminId}/${Date.now()}-${file.originalname}`;

    let uploadedFile;
    try {
      uploadedFile = await this.minioService.uploadFile(
        {
          objectName,
          stream: file.buffer,
          size: file.size,
          contentType: file.mimetype,
          metadata: { adminId, uploadedBy: "admin", originalName: file.originalname },
        },
        "withdraw"
      );
    } catch (error) {
      throw new BadRequestException("Failed to upload file");
    }

    try {
      const base64Image = file.buffer.toString("base64");
      const ocrResult = await this.ocrService.processImage(base64Image);
      return { data: { url: uploadedFile.name, ocr: ocrResult } };
    } catch (error) {
      return {
        data: {
          url: uploadedFile.name,
          ocr: { success: false, texts: [], parsed: { date: null, amount: null, transactionId: null, cardNumber: null, accountNumber: null, sourceCard: null, destCard: null }, raw: "" },
        },
      };
    }
  }

  @Post(":id/approve")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Approve a gateway-bound withdrawal (executed by goldex-cbp)" })
  async approve(@Req() req: AdminExpressRequest, @Param("id") id: string) {
    const adminId = req.admin?.id || "system";
    const result = await this.withdrawService.approveGatewayWithdraw(adminId, id);
    return { data: result };
  }

  @Patch(":id/process")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Approve or reject a withdrawal" })
  async process(@Req() req: AdminExpressRequest, @Param("id") id: string, @Body() dto: ProcessWithdrawDto) {
    const adminId = req.admin?.id || "system";

    const correctedParsed = dto.metadata?.ocr?.parsed;
    let originalParsed: Record<string, any> | null = null;
    let picturePath: string | null = null;

    if (correctedParsed) {
      const original = await this.withdrawService.findById(id);
      originalParsed = original.metadata?.ocr?.parsed || null;
      picturePath = dto.picturePath || original.picturePath;
    }

    const result = await this.withdrawService.process(adminId, id, dto);

    if (correctedParsed && originalParsed) {
      const changedKeys = Object.keys(correctedParsed).filter(
        (k) => correctedParsed[k] !== originalParsed[k],
      );
      if (changedKeys.length > 0 && picturePath) {
        this.sendOcrFeedback(picturePath, originalParsed, correctedParsed);
      }
    }

    return { data: result };
  }

  private async sendOcrFeedback(
    picturePath: string,
    originalParsed: Record<string, any>,
    correctedParsed: Record<string, any>,
  ) {
    try {
      const bucket = process.env.MINIO_BUCKET || "default";
      const stream = await this.minioService.getFileStream(bucket, picturePath);
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const imageBase64 = buffer.toString("base64");

      const originalTexts = Object.values(originalParsed).filter(Boolean) as string[];
      const correctedTexts = Object.values(correctedParsed).filter(Boolean) as string[];

      if (originalTexts.length > 0 || correctedTexts.length > 0) {
        await this.ocrService.sendFeedback(
          imageBase64,
          originalTexts.length > 0 ? originalTexts : correctedTexts,
          correctedTexts,
          "withdraw-admin",
        );
        this.logger.log("OCR feedback sent for withdraw");
      }
    } catch (err) {
      this.logger.error(`Failed to send OCR feedback: ${(err as Error).message}`);
    }
  }
}
