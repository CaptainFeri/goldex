import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsPositive, IsUUID, Max, Min } from "class-validator";

export class AllocateCapitalDto {
  @ApiProperty({ description: "Asset to freeze; must match the bot's existing allocation" })
  @IsUUID()
  symbolId: string;

  @ApiProperty({ description: "Amount to freeze, in the asset's own unit" })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ description: "Share of the total allocation the bot may lose" })
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  stopLossPercent?: number;
}

export class ReleaseCapitalDto {
  @ApiPropertyOptional({
    description: "Amount to release; omit to release everything still frozen",
  })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  amount?: number;
}
