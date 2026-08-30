import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsUUID, IsOptional, IsNumber, Min } from "class-validator";

export class CreateWithdrawRequestDto {
  @ApiProperty({ description: "Warehouse ID" })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ description: "Weight of material to withdraw" })
  @IsNumber()
  @Min(0.00000001)
  weight: number;

  @ApiProperty({ description: "Symbol ID (e.g. XAU)" })
  @IsUUID()
  symbolId: string;

  @ApiPropertyOptional({ description: "Additional notes" })
  @IsString()
  @IsOptional()
  notes?: string;
}
