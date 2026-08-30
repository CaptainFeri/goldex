import { Module, Global } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { MinioService } from "./minio.service";
import { MinioProvider } from "./minio.provider";
import { FileController } from "./example.controller";

@Global()
@Module({
  imports: [ConfigModule],
  providers: [MinioProvider, MinioService],
  // controllers: [FileController],
  exports: [MinioService],
})
export class MinioModule {}
