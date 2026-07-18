import { IsUUID, IsOptional, IsString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class SettleCreditDto {
  @ApiProperty()
  @IsUUID()
  creditId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  imagePath?: string;
}
