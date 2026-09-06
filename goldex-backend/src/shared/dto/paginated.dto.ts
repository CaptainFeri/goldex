import { ApiProperty } from "@nestjs/swagger";

/**
 * The one paginated envelope every list endpoint returns
 * (docs/PARSZARGAR-ADMIN-API-PLAN.md §3).
 *
 * `items` is declared per-endpoint by `ApiPaginatedResponse`, which is why it
 * carries no `@ApiProperty` here — Swagger cannot infer a generic parameter.
 */
export class PaginatedDto<T> {
  items: T[];

  @ApiProperty({ example: 240, description: "Total rows matching the filter, ignoring pagination" })
  total: number;

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 20 })
  pageSize: number;

  @ApiProperty({ example: 12 })
  totalPages: number;
}

/**
 * Build a `PaginatedDto` from a `findAndCount()` result.
 *
 *   const [items, total] = await repo.findAndCount({ skip: q.skip, take: q.take });
 *   return { data: paginate(items, total, q) };
 */
export function paginate<T>(
  items: T[],
  total: number,
  query: { currentPage: number; take: number }
): PaginatedDto<T> {
  const pageSize = query.take;
  return {
    items,
    total,
    page: query.currentPage,
    pageSize,
    totalPages: pageSize > 0 ? Math.ceil(total / pageSize) : 0,
  };
}
