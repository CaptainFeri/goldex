import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsNumber, IsOptional, Min } from "class-validator";
import { Type } from "class-transformer";

/**
 * Admin approves a withdraw request by explicitly choosing:
 *  - a USER packet (split into 2 with per-part info) or
 *  - an ORPHAN packet (assigned directly).
 */
export class ApproveWithdrawOutputDto {
  @ApiPropertyOptional({
    description: "Packet to assign: user's own IN_WAREHOUSE packet (split) or an ORPHAN orphan packet",
  })
  @IsString()
  @IsOptional()
  packetId?: string;

  // ---- Withdrawal part (part 1) ----
  @ApiPropertyOptional({ description: "Actual weight of the withdrawal part (defaults to the requested weight)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  @IsOptional()
  weight1?: number;

  @ApiPropertyOptional({ description: "ANG of the withdrawal part" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ang1?: number;

  @ApiPropertyOptional({ description: "AYAR of the withdrawal part" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ayar1?: number;

  @ApiPropertyOptional({ description: "Warehouse index position of the withdrawal part" })
  @IsString()
  @IsOptional()
  position1?: string;

  @ApiPropertyOptional({ description: "Picture of the withdrawal part (multipart file)" })
  @IsString()
  @IsOptional()
  picture1?: string;

  // ---- Remainder part (part 2, only when a user packet is split) ----
  @ApiPropertyOptional({ description: "Actual weight of the remainder part (defaults to packet weight - weight1)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  @IsOptional()
  weight2?: number;

  @ApiPropertyOptional({ description: "ANG of the remainder part" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ang2?: number;

  @ApiPropertyOptional({ description: "AYAR of the remainder part" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ayar2?: number;

  @ApiPropertyOptional({ description: "Warehouse index position of the remainder part" })
  @IsString()
  @IsOptional()
  position2?: string;

  @ApiPropertyOptional({ description: "Picture of the remainder part (uploaded file)" })
  @IsString()
  @IsOptional()
  picture2?: string;

  // ---- Delivery overrides (optional) ----
  @ApiPropertyOptional({ description: "Delivery date" })
  @IsString()
  @IsOptional()
  deliveryDate?: string;

  @ApiPropertyOptional({ description: "Delivery time" })
  @IsString()
  @IsOptional()
  deliveryTime?: string;

  @ApiPropertyOptional({ description: "Delivery location" })
  @IsString()
  @IsOptional()
  deliveryLocation?: string;
}