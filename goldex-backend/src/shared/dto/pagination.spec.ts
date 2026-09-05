import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, PaginationQueryDto } from "./pagination-query.dto";
import { paginate } from "./paginated.dto";

const build = (query: Record<string, unknown>) =>
  plainToInstance(PaginationQueryDto, query, { enableImplicitConversion: false });

describe("PaginationQueryDto", () => {
  it("defaults to page 1 at the default page size", () => {
    const q = build({});
    expect(q.pageNumber).toBe(1);
    expect(q.take).toBe(DEFAULT_PAGE_SIZE);
    expect(q.skip).toBe(0);
  });

  it("coerces query-string values, which arrive as strings", async () => {
    const q = build({ page: "3", pageSize: "25" });
    expect(await validate(q)).toHaveLength(0);
    expect(q.pageNumber).toBe(3);
    expect(q.take).toBe(25);
    expect(q.skip).toBe(50);
  });

  it("clamps pageSize so a client cannot request the whole table", () => {
    // Validation rejects it, but `take` must be safe even if a caller skips the pipe.
    expect(build({ pageSize: 5000 }).take).toBe(MAX_PAGE_SIZE);
  });

  it("rejects out-of-range pagination", async () => {
    expect(await validate(build({ page: 0 }))).not.toHaveLength(0);
    expect(await validate(build({ pageSize: MAX_PAGE_SIZE + 1 }))).not.toHaveLength(0);
    expect(await validate(build({ order: "sideways" }))).not.toHaveLength(0);
  });

  it("floors a nonsensical page rather than producing a negative offset", () => {
    expect(build({ page: -4 }).skip).toBe(0);
    expect(build({ page: "abc" }).skip).toBe(0);
  });

  it("accepts the sort contract", async () => {
    const q = build({ sort: "createdAt", order: "asc" });
    expect(await validate(q)).toHaveLength(0);
    expect(q.sort).toBe("createdAt");
    expect(q.order).toBe("asc");
  });
});

describe("paginate", () => {
  it("returns the documented envelope", () => {
    const page = paginate(["a", "b"], 240, build({ page: "2", pageSize: "20" }));
    expect(page).toEqual({
      items: ["a", "b"],
      total: 240,
      page: 2,
      pageSize: 20,
      totalPages: 12,
    });
  });

  it("rounds a partial last page up", () => {
    expect(paginate([], 241, build({ pageSize: "20" })).totalPages).toBe(13);
  });

  it("reports zero pages for an empty result", () => {
    expect(paginate([], 0, build({})).totalPages).toBe(0);
  });
});
