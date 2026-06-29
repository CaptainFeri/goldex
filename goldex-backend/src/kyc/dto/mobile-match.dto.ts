import { ApiProperty } from "@nestjs/swagger";
import { IsMobilePhone, IsString, Length } from "class-validator";

export class MobileMatchDto {
  @IsString()
  @Length(10, 10)
  @ApiProperty()
  nationalId: string;

  @IsMobilePhone("fa-IR")
  @ApiProperty()
  mobile: string;
}
