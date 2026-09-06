import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNumber, IsOptional, IsPositive, IsString, IsUUID } from "class-validator";
import { ManagerFundingDirectionEnum } from "../enum/manager-account.enums";

export class CreateFundingRequestDto {
  @ApiProperty({ description: "The manager whose account is charged" })
  @IsUUID()
  adminId: string;

  @ApiProperty({ description: "Asset being charged (e.g. the gold symbol)" })
  @IsUUID()
  symbolId: string;

  @ApiProperty({ description: "Amount in the asset's own unit (e.g. grams of gold)" })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ enum: ManagerFundingDirectionEnum })
  @IsEnum(ManagerFundingDirectionEnum)
  direction: ManagerFundingDirectionEnum;

  @ApiPropertyOptional({ description: "Why the account is being charged" })
  @IsString()
  @IsOptional()
  reason?: string;
}
