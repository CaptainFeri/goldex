import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsEnum, IsOptional } from "class-validator";
import { RequestStatusEnum } from "../../enum/request-status.enum";

export class AdminProcessRequestDto {
  @ApiProperty({ enum: RequestStatusEnum })
  @IsEnum(RequestStatusEnum)
  status: RequestStatusEnum;

  @ApiPropertyOptional({ description: "Admin notes" })
  @IsString()
  @IsOptional()
  notes?: string;

  @ApiPropertyOptional({ description: "Delivery location (for withdrawal)" })
  @IsString()
  @IsOptional()
  deliveryLocation?: string;

  @ApiPropertyOptional({ description: "Delivery date" })
  @IsString()
  @IsOptional()
  deliveryDate?: string;

  @ApiPropertyOptional({ description: "Delivery time" })
  @IsString()
  @IsOptional()
  deliveryTime?: string;

  @ApiPropertyOptional({
    description: "Explicit packet to assign (withdraw approval). Own IN_WAREHOUSE or orphan packet. Omit to auto-select.",
  })
  @IsString()
  @IsOptional()
  packetId?: string;
}
