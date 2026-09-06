import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SymbolTypeEnum } from "../../admin-symbol/enum/symbol.type.enum";
import { UnitTypeEnum } from "../../admin-symbol/enum/unit.type.enum";

/**
 * A symbol as it appears embedded in another resource.
 *
 * Deliberately narrow: enough for a client to label and format an amount,
 * without dragging the symbol's gateway configuration into every response that
 * happens to join it. The full record is `GET /admin/symbols/:id`.
 *
 * `slug` is what decides formatting on the client — a rial amount is shown in
 * toman, everything else in its own unit — so it is never optional here.
 */
export class SymbolRefDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "IRR", description: "Uppercase code; drives client-side unit formatting" })
  slug: string;

  @ApiProperty({ example: "ریال ایران" })
  name: string;

  @ApiProperty({ enum: SymbolTypeEnum, example: SymbolTypeEnum.RIAL })
  symbolType: SymbolTypeEnum;

  @ApiPropertyOptional({ enum: UnitTypeEnum, example: UnitTypeEnum.NUMBER })
  unitType?: UnitTypeEnum;

  @ApiPropertyOptional({ example: "/icons/irr.png" })
  picPath?: string;
}
