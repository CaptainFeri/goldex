import { IsUUID, IsNumber, IsString, IsOptional, IsBoolean, Min, Max } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateScheduleDto {
  @ApiProperty()
  @IsUUID()
  adminId: string;

  @ApiProperty({ description: "0=Sunday, 1=Monday, ..., 6=Saturday" })
  @IsNumber()
  @Min(0)
  @Max(6)
  dayOfWeek: number;

  @ApiProperty()
  @IsString()
  dayLabel: string;

  @ApiProperty({ example: "09:00" })
  @IsString()
  startTime: string;

  @ApiProperty({ example: "18:00" })
  @IsString()
  endTime: string;

  @ApiProperty({ required: false, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ required: false, default: "Asia/Tehran" })
  @IsOptional()
  @IsString()
  timezone?: string;
}
