import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString } from "class-validator";
import { ManagerAccountStatusEnum } from "../enum/manager-account.enums";

export class UpdateAccountStatusDto {
  @ApiProperty({ enum: ManagerAccountStatusEnum })
  @IsEnum(ManagerAccountStatusEnum)
  status: ManagerAccountStatusEnum;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  note?: string;
}
