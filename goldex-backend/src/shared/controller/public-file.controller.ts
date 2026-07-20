import { Controller, Get, Param, Res } from "@nestjs/common";
import { Response } from "express";
import { MinioService } from "../../minio/minio.service";

@Controller()
export class PublicFileController {
  constructor(private readonly minioService: MinioService) {}

  @Get("deposit/picture/:objectName")
  async getDepositPicture(@Param("objectName") objectName: string, @Res() res: Response) {
    const bucket = process.env.MINIO_BUCKET || "default";
    const stat = await this.minioService.getFileStat(bucket, objectName);
    res.set({ "Content-Type": stat.contentType, "Content-Length": stat.size.toString() });
    const stream = await this.minioService.getFileStream(bucket, objectName);
    stream.pipe(res);
  }

  @Get("admin/deposit/picture/:objectName")
  async getAdminDepositPicture(@Param("objectName") objectName: string, @Res() res: Response) {
    const bucket = process.env.MINIO_BUCKET || "default";
    const stat = await this.minioService.getFileStat(bucket, objectName);
    res.set({ "Content-Type": stat.contentType, "Content-Length": stat.size.toString() });
    const stream = await this.minioService.getFileStream(bucket, objectName);
    stream.pipe(res);
  }

  @Get("withdraw/picture/:objectName")
  async getWithdrawPicture(@Param("objectName") objectName: string, @Res() res: Response) {
    const bucket = process.env.MINIO_BUCKET || "default";
    const stat = await this.minioService.getFileStat(bucket, objectName);
    res.set({ "Content-Type": stat.contentType, "Content-Length": stat.size.toString() });
    const stream = await this.minioService.getFileStream(bucket, objectName);
    stream.pipe(res);
  }

  @Get("admin/withdraw/picture/:objectName")
  async getAdminWithdrawPicture(@Param("objectName") objectName: string, @Res() res: Response) {
    const bucket = process.env.MINIO_BUCKET || "default";
    const stat = await this.minioService.getFileStat(bucket, objectName);
    res.set({ "Content-Type": stat.contentType, "Content-Length": stat.size.toString() });
    const stream = await this.minioService.getFileStream(bucket, objectName);
    stream.pipe(res);
  }
}
