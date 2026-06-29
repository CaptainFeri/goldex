import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsNumber, IsOptional, IsUUID, Min, ValidateIf } from "class-validator";
import { OrderSideEnum } from "../enum/order.side.enum";
import { OrderTypeEnum } from "../enum/order.type.enum";

export class CreateOrderDto {
  @ApiProperty({ description: "Price pair ID" })
  @IsUUID()
  pricePairId: string;

  @ApiProperty({ enum: OrderSideEnum })
  @IsEnum(OrderSideEnum)
  side: OrderSideEnum;

  @ApiProperty({ enum: OrderTypeEnum })
  @IsEnum(OrderTypeEnum)
  orderType: OrderTypeEnum;

  @ApiProperty({ description: "Order quantity" })
  @IsNumber()
  @Min(0.00000001)
  quantity: number;

  @ApiPropertyOptional({ description: "Limit price (required for LIMIT orders)" })
  @ValidateIf((o) => o.orderType === OrderTypeEnum.LIMIT)
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

  @ApiPropertyOptional()
  @IsOptional()
  metadata?: any;
}
