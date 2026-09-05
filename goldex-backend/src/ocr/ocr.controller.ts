import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { OcrService } from "./ocr.service";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";

@ApiTags("OCR")
@Controller("ocr")
export class OcrController {
  constructor(private readonly ocrService: OcrService) {}

  @Get("health")
  @ApiOperation({ summary: "Get OCR service health and model info" })
  async health() {
    const health = await this.ocrService.getHealth();
    return { data: health };
  }

  @Get("train/status")
  @ApiOperation({ summary: "Get OCR training status" })
  async trainStatus() {
    const status = await this.ocrService.getTrainStatus();
    return { data: status };
  }

  @Post("train/trigger")
  @ApiOperation({ summary: "Trigger OCR model training" })
  async triggerTrain() {
    const result = await this.ocrService.triggerTrain();
    return { data: result };
  }

  @Post("feedback")
  @ApiOperation({ summary: "Send OCR correction feedback" })
  async feedback(
    @Body()
    body: {
      image_base64: string;
      original_texts: string[];
      corrected_texts: string[];
      job_id?: string;
    }
  ) {
    const success = await this.ocrService.sendFeedback(
      body.image_base64,
      body.original_texts,
      body.corrected_texts,
      body.job_id
    );
    return { data: { success } };
  }
}
