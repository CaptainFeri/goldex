import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsInt, IsOptional, IsString, Min } from "class-validator";
import {
  MAX_PAGE_SIZE,
  PaginationQueryDto,
} from "../../shared/dto/pagination-query.dto";

/** This endpoint listed 100 rows by default long before the shared contract. */
const ADMIN_USER_LIST_DEFAULT_PAGE_SIZE = 100;

export class AdminUserListQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "Matches first name, last name or email" })
  @IsOptional()
  @IsString()
  q?: string;

  /** @deprecated Use `q`. Removed once both panels are on the standard contract. */
  @ApiPropertyOptional({ deprecated: true, description: "Legacy alias for `q`" })
  @IsOptional()
  @IsString()
  searchKey?: string;

  /** @deprecated Use `page`. */
  @ApiPropertyOptional({ deprecated: true, description: "Legacy alias for `page`" })
  @IsOptional()
  @Transform(({ value }) => (value === undefined || value === "" ? undefined : Number(value)))
  @IsInt()
  @Min(1)
  pageNumber?: number;

  /** `q` wins; `searchKey` is honoured only while it remains deprecated. */
  get search(): string | undefined {
    const term = this.q ?? this.searchKey;
    return term?.trim() || undefined;
  }

  override get currentPage(): number {
    return Math.max(Number(this.page ?? this.pageNumber) || 1, 1);
  }

  override get take(): number {
    const size = Number(this.pageSize) || ADMIN_USER_LIST_DEFAULT_PAGE_SIZE;
    return Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
  }
}
