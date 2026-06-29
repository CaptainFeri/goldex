import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsUUID } from "class-validator";
import { OrderSideEnum } from "../enum/order.side.enum";
import { OrderTypeEnum } from "../enum/order.type.enum";
import { OrderStatusEnum } from "../enum/order.status.enum";

export class OrderQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  pricePairId?: string;

  @ApiPropertyOptional({ enum: OrderSideEnum })
  @IsOptional()
  @IsEnum(OrderSideEnum)
  side?: OrderSideEnum;

  @ApiPropertyOptional({ enum: OrderTypeEnum })
  @IsOptional()
  @IsEnum(OrderTypeEnum)
  orderType?: OrderTypeEnum;

  @ApiPropertyOptional({ enum: OrderStatusEnum })
  @IsOptional()
  @IsEnum(OrderStatusEnum)
  status?: OrderStatusEnum;

  @ApiPropertyOptional()
  @IsOptional()
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  offset?: number;
}
