// dto/wallet-action.dto.ts
import { IsUUID, IsOptional, IsString, IsEnum } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { WalletStatusEnum } from "../../wallet/enum/wallet-status.enum";

export class WalletActionDto {
  @ApiProperty()
  @IsUUID()
  walletId: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsEnum(WalletStatusEnum)
  status?: WalletStatusEnum;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  note?: string;
}
