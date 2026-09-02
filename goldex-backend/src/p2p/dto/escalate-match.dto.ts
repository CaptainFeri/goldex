import { ApiProperty } from "@nestjs/swagger";
import { IsEnum, IsOptional, IsString, MinLength } from "class-validator";
import { P2pEscalationReasonEnum } from "../enum/p2p.enums";

/** Lets an admin pull a match into the queue without waiting for a timeout. */
export class EscalateMatchDto {
  @IsEnum(P2pEscalationReasonEnum)
  @ApiProperty({ enum: P2pEscalationReasonEnum })
  reason: P2pEscalationReasonEnum;

  @IsOptional()
  @IsString()
  @MinLength(3)
  @ApiProperty({ required: false, description: "Why this case needs a decision" })
  note?: string;
}
