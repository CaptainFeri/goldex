import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { DepositService } from "./deposit.service";
import { CreateDepositDto } from "./dto/create-deposit.dto";
import { DepositQueryDto } from "./dto/deposit-query.dto";
import { UserAuthGuard } from "../user/auth/Guard/user.guard";
import { UserExpressRequest } from "../user/auth/types/user-express-request";
import { MinioService } from "../minio/minio.service";
import { OcrService } from "../ocr/ocr.service";

@ApiTags("Deposit")
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller("deposit")
export class DepositController {
  constructor(
    private readonly depositService: DepositService,
    private readonly minioService: MinioService,
    private readonly ocrService: OcrService
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a deposit request" })
  async create(@Req() req: UserExpressRequest, @Body() dto: CreateDepositDto) {
    const userId = req.user["id"];
    return { data: await this.depositService.create(userId, dto) };
  }

  @Get()
  @ApiOperation({ summary: "List user deposits" })
  async findAll(@Req() req: UserExpressRequest, @Query() query: DepositQueryDto) {
    const userId = req.user["id"];
    return { data: await this.depositService.findByUser(userId, query) };
  }

  @Post("upload-picture")
  @ApiOperation({ summary: "Upload a picture for deposit" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  async uploadPicture(@Req() req: UserExpressRequest, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new Error("No file uploaded");
    const userId = req.user["id"];
    const objectName = `deposit/${userId}/${Date.now()}-${file.originalname}`;
    const uploadedFile = await this.minioService.uploadFile(
      {
        objectName,
        stream: file.buffer,
        size: file.size,
        contentType: file.mimetype,
        metadata: { userId, uploadedBy: "user", originalName: file.originalname },
      },
      "deposit"
    );
    return { data: { url: uploadedFile.name } };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get deposit details" })
  async findOne(@Req() req: UserExpressRequest, @Param("id") id: string) {
    const userId = req.user["id"];
    return { data: await this.depositService.findUserDepositById(userId, id) };
  }

  @Post(":id/cancel")
  @ApiOperation({ summary: "Cancel a pending deposit" })
  async cancel(@Req() req: UserExpressRequest, @Param("id") id: string) {
    const userId = req.user["id"];
    return { data: await this.depositService.cancel(userId, id) };
  }

  // deposit.controller.ts (updated upload-and-ocr endpoint)
  @Post("upload-and-ocr")
  @ApiOperation({ summary: "Upload deposit picture and run OCR" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
      },
    })
  )
  async uploadAndOcr(@Req() req: UserExpressRequest, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new Error("No file uploaded");

    const userId = req.user["id"];
    const objectName = `deposit/${userId}/${Date.now()}-${file.originalname}`;

    // Upload to MinIO (handle errors)
    let uploadedFile;
    try {
      uploadedFile = await this.minioService.uploadFile(
        {
          objectName,
          stream: file.buffer,
          size: file.size,
          contentType: file.mimetype,
          metadata: { userId, uploadedBy: "user", originalName: file.originalname },
        },
        "deposit"
      );
    } catch (error) {
      console.error(`Failed to upload file: ${error}`);
      throw new BadRequestException("Failed to upload file");
    }

    try {
      const base64Image = file.buffer.toString("base64");
      const ocrResult = await this.ocrService.processImage(base64Image);

      return {
        data: {
          url: uploadedFile.name,
          ocr: ocrResult,
        },
      };
    } catch (error) {
      console.error(`OCR processing failed: ${error}`);
      return {
        data: {
          url: uploadedFile.name,
          ocr: {
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
          },
        },
      };
    }
  }

  @Post("ocr-feedback")
  @ApiOperation({ summary: "Send OCR correction feedback for deposit receipt" })
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
      "deposit"
    );
    return { data: { success: sent } };
  }
}
