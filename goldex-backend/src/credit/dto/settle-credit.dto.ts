import { IsUUID, IsOptional, IsString, IsBoolean } from "class-validator";
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

  @ApiProperty({
    required: false,
    description:
      "Bypass the shortfall gate and settle even though the facility's credit wallets would net negative " +
      "after collateral. Admin-only override, audited on the settlement's finance-log entry.",
  })
  @IsOptional()
  @IsBoolean()
  force?: boolean;
}
