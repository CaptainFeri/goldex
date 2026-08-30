import { Controller, Post, Get, Delete, Param, UploadedFile, UseInterceptors, Query, Body } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { MinioService } from "./minio.service";
import { UploadFileDto } from "../file/dto/upload.file.dto";
import { ApiBody, ApiConsumes } from "@nestjs/swagger";

@Controller("files")
export class FileController {
  constructor(private readonly minioService: MinioService) {}

  @Post("upload")
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    description: "Upload File Documents",
    type: UploadFileDto,
  })
  @UseInterceptors(FileInterceptor("file"))
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Body() data: UploadFileDto): Promise<any> {
    if (!file) {
      throw new Error("No file uploaded");
    }

    return {
      data: await this.minioService.uploadFile(
        {
          objectName: file.originalname,
          stream: file.buffer,
          size: file.size,
          contentType: file.mimetype,
          metadata: {
            uploadedBy: "user",
            originalName: file.originalname,
            fieldname: file.fieldname,
          },
        },
        data.FileTarget
      ),
    };
  }

  @Get("presigned/:objectName")
  async getPresignedUrl(@Param("objectName") objectName: string): Promise<any> {
    const url = await this.minioService.getPresignedUrl({
      objectName,
      expires: 3600,
    });
    return { data: url };
  }

  @Delete(":objectName")
  async deleteFile(@Param("objectName") objectName: string): Promise<any> {
    await this.minioService.deleteFile(process.env.MINIO_BUCKET, objectName);
    return { data: "File deleted successfully" };
  }

  @Get("list")
  async listFiles(@Query("prefix") prefix?: string): Promise<any> {
    const files = await this.minioService.listFiles(process.env.MINIO_BUCKET, prefix);
    return {
      data: files.map((file) => ({
        name: file.name,
        size: file.size,
        lastModified: file.lastModified,
      })),
    };
  }
}
