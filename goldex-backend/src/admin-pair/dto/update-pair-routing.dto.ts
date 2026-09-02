import { IsEnum, IsNumber, IsOptional, IsUUID, Max, Min, ValidateIf } from "class-validator";
import { Type } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { RoutingModeEnum } from "../../pricing-route/enum/routing-mode.enum";

export class UpdatePairRoutingDto {
  @IsOptional()
  @IsEnum(RoutingModeEnum)
  @ApiProperty({
    enum: RoutingModeEnum,
    required: false,
    description:
      "AUTO: direct first, bridge as fallback · DIRECT: never bridge · " +
      "BRIDGE: always bridge · BEST: best usable price per side",
  })
  routingMode?: RoutingModeEnum;

  /** Null clears the preference and lets the resolver search every bridge. */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  @ApiProperty({
    required: false,
    nullable: true,
    description: "Preferred bridge symbol id; null searches every eligible symbol",
  })
  bridgeSymbolId?: string | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  @ApiProperty({
    required: false,
    nullable: true,
    description:
      "Refuse a bridged price differing from a usable direct price by more than this percent",
  })
  bridgeMaxDeviationPercent?: number | null;
}
