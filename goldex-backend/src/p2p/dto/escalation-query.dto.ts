import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsNumber, IsOptional, IsUUID, Min } from "class-validator";
import { P2pEscalationReasonEnum, P2pEscalationStatusEnum } from "../enum/p2p.enums";

export class EscalationQueryDto {
  @IsOptional()
  @IsEnum(P2pEscalationStatusEnum)
  @ApiProperty({ required: false, enum: P2pEscalationStatusEnum })
  status?: P2pEscalationStatusEnum;

  @IsOptional()
  @IsEnum(P2pEscalationReasonEnum)
  @ApiProperty({ required: false, enum: P2pEscalationReasonEnum })
  reason?: P2pEscalationReasonEnum;

  @IsOptional()
  @IsUUID()
  @ApiProperty({ required: false })
  assignedAdminId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @ApiProperty({ required: false })
  minAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ required: false, default: 1 })
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @ApiProperty({ required: false, default: 20 })
  limit?: number;
}
