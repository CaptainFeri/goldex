import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { AdminBankAccountStatusEnum } from "../enum/admin-bank-account-status.enum";

export class SetBankAccountStatusDto {
  @IsEnum(AdminBankAccountStatusEnum)
  @ApiProperty({ enum: AdminBankAccountStatusEnum })
  status: AdminBankAccountStatusEnum;
}
