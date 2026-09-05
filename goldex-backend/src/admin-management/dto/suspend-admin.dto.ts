import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class SuspendAdminDto {
  @IsBoolean()
  @IsNotEmpty()
  @ApiProperty()
  isSuspended: boolean;

  @IsString()
  @IsOptional()
  @ApiPropertyOptional()
  reason?: string;
}
