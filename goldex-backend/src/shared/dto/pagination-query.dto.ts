import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from "class-validator";

/** Upper bound on `pageSize`, so a client cannot ask for the whole table. */
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

const toInt = ({ value }: { value: unknown }) => {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : value;
};

/**
 * The pagination half of the list-endpoint contract
 * (docs/PARSZARGAR-ADMIN-API-PLAN.md §3).
 *
 * Extend it for endpoint-specific filters:
 *
 *   export class ListUsersQueryDto extends PaginationQueryDto {
 *     @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
 *   }
 */
export class PaginationQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1, description: "1-based page number" })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
    description: `Rows per page. Clamped to ${MAX_PAGE_SIZE}.`,
  })
  @IsOptional()
  @Transform(toInt)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize?: number = DEFAULT_PAGE_SIZE;

  @ApiPropertyOptional({ description: "Column to sort by", example: "createdAt" })
  @IsOptional()
  @IsString()
  sort?: string;

  @ApiPropertyOptional({ enum: ["asc", "desc"], default: "desc" })
  @IsOptional()
  @IsIn(["asc", "desc"])
  order?: "asc" | "desc" = "desc";

  /** Rows to skip, for `.skip()` / `OFFSET`. */
  get skip(): number {
    return (this.currentPage - 1) * this.take;
  }

  /** Rows to fetch, clamped. Use instead of reading `pageSize` directly. */
  get take(): number {
    const size = Number(this.pageSize) || DEFAULT_PAGE_SIZE;
    return Math.min(Math.max(size, 1), MAX_PAGE_SIZE);
  }

  /**
   * `page`, floored at 1.
   *
   * Named `currentPage` rather than `pageNumber` so a subclass can expose
   * `pageNumber` as a deprecated wire alias without shadowing this getter —
   * which would silently break `skip`.
   */
  get currentPage(): number {
    const page = Number(this.page) || 1;
    return Math.max(page, 1);
  }
}
