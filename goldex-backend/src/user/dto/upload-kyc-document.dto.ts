import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { FileTargetEnum } from "../../file/enum/file.target.enum";

export class UploadKycDocumentDto {
  @ApiProperty({ enum: FileTargetEnum })
  @IsEnum(FileTargetEnum)
  fileTarget: FileTargetEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  //   @ApiProperty({ required: false })
  //   @IsOptional()
  //   @IsObject()
  //   metadata?: Record<string, any>;

  @ApiProperty({
    type: "string",
    format: "binary",
    description: "file",
  })
  file: any;
}
