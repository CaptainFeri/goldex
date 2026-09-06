import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { SignedFileController } from "./signed-file.controller";
import { SignedFileUrlService } from "./signed-file-url.service";

/**
 * Global so any module returning a stored object can mint a URL for it without
 * wiring the service through its own imports.
 */
@Global()
@Module({
  imports: [ConfigModule],
  controllers: [SignedFileController],
  providers: [SignedFileUrlService],
  exports: [SignedFileUrlService],
})
export class FilesModule {}
