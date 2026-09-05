import { ApiProperty } from "@nestjs/swagger";
import { FileTargetEnum } from "../enum/file.target.enum";

export class UploadFileDto {
  @ApiProperty({
    enum: FileTargetEnum,
    description: "select enum type",
    default: FileTargetEnum.LICENCE,
  })
  FileTarget: FileTargetEnum;

  @ApiProperty({
    type: "string",
    format: "binary",
    description: "file",
  })
  file: any;
}
