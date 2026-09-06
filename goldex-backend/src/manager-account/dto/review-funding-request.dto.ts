import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsOptional, IsString } from "class-validator";

export class ReviewFundingRequestDto {
  @ApiProperty({ description: "True approves the request, false rejects it" })
  @IsBoolean()
  approve: boolean;

  @ApiPropertyOptional({ description: "Note shown to the requesting manager" })
  @IsString()
  @IsOptional()
  note?: string;
}
