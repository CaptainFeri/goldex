import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsUUID, Min } from "class-validator";
import {
  AdminBankAccountStatusEnum,
  BankAccountDirectionEnum,
} from "../enum/admin-bank-account-status.enum";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PaginationQueryDto,
} from "../../shared/dto/pagination-query.dto";

export class BankAccountQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(BankAccountDirectionEnum)
  @ApiPropertyOptional({ enum: BankAccountDirectionEnum })
  direction?: BankAccountDirectionEnum;

  @IsOptional()
  @IsUUID()
  @ApiPropertyOptional()
  symbolId?: string;

  @IsOptional()
  @IsEnum(AdminBankAccountStatusEnum)
  @ApiPropertyOptional({ enum: AdminBankAccountStatusEnum })
  status?: AdminBankAccountStatusEnum;

  /**
   * @deprecated Use `pageSize`. Kept so existing callers keep working for one
   * release; remove once goldex-admin-panel and ui-parszargar are both on the
   * standard contract.
   */
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ deprecated: true, description: "Legacy alias for `pageSize`" })
  limit?: number;

  /** `pageSize` wins; `limit` is honoured only while it remains deprecated. */
  override get take(): number {
    const size = Number(this.pageSize ?? this.limit) || DEFAULT_PAGE_SIZE;
    return Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
  }
}
