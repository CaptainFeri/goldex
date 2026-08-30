import { ApiProperty } from "@nestjs/swagger";
import { IsString } from "class-validator";

export class BankAccountDto {
  @IsString()
  @ApiProperty()
  bank: string;

  @IsString()
  @ApiProperty()
  depositNumber: string;

  @IsString()
  @ApiProperty()
  nationalId: string;

  @IsString()
  @ApiProperty()
  birthDate: string;
}
