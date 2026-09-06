import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Min } from "class-validator";
import { WithdrawStatusEnum } from "../enum/withdraw-status.enum";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PaginationQueryDto,
} from "../../shared/dto/pagination-query.dto";

export class WithdrawQueryDto extends PaginationQueryDto {
  @IsOptional()
  @IsEnum(WithdrawStatusEnum)
  @ApiPropertyOptional({ enum: WithdrawStatusEnum })
  status?: WithdrawStatusEnum;

  /**
   * @deprecated Use `pageSize`. Kept so existing callers keep working for one
   * release; remove once both panels are on the standard contract.
   */
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({ deprecated: true, description: "Legacy alias for `pageSize`" })
  limit?: number;

  override get take(): number {
    const size = Number(this.pageSize ?? this.limit) || DEFAULT_PAGE_SIZE;
    return Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
  }
}
