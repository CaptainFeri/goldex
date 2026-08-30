import { Readable } from "stream";

export interface MinioOptions {
  endPoint: string;
  port: number;
  useSSL: boolean;
  accessKey: string;
  secretKey: string;
  region?: string;
  bucket?: string;
}

export interface UploadFileOptions {
  bucketName?: string;
  objectName: string;
  filePath?: string;
  stream?: Readable | Buffer;
  size?: number;
  contentType?: string;
  metadata?: Record<string, string>;
}

export interface FileInfo {
  name: string;
  size: number;
  etag: string;
  lastModified: Date;
  contentType?: string;
  url: string;
  metadata?: Record<string, string>;
}

export interface PresignedUrlOptions {
  bucketName?: string;
  objectName: string;
  expires?: number;
  method?: string;
  queryParams?: Record<string, string>;
}

export interface BucketPolicy {
  Version: string;
  Statement: Array<{
    Effect: string;
    Principal: Record<string, string[]>;
    Action: string[];
    Resource: string[];
  }>;
}
