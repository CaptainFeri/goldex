import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { OcrService } from "./ocr.service";

@Module({
  imports: [HttpModule],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
