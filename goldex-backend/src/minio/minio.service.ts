import { Injectable, Inject, Logger, BadRequestException, NotFoundException, StreamableFile } from "@nestjs/common";
import * as Minio from "minio";
import { Readable } from "stream";
import * as path from "path";
import { randomBytes } from "crypto";
import { MINIO_CONNECTION } from "./minio.constants";
import { UploadFileOptions, FileInfo, PresignedUrlOptions } from "./minio.interface";

@Injectable()
export class MinioService {
  private readonly logger = new Logger(MinioService.name);
  private defaultBucket: string;

  constructor(@Inject(MINIO_CONNECTION) private readonly minioClient: Minio.Client) {
    this.defaultBucket = process.env.MINIO_BUCKET || "default";
  }

  /**
   * Ensure bucket exists, create if not
   */
  async ensureBucket(bucketName: string = this.defaultBucket): Promise<void> {
    try {
      const exists = await this.minioClient.bucketExists(bucketName);
      if (!exists) {
        await this.minioClient.makeBucket(bucketName, process.env.MINIO_REGION || "us-east-1");

        // Set public read policy for thumbnails/images (optional)
        await this.setBucketPublicReadPolicy(bucketName);

        this.logger.log(`Bucket ${bucketName} created successfully`);
      }
    } catch (error) {
      this.logger.error(`Failed to ensure bucket ${bucketName}: ${error}`);
      throw new BadRequestException(`Bucket operation failed: ${error}`);
    }
  }

  /**
   * Set public read policy for a bucket
   */
  private async setBucketPublicReadPolicy(bucketName: string): Promise<void> {
    const policy = {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Principal: { AWS: ["*"] },
          Action: ["s3:GetObject"],
          Resource: [`arn:aws:s3:::${bucketName}/*`],
        },
      ],
    };

    await this.minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
  }

  /**
   * Upload file from local path
   */
  async uploadFile(options: UploadFileOptions, fileTarget: string): Promise<FileInfo> {
    const bucketName = options.bucketName || this.defaultBucket;
    await this.ensureBucket(bucketName);
    const fileExtName = path.extname(options.objectName);
    // The stored key is the only thing protecting these objects: the picture
    // routes in PublicFileController stream any key in this bucket to anyone
    // who names it. `fileTarget` is one of a handful of known strings and the
    // date suffix is guessable, so an attacker who can guess this segment can
    // read other users' receipts and KYC documents.
    //
    // Math.round(Math.random() * 16) drew from 17 non-uniform values via a
    // non-cryptographic PRNG whose state is recoverable from a few outputs --
    // and any user can harvest outputs by uploading their own files. Use a
    // CSPRNG instead. Existing keys are unaffected; only new uploads change.
    const randomName = randomBytes(16).toString("hex");
    try {
      const objectName = `${fileTarget}-${randomName}-${new Date().toISOString().slice(0, 10)}${fileExtName}`;
      const userMeta = this.prepareMetadata(options.metadata);
      const metaData = { ...userMeta, "Content-Type": options.contentType || "application/octet-stream" };

      let result: any;

      if (options.filePath) {
        // Upload from file path
        result = await this.minioClient.fPutObject(bucketName, objectName, options.filePath, metaData);
      } else if (options.stream) {
        // Upload from stream or buffer
        const stream = options.stream instanceof Buffer ? Readable.from(options.stream) : options.stream;

        result = await this.minioClient.putObject(bucketName, objectName, stream, options.size, metaData);
      } else {
        throw new BadRequestException("Either filePath or stream must be provided");
      }

      const url = await this.getFileUrl(bucketName, objectName);

      return {
        name: objectName,
        size: options.size || 0,
        etag: result.etag,
        lastModified: new Date(),
        contentType: options.contentType,
        url,
        metadata: metaData,
      };
    } catch (error) {
      this.logger.error(`Upload failed: ${error}`);
      throw new BadRequestException(`Failed to upload file: ${error}`);
    }
  }

  /**
   * Download file to local path
   */
  async downloadFile(bucketName: string, objectName: string, destinationPath: string): Promise<void> {
    await this.checkFileExists(bucketName, objectName);

    try {
      await this.minioClient.fGetObject(bucketName, objectName, destinationPath);
      this.logger.log(`File downloaded to ${destinationPath}`);
    } catch (error) {
      this.logger.error(`Download failed: ${error}`);
      throw new BadRequestException(`Failed to download file: ${error}`);
    }
  }

  /**
   * Delete file
   */
  async deleteFile(bucketName: string, objectName: string): Promise<void> {
    await this.checkFileExists(bucketName, objectName);

    try {
      await this.minioClient.removeObject(bucketName, objectName);
      this.logger.log(`File ${objectName} deleted from bucket ${bucketName}`);
    } catch (error) {
      this.logger.error(`Delete failed: ${error}`);
      throw new BadRequestException(`Failed to delete file: ${error}`);
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(bucketName: string, objectNames: string[]): Promise<void> {
    try {
      await this.minioClient.removeObjects(bucketName, objectNames);
      this.logger.log(`${objectNames.length} files deleted from bucket ${bucketName}`);
    } catch (error) {
      this.logger.error(`Batch delete failed: ${error}`);
      throw new BadRequestException(`Failed to delete files: ${error}`);
    }
  }

  /**
   * Get file metadata/info
   */
  async getFileStat(
    bucketName: string,
    objectName: string
  ): Promise<{
    size: number;
    etag: string;
    lastModified: Date;
    contentType: string;
    metadata: Record<string, string>;
  }> {
    try {
      const stat = await this.minioClient.statObject(bucketName, objectName);
      return {
        size: stat.size,
        etag: stat.etag,
        lastModified: stat.lastModified,
        contentType: stat.metaData?.["content-type"] || "application/octet-stream",
        metadata: stat.metaData || {},
      };
    } catch (error) {
      this.logger.error(`Failed to get file info: ${error}`);
      throw new NotFoundException(`File ${objectName} not found`);
    }
  }

  /**
   * Generate presigned URL for temporary access
   */
  async getPresignedUrl(options: PresignedUrlOptions): Promise<string> {
    const bucketName = options.bucketName || this.defaultBucket;
    const expires = options.expires || 24 * 60 * 60; // Default 24 hours
    const method = options.method || "GET";

    try {
      await this.checkFileExists(bucketName, options.objectName);

      let url: string;

      if (method === "GET") {
        url = await this.minioClient.presignedGetObject(bucketName, options.objectName, expires);
      } else if (method === "PUT") {
        url = await this.minioClient.presignedPutObject(bucketName, options.objectName, expires);
      } else {
        url = await this.minioClient.presignedUrl(method, bucketName, options.objectName, expires, options.queryParams);
      }

      return url;
    } catch (error) {
      this.logger.error(`Failed to generate presigned URL: ${error}`);
      throw new BadRequestException(`Failed to generate URL: ${error}`);
    }
  }

  /**
   * List all files in bucket with pagination
   */
  async listFiles(
    bucketName: string = this.defaultBucket,
    prefix?: string,
    recursive: boolean = true,
    limit: number = 100
  ): Promise<Minio.BucketItem[]> {
    await this.ensureBucket(bucketName);

    const objects: Minio.BucketItem[] = [];
    const stream = this.minioClient.listObjects(bucketName, prefix, recursive);

    return new Promise((resolve, reject) => {
      stream.on("data", (obj) => {
        if (objects.length < limit) {
          objects.push({
            name: obj.name,
            size: obj.size,
            etag: obj.etag,
            lastModified: obj.lastModified,
            // prefix: obj.prefix,
          });
        }
      });
      stream.on("error", reject);
      stream.on("end", () => resolve(objects));
    });
  }
  /**
   * Copy file within MinIO
   */
  async copyFile(
    sourceBucket: string,
    sourceObject: string,
    destinationBucket: string,
    destinationObject: string
  ): Promise<void> {
    await this.checkFileExists(sourceBucket, sourceObject);
    await this.ensureBucket(destinationBucket);

    try {
      await this.minioClient.copyObject(destinationBucket, destinationObject, `/${sourceBucket}/${sourceObject}`, null);
      this.logger.log(`File copied from ${sourceBucket}/${sourceObject} to ${destinationBucket}/${destinationObject}`);
    } catch (error) {
      this.logger.error(`Copy failed: ${error}`);
      throw new BadRequestException(`Failed to copy file: ${error}`);
    }
  }

  /**
   * Get public URL for file
   */
  async getFileUrl(bucketName: string, objectName: string): Promise<string> {
    const useSSL = process.env.MINIO_USE_SSL === "true";
    const endPoint = process.env.MINIO_ENDPOINT;
    const port = process.env.MINIO_PORT;

    const protocol = useSSL ? "https" : "http";
    const portString = port && port !== "80" && port !== "443" ? `:${port}` : "";

    return `${protocol}://${endPoint}${portString}/${bucketName}/${encodeURIComponent(objectName)}`;
  }

  /**
   * Generate unique filename
   */
  private generateUniqueName(originalName: string): string {
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    const timestamp = Date.now();
    const uuid = crypto.randomUUID().slice(0, 8);
    return `${name}-${timestamp}-${uuid}${ext}`;
  }

  /**
   * Prepare metadata for upload
   */
  private prepareMetadata(metadata?: Record<string, string>): Record<string, string> {
    const meta: Record<string, string> = {};

    if (metadata) {
      Object.entries(metadata).forEach(([key, value]) => {
        meta[`x-amz-meta-${key.toLowerCase()}`] = value;
      });
    }

    return meta;
  }

  /**
   * Get file as readable stream for serving through the app
   */
  async getFileStream(bucketName: string, objectName: string): Promise<Readable> {
    await this.checkFileExists(bucketName, objectName);
    try {
      return await this.minioClient.getObject(bucketName, objectName);
    } catch (error) {
      this.logger.error(`Failed to get file stream: ${error}`);
      throw new BadRequestException(`Failed to read file: ${error}`);
    }
  }

  /**
   * Check if file exists
   */
  private async checkFileExists(bucketName: string, objectName: string): Promise<void> {
    try {
      await this.minioClient.statObject(bucketName, objectName);
    } catch (error) {
      throw new NotFoundException(`File ${objectName} does not exist in bucket ${bucketName}`);
    }
  }

  /**
   * Get bucket size
   */
  async getBucketSize(bucketName: string = this.defaultBucket): Promise<number> {
    let totalSize = 0;
    const objects = await this.listFiles(bucketName, "", true);

    for (const obj of objects) {
      if (obj.size) {
        totalSize += obj.size;
      }
    }

    return totalSize;
  }

  /**
   * Cleanup expired temporary files
   */
  async cleanupExpiredFiles(bucketName: string, olderThanDays: number = 30): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const objects = await this.listFiles(bucketName);
    const expiredObjects = objects.filter((obj) => obj.lastModified && obj.lastModified < cutoffDate);

    if (expiredObjects.length > 0) {
      const objectNames = expiredObjects.map((obj) => obj.name);
      await this.deleteFiles(bucketName, objectNames);
      this.logger.log(`Cleaned up ${expiredObjects.length} expired files from bucket ${bucketName}`);
    }
  }
}
