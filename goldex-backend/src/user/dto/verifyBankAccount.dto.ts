import { ApiProperty } from "@nestjs/swagger";

export class VerifyBankAccountDto {
  @ApiProperty()
  iban: string;
  @ApiProperty()
  birthDate: string;
  @ApiProperty()
  bank: string;
  @ApiProperty()
  depositNumber: string;
}
