import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsEnum, IsString } from "class-validator";
import { RequestTypeEnum } from "../enum/request-type.enum";
import { RequestStatusEnum } from "../enum/request-status.enum";

export class RequestQueryDto {
  @ApiPropertyOptional({ enum: RequestTypeEnum })
  @IsEnum(RequestTypeEnum)
  @IsOptional()
  type?: RequestTypeEnum;

  @ApiPropertyOptional({ enum: RequestStatusEnum })
  @IsEnum(RequestStatusEnum)
  @IsOptional()
  status?: RequestStatusEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  limit?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  offset?: string;
}
