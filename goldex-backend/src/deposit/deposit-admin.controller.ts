import { Controller, Get, Patch, Body, Param, Query, UseGuards, Req, Logger } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import {
  ApiAdminErrorResponses,
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../shared/swagger";
import { DepositDto } from "./dto/deposit.dto";
import { DepositService } from "./deposit.service";
import { DepositQueryDto } from "./dto/deposit-query.dto";
import { ProcessDepositDto } from "./dto/process-deposit.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";
import { MinioService } from "../minio/minio.service";
import { OcrService } from "../ocr/ocr.service";

@ApiTags("Admin-Deposit")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard)
@Controller("admin/deposit")
export class DepositAdminController {
  private readonly logger = new Logger(DepositAdminController.name);

  constructor(
    private readonly depositService: DepositService,
    private readonly minioService: MinioService,
    private readonly ocrService: OcrService,
  ) {}

  @Get()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "List all deposits (admin)" })
  @ApiPaginatedResponse(DepositDto)
  async findAll(@Query() query: DepositQueryDto) {
    return { data: await this.depositService.findAll(query) };
  }

  @Get(":id")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Get deposit details (admin)" })
  @ApiEnvelopeResponse(DepositDto)
  async findOne(@Param("id") id: string) {
    return { data: await this.depositService.findById(id) };
  }

  @Patch(":id/process")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN, AdminRole.FINANCE)
  @ApiOperation({ summary: "Approve or reject a deposit" })
  @ApiEnvelopeResponse(DepositDto)
  async process(@Req() req: AdminExpressRequest, @Param("id") id: string, @Body() dto: ProcessDepositDto) {
    const adminId = req.admin?.id || "system";

    const correctedParsed = dto.metadata?.ocr?.parsed;
    let originalParsed: Record<string, any> | null = null;
    let picturePath: string | null = dto.picturePath || null;

    if (correctedParsed) {
      const original = await this.depositService.findById(id);
      originalParsed = original.metadata?.ocr?.parsed || null;
      if (!picturePath) picturePath = original.picturePath;
    }

    const result = await this.depositService.process(adminId, id, dto);

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
          "deposit-admin",
        );
        this.logger.log("OCR feedback sent for deposit");
      }
    } catch (err) {
      this.logger.error(`Failed to send OCR feedback: ${(err as Error).message}`);
    }
  }
}
