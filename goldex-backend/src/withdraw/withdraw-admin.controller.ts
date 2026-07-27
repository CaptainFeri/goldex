import { Controller, Get, Patch, Body, Param, Query, UseGuards, Req, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
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
      picturePath = original.picturePath;
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
