import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNumber, IsOptional, Min } from "class-validator";
import { OrderStatusEnum } from "../../../order/enum/order.status.enum";

export class AdminUpdateOrderDto {
  @ApiPropertyOptional({ enum: OrderStatusEnum })
  @IsOptional()
  @IsEnum(OrderStatusEnum)
  status?: OrderStatusEnum;

  @ApiPropertyOptional({ description: "Update order quantity" })
  @IsOptional()
  @IsNumber()
  @Min(0.00000001)
  quantity?: number;

  @ApiPropertyOptional({ description: "Executed quantity (admin pass order)" })
  @IsOptional()
  @IsNumber()
  @Min(0)
  executedQuantity?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  commission?: number;

  @ApiPropertyOptional()
  @IsOptional()
  notes?: string;

  @ApiProperty({ description: "Admin action reason" })
  @IsOptional()
  adminNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: any;
}
