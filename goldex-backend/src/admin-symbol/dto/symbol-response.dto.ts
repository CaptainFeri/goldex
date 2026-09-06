import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { SymbolTypeEnum } from "../enum/symbol.type.enum";
import { UnitTypeEnum } from "../enum/unit.type.enum";
import { GainTypeEnum } from "../enum/gain.type.enum";
import { MarketTypeEnum } from "../../admin-pair/enum/market.type.enum";

/**
 * A tradable symbol, in full.
 *
 * The embedded form used by other resources is `SymbolRefDto` in
 * `shared/dto` — prefer that when joining a symbol into another response, so
 * gateway configuration does not travel with every wallet row.
 */
export class SymbolDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "ریال ایران" })
  name: string;

  @ApiProperty({ example: "IRR", description: "Uppercase code; drives client-side unit formatting" })
  slug: string;

  @ApiProperty({ example: "/icons/irr.png" })
  picPath: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "0.00000000",
    description: "Spread applied on top of the provider price; read with `gainType`",
  })
  gain?: string | null;

  @ApiProperty({ enum: GainTypeEnum, example: GainTypeEnum.NUMBER, description: "Whether `gain` is absolute or a percentage" })
  gainType: GainTypeEnum;

  @ApiProperty({ enum: SymbolTypeEnum, example: SymbolTypeEnum.RIAL })
  symbolType: SymbolTypeEnum;

  @ApiProperty({ enum: UnitTypeEnum, example: UnitTypeEnum.NUMBER })
  unitType: UnitTypeEnum;

  @ApiPropertyOptional({ enum: MarketTypeEnum, description: "Which market this symbol trades in" })
  marketType?: MarketTypeEnum;

  @ApiProperty({ example: true })
  hasPaymentGateway: boolean;

  @ApiProperty({ example: true, description: "Inactive symbols stay in the catalogue but cannot be traded" })
  isActive: boolean;

  @ApiPropertyOptional({ type: [String], example: ["manual", "p2p"], description: "Enabled deposit channels" })
  depositTypes?: string[];

  @ApiPropertyOptional({ type: [String], example: ["manual", "auto"], description: "Enabled withdraw channels" })
  withdrawTypes?: string[];

  @ApiPropertyOptional({ type: [String], description: "goldex-cbp gateway codes serving deposits" })
  depositGateways?: string[];

  @ApiPropertyOptional({ type: [String], description: "goldex-cbp gateway codes serving withdrawals" })
  withdrawGateways?: string[];

  @ApiPropertyOptional({ nullable: true })
  defaultDepositGateway?: string | null;

  @ApiPropertyOptional({ nullable: true })
  defaultWithdrawGateway?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "gold18",
    description: "The camelCase key the panels use for this instrument",
  })
  tickerKey?: string | null;

  @ApiProperty({ example: false, description: "Shown in the market ticker marquee" })
  isTicker: boolean;

  @ApiProperty({ example: 0, description: "Ordering within the ticker and the instrument picker" })
  displayOrder: number;

  @ApiPropertyOptional({ nullable: true, example: "طلا", description: "Grouping for the price screen" })
  category?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: "#d4af37",
    description: "Chart colour on the price screen. Null means the price endpoints derive one from the slug.",
  })
  color?: string | null;

  @ApiProperty()
  createAt: Date;

  @ApiProperty()
  updateAt: Date;
}

/** One goldex-cbp gateway, as registered there and — when known — its health. */
export class GatewayOptionDto {
  @ApiProperty({ example: "shahin" })
  code: string;

  @ApiProperty({ example: "Shahin" })
  name: string;

  @ApiProperty({ example: "rial", description: "rial, fiat, crypto or material" })
  category: string;

  @ApiProperty({ example: "formal", description: "formal or informal" })
  kind: string;

  @ApiPropertyOptional({
    example: "up",
    description: "up, down, not_configured or unknown — absent when cbp did not answer",
  })
  status?: string;

  @ApiPropertyOptional()
  statusMessage?: string;
}

export class TransferTypeOptionDto {
  @ApiProperty({ example: "payment-gateway" })
  value: string;

  @ApiProperty({
    example: true,
    description: "Selecting this type requires at least one gateway for that direction",
  })
  gatewayBound: boolean;
}

export class SymbolTypeCapabilityDto {
  @ApiProperty({ enum: SymbolTypeEnum })
  symbolType: SymbolTypeEnum;

  @ApiProperty({ type: [TransferTypeOptionDto] })
  depositTypes: TransferTypeOptionDto[];

  @ApiProperty({ type: [TransferTypeOptionDto] })
  withdrawTypes: TransferTypeOptionDto[];

  @ApiProperty({ type: [String] })
  defaultDepositTypes: string[];

  @ApiProperty({ type: [String] })
  defaultWithdrawTypes: string[];

  @ApiProperty({ type: [String], description: "cbp gateway categories a symbol of this type may draw from" })
  eligibleGatewayCategories: string[];

  @ApiProperty({ type: [String], description: "Gateway codes eligible right now, from the live registry" })
  eligibleGateways: string[];

  @ApiProperty({ type: [String] })
  defaultDepositGateways: string[];

  @ApiProperty({ type: [String] })
  defaultWithdrawGateways: string[];
}

/**
 * Everything the symbol form needs in one response: what each symbol type
 * allows, and which gateways are actually registered in goldex-cbp.
 *
 * The panel keeps no copy of these rules — read them from here rather than
 * hardcoding a second version that will drift.
 */
export class SymbolCapabilitiesDto {
  @ApiProperty({ type: [SymbolTypeCapabilityDto] })
  symbolTypes: SymbolTypeCapabilityDto[];

  @ApiProperty({ type: [GatewayOptionDto] })
  gateways: GatewayOptionDto[];

  @ApiProperty({
    example: true,
    description:
      "False when goldex-cbp could not be reached. The form still works from the symbol's existing gateways, but the list may be incomplete — say so in the UI",
  })
  gatewayRegistryAvailable: boolean;

  @ApiPropertyOptional({ description: "Why the registry could not be read" })
  gatewayRegistryError?: string;
}
