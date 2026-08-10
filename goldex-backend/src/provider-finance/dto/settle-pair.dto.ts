import { ApiProperty } from "@nestjs/swagger";
import { IsNotEmpty, IsNumber, IsOptional, IsPositive, IsString } from "class-validator";
import { Type } from "class-transformer";

/**
 * Combined two-leg settlement with a provider, performed atomically:
 *  - baseReceived: BASE asset (e.g. XAU grams) physically received FROM the
 *    provider (reduces the outstanding BASE position toward the provider).
 *  - quotePaid: QUOTE asset (e.g. IRR) physically GIVEN TO the provider
 *    (reduces the outstanding QUOTE position the provider owes us).
 *
 * Both legs are written in the same transaction — either both persist or none.
 */
export class SettlePairDto {
  @ApiProperty({ example: "mock-zaryar-a" })
  @IsString()
  @IsNotEmpty()
  providerKey: string;

  @ApiProperty({ example: "XAU", description: "Base asset symbol (gold side of the pair)" })
  @IsString()
  @IsNotEmpty()
  baseSymbol: string;

  @ApiProperty({ example: "IRR", description: "Quote asset symbol (currency side of the pair)" })
  @IsString()
  @IsNotEmpty()
  quoteSymbol: string;

  @ApiProperty({ example: 1.5, description: "Base asset (grams) received from the provider" })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  baseReceived: number;

  @ApiProperty({ example: 90000000, description: "Quote asset (currency) given to the provider" })
  @IsNumber()
  @IsPositive()
  @Type(() => Number)
  quotePaid: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
