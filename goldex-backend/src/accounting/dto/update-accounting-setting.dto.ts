import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from "class-validator";
import { ValuationBasisEnum } from "../enum/valuation-basis.enum";

export class UpdateAccountingSettingDto {
  @ApiPropertyOptional({
    description:
      "The pricing symbol: every accounting figure is converted into this asset at live prices.",
  })
  @IsUUID()
  @IsOptional()
  referenceSymbolId?: string;

  @ApiPropertyOptional({
    enum: ValuationBasisEnum,
    description: "Which side of the live quote values held assets.",
  })
  @IsEnum(ValuationBasisEnum)
  @IsOptional()
  valuationBasis?: ValuationBasisEnum;

  @ApiPropertyOptional({
    description: "A quote older than this many seconds is reported as stale.",
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  @IsOptional()
  priceStalenessSeconds?: number;
}
