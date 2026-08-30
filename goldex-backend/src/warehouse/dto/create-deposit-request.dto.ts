import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNumber, IsString, IsUUID, Min, IsOptional } from "class-validator";

export class CreateDepositRequestDto {
  @ApiProperty({ description: "Warehouse ID" })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ description: "Weight of material to deposit" })
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
