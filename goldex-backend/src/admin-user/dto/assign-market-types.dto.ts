import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsEnum } from "class-validator";
import { MarketTypeEnum } from "../../admin-pair/enum/market.type.enum";

export class AssignMarketTypesDto {
  @ApiProperty({ enum: MarketTypeEnum, isArray: true, example: ["formal", "informal"] })
  @IsArray()
  @IsEnum(MarketTypeEnum, { each: true })
  marketTypes: MarketTypeEnum[];
}
