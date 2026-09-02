import { ApiProperty } from "@nestjs/swagger";
import { IsBoolean } from "class-validator";

/** Either, both, or neither may be true. */
export class SetDirectionsDto {
  @IsBoolean()
  @ApiProperty()
  useForDeposit: boolean;

  @IsBoolean()
  @ApiProperty()
  useForWithdraw: boolean;
}
