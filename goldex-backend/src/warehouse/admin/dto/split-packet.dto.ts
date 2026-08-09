import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsString, IsNumber, IsOptional, Min, IsArray, ArrayMinSize, MaxLength } from "class-validator";
import { Type } from "class-transformer";

export class SplitPartDto {
  @ApiProperty({ description: "Net weight (750) of the child package" })
  @Type(() => Number)
  @IsNumber()
  @Min(0.00000001)
  weight: number;

  @ApiPropertyOptional({ description: "ANG (purity) of the child" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ang?: number;

  @ApiPropertyOptional({ description: "AYAR (fineness) of the child" })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  ayar?: number;

  @ApiPropertyOptional({ description: "Warehouse index position of the child" })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  position?: string;
}

export class SplitPacketDto {
  @ApiProperty({ description: "Child packages net weights (750). Must satisfy: sum(parts) + wastage == parent net weight" })
  @Type(() => SplitPartDto)
  @IsArray({ message: "Parts must be an array" })
  @ArrayMinSize(1)
  parts: SplitPartDto[];

  @ApiPropertyOptional({ description: "Wastage (انگی) in grams" })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  wastage?: number;
}