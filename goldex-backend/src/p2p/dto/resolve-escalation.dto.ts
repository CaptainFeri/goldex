import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from "class-validator";
import { P2pResolutionTypeEnum } from "../enum/p2p.enums";

export class ResolveEscalationDto {
  @IsEnum(P2pResolutionTypeEnum)
  @ApiProperty({ enum: P2pResolutionTypeEnum })
  resolution: P2pResolutionTypeEnum;

  @IsOptional()
  @IsUUID()
  @ApiProperty({ required: false, description: "Required for SETTLE_FROM_ADMIN" })
  adminAccountId?: string;

  @IsString()
  @MinLength(3)
  @ApiProperty({ description: "Mandatory — written to the audit log" })
  note: string;
}
