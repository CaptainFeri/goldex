import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, UseInterceptors, UploadedFile } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { WithdrawService } from "./withdraw.service";
import { CreateWithdrawDto } from "./dto/create-withdraw.dto";
import { WithdrawQueryDto } from "./dto/withdraw-query.dto";
import { UserAuthGuard } from "../user/auth/Guard/user.guard";
import { UserExpressRequest } from "../user/auth/types/user-express-request";
import { MinioService } from "../minio/minio.service";
import { OcrService } from "../ocr/ocr.service";

@ApiTags("Withdraw")
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller("withdraw")
export class WithdrawController {
  constructor(
    private readonly withdrawService: WithdrawService,
    private readonly minioService: MinioService,
    private readonly ocrService: OcrService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a withdrawal request" })
  async create(@Req() req: UserExpressRequest, @Body() dto: CreateWithdrawDto) {
    const userId = req.user["id"];
    return { data: await this.withdrawService.create(userId, dto) };
  }

  @Get()
  @ApiOperation({ summary: "List user withdrawals" })
  async findAll(@Req() req: UserExpressRequest, @Query() query: WithdrawQueryDto) {
    const userId = req.user["id"];
    return { data: await this.withdrawService.findByUser(userId, query) };
  }

  @Post("upload-picture")
  @ApiOperation({ summary: "Upload a picture for withdrawal" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  async uploadPicture(@Req() req: UserExpressRequest, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new Error("No file uploaded");
    const userId = req.user["id"];
    const objectName = `withdraw/${userId}/${Date.now()}-${file.originalname}`;
    const uploadedFile = await this.minioService.uploadFile(
      {
        objectName,
        stream: file.buffer,
        size: file.size,
        contentType: file.mimetype,
        metadata: { userId, uploadedBy: "user", originalName: file.originalname },
      },
      "withdraw",
    );
    return { data: { url: uploadedFile.name } };
  }

  @Post("upload-and-ocr")
  @ApiOperation({ summary: "Upload withdrawal picture and run OCR" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  async uploadAndOcr(@Req() req: UserExpressRequest, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new Error("No file uploaded");
    const userId = req.user["id"];
    const objectName = `withdraw/${userId}/${Date.now()}-${file.originalname}`;
    const uploadedFile = await this.minioService.uploadFile(
      {
        objectName,
        stream: file.buffer,
        size: file.size,
        contentType: file.mimetype,
        metadata: { userId, uploadedBy: "user", originalName: file.originalname },
      },
      "withdraw",
    );
    const base64Image = file.buffer.toString("base64");
    let ocrResult;
    try {
      ocrResult = await this.ocrService.processImage(base64Image);
    } catch (error) {
      console.error(`OCR processing failed: ${error}`);
      ocrResult = {
        success: false,
        texts: [],
        parsed: {
          date: null,
          amount: null,
          transactionId: null,
          cardNumber: null,
          accountNumber: null,
          sourceCard: null,
          destCard: null,
        },
        raw: "",
      };
    }
    return {
      data: {
        url: uploadedFile.name,
        ocr: ocrResult,
      },
    };
  }

  @Post("ocr-feedback")
  @ApiOperation({ summary: "Send OCR correction feedback for withdraw receipt" })
  async ocrFeedback(
    @Body()
    body: {
      image_base64: string;
      original_texts: string[];
      corrected_texts: string[];
    }
  ) {
    const sent = await this.ocrService.sendFeedback(
      body.image_base64,
      body.original_texts,
      body.corrected_texts,
      "withdraw"
    );
    return { data: { success: sent } };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get withdrawal details" })
  async findOne(@Req() req: UserExpressRequest, @Param("id") id: string) {
    const userId = req.user["id"];
    return { data: await this.withdrawService.findUserWithdrawById(userId, id) };
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Cancel a pending withdrawal" })
  async cancel(@Req() req: UserExpressRequest, @Param("id") id: string) {
    const userId = req.user["id"];
    return { data: await this.withdrawService.cancel(userId, id) };
  }
}
