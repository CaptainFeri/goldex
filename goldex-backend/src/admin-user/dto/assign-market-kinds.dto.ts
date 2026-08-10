import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsEnum } from "class-validator";
import { MarketKindEnum } from "../../admin-pair/enum/market.kind.enum";

export class AssignMarketKindsDto {
  @ApiProperty({ enum: MarketKindEnum, isArray: true, example: ["MARKET", "LIMIT", "OFFER"] })
  @IsArray()
  @IsEnum(MarketKindEnum, { each: true })
  marketKinds: MarketKindEnum[];
}
