import { ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, MaxLength, Min, ValidateNested } from "class-validator";

/**
 * One physical package produced from a single delivery.
 *
 * A user who hands in a bar may leave with it split across several packages —
 * the vault stores what fits its shelves, not what arrived — so intake accepts
 * a list rather than assuming one package per delivery.
 */
export class ConfirmMaterialPartDto {
  @ApiPropertyOptional({
    description: "وزن ظاهری این جزء (گرم). همراه با عیار، وزن باطنی ۷۵۰ از آن محاسبه می‌شود",
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  @IsOptional()
  apparentWeight?: number;

  @ApiPropertyOptional({ description: "عیار این جزء" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  @IsOptional()
  ayar?: number;

  @ApiPropertyOptional({
    description:
      "وزن باطنی ۷۵۰. وقتی وزن ظاهری و عیار داده شده باشند نادیده گرفته می‌شود و مقدار از روی آن دو محاسبه می‌گردد",
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  @IsOptional()
  pureWeight?: number;

  @ApiPropertyOptional({ description: "انگ (خلوص)" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ang?: number;

  @ApiPropertyOptional({ description: "موقعیت قرارگیری در انبار" })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  warehouseIndexPosition?: string;

  @ApiPropertyOptional({ description: "تصویر ترازو" })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  picture?: string;
}

export class ConfirmMaterialDto {
  @ApiPropertyOptional({ description: "ANG (purity)" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ang?: number;

  @ApiPropertyOptional({ description: "AYAR" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ayar?: number;

  @ApiPropertyOptional({
    description: "وزن ظاهری کل محموله. همراه با عیار، وزن باطنی ۷۵۰ از آن محاسبه می‌شود",
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  apparentWeight?: number;

  @ApiPropertyOptional({ description: "انگی (گرم)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  wastage?: number;

  @ApiPropertyOptional({ description: "Warehouse index position" })
  @IsString()
  @IsOptional()
  warehouseIndexPosition?: string;

  @ApiPropertyOptional({ description: "تصویر ترازو" })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  picture?: string;

  /**
   * When present, the delivery is stored as this many packages instead of one.
   *
   * The wallet is credited with the sum of their confirmed net weights, so
   * splitting at intake changes how the metal is shelved and nothing else
   * about what the depositor receives.
   */
  @ApiPropertyOptional({
    type: [ConfirmMaterialPartDto],
    description:
      "تقسیم محموله به چند بسته هنگام ورود. اگر خالی باشد، کل محموله به‌صورت یک بسته ثبت می‌شود",
  })
  @Type(() => ConfirmMaterialPartDto)
  @IsArray()
  @ValidateNested({ each: true })
  @ArrayMinSize(1)
  @IsOptional()
  parts?: ConfirmMaterialPartDto[];
}
