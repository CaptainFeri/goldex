import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsOptional, IsPositive, IsUUID, Max, Min } from "class-validator";

export class AllocateCapitalDto {
  @ApiProperty({
    description:
      "Asset to freeze. A bot may hold several: allocating an asset it already " +
      "holds tops that allocation up, a new one adds a second budget.",
  })
  @IsUUID()
  symbolId: string;

  @ApiProperty({ description: "Amount to freeze, in the asset's own unit" })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiPropertyOptional({ description: "Share of this asset's allocation the bot may lose" })
  @IsNumber()
  @Min(1)
  @Max(100)
  @IsOptional()
  stopLossPercent?: number;
}

export class ReleaseCapitalDto {
  @ApiPropertyOptional({
    description: "Asset to release from; omit to release every asset the bot holds",
  })
  @IsUUID()
  @IsOptional()
  symbolId?: string;

  @ApiPropertyOptional({
    description:
      "Amount to release; omit to release everything still frozen. Requires " +
      "`symbolId`, since an amount cannot span two different assets.",
  })
  @IsNumber()
  @IsPositive()
  @IsOptional()
  amount?: number;
}
