import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsNumber, IsOptional, IsUUID, Min } from "class-validator";

/**
 * Asks what a warehouse could serve a withdrawal of this size from.
 *
 * Warehouse-scoped by design: a user picks where they are collecting from
 * before they can be shown what is on that shelf, because a package in another
 * city is not an answer to "what can I pick up".
 */
export class AllocationOptionsQueryDto {
  @ApiProperty({ description: "انباری که کاربر برای تحویل انتخاب کرده" })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ description: "وزن درخواستی (گرم ۷۵۰)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  weight: number;

  @ApiPropertyOptional({ description: "نماد ماده درخواستی" })
  @IsUUID()
  @IsOptional()
  symbolId?: string;
}
