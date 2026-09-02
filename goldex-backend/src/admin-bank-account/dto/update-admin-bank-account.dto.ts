import { PartialType } from "@nestjs/swagger";
import { CreateAdminBankAccountDto } from "./create-admin-bank-account.dto";

export class UpdateAdminBankAccountDto extends PartialType(CreateAdminBankAccountDto) {}
