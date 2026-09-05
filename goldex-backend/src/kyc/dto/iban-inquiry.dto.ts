import { ApiProperty } from "@nestjs/swagger";
import { IsIBAN } from "class-validator";

export class IbanInquiryDto {
  @IsIBAN()
  @ApiProperty()
  iban: string;
}
