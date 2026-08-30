import { IsInt, IsNumber, IsOptional, IsString, Min } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";

export class ExtendCreditDto {
  @ApiProperty({ description: "Hours to extend the settlement timer" })
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  hours: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AdjustCreditLimitDto {
  @ApiProperty({ description: "New credit limit in the base (credit) symbol" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  newLimit: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
