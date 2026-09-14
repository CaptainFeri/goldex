import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min } from "class-validator";
import { MovementDirectionEnum, MovementPartyEnum } from "../../enum/movement.enum";

/**
 * A crossing an operator is recording by hand, for metal that moved without
 * paperwork behind it.
 *
 * Inbound may be attributed to a user or a provider. Outbound may only be
 * attributed to a provider: releasing metal to a user settles a claim against
 * their wallet, and that belongs to the withdrawal flow, which locks the
 * balance first and refunds what the packages fall short by. A hand-typed
 * outbound would skip all of it.
 */
export class RecordMovementDto {
  @ApiProperty({ description: "انباری که ماده وارد یا خارج آن می‌شود" })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ enum: MovementDirectionEnum })
  @IsEnum(MovementDirectionEnum)
  direction: MovementDirectionEnum;

  @ApiProperty({
    enum: [MovementPartyEnum.USER, MovementPartyEnum.PROVIDER],
    description: "طرف حساب: کاربر یا تامین‌کننده",
  })
  @IsEnum(MovementPartyEnum)
  partyType: MovementPartyEnum;

  @ApiPropertyOptional({ description: "کاربر طرف حساب، وقتی partyType برابر USER است" })
  @IsUUID()
  @IsOptional()
  partyUserId?: string;

  @ApiPropertyOptional({ description: "کلید تامین‌کننده، وقتی partyType برابر PROVIDER است" })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  providerKey?: string;

  @ApiProperty({ description: "نماد ماده" })
  @IsUUID()
  symbolId: string;

  @ApiPropertyOptional({
    description: "وزن ظاهری. همراه با عیار، وزن باطنی ۷۵۰ از آن محاسبه می‌شود",
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  @IsOptional()
  apparentWeight?: number;

  @ApiPropertyOptional({ description: "عیار" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  @IsOptional()
  ayar?: number;

  @ApiPropertyOptional({
    description: "وزن باطنی ۷۵۰. وقتی وزن ظاهری و عیار داده شده باشند نادیده گرفته می‌شود",
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  @IsOptional()
  netWeight?: number;

  @ApiPropertyOptional({ description: "انگی (گرم)" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  wastage?: number;

  @ApiPropertyOptional({ description: "موقعیت قرارگیری در انبار" })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  warehouseIndexPosition?: string;

  @ApiPropertyOptional({ description: "بستهٔ موجود برای خروج. فقط برای direction=OUT" })
  @IsUUID()
  @IsOptional()
  packetId?: string;

  @ApiPropertyOptional({ description: "یادداشت" })
  @IsString()
  @IsOptional()
  notes?: string;
}
