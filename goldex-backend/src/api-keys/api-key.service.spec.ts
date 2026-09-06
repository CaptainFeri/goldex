import { BadRequestException } from "@nestjs/common";
import { ApiKeyService, hashKey, hourBucket, monthStart } from "./api-key.service";
import { ApiKeyStatus } from "./entity/api-key.entity";

const key = (over: Record<string, unknown> = {}) =>
  ({
    id: "k-1",
    name: "Production",
    keyHash: hashKey("gx_live_abc"),
    keyPrefix: "gx_live_",
    lastFour: "9abc",
    status: ApiKeyStatus.ACTIVE,
    monthlyQuota: null,
    createdBy: "a-1",
    lastUsedAt: null,
    revokedAt: null,
    createAt: new Date(),
    ...over,
  }) as any;

/** `usageRows` are {apiKeyId, bucket, requests, errors, durationMsTotal}. */
function build(rows: any[] = [key()], usageRows: any[] = []) {
  const state = { rows: [...rows], usage: [...usageRows], nextId: 1 };
  const keys = {
    find: jest.fn(async () => state.rows.filter((r) => !r.deletedAt)),
    findOne: jest.fn(async ({ where }: any) =>
      state.rows.find((r) => (where.id ? r.id === where.id : r.keyHash === where.keyHash)) ?? null,
    ),
    count: jest.fn(async ({ where }: any) =>
      state.rows.filter((r) => !r.deletedAt && (!where?.status || r.status === where.status)).length,
    ),
    create: jest.fn((v: any) => v),
    save: jest.fn(async (v: any) => {
      const next = { ...v, id: v.id ?? `k-new-${state.nextId++}`, createAt: v.createAt ?? new Date() };
      const at = state.rows.findIndex((r) => r.id === next.id);
      if (at >= 0) state.rows[at] = next;
      else state.rows.push(next);
      return next;
    }),
    update: jest.fn(async () => undefined),
    softRemove: jest.fn(async (v: any) => {
      const row = state.rows.find((r) => r.id === v.id);
      if (row) row.deletedAt = new Date();
      return v;
    }),
  };
  const agg = () => {
    const q: any = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(async () => ({
        requests: String(state.usage.reduce((a, u) => a + u.requests, 0)),
        errors: String(state.usage.reduce((a, u) => a + u.errors, 0)),
        duration: String(state.usage.reduce((a, u) => a + u.durationMsTotal, 0)),
      })),
      getRawMany: jest.fn(async () =>
        state.usage.map((u) => ({
          id: u.apiKeyId,
          bucket: u.bucket,
          total: String(u.requests),
          requests: String(u.requests),
          errors: String(u.errors),
        })),
      ),
    };
    return q;
  };
  const usage = { createQueryBuilder: jest.fn(agg), query: jest.fn(async () => undefined) };
  return { service: new ApiKeyService(keys as any, usage as any), state, keys };
}

describe("key helpers", () => {
  it("hashes deterministically and differently per key", () => {
    expect(hashKey("a")).toBe(hashKey("a"));
    expect(hashKey("a")).not.toBe(hashKey("b"));
    expect(hashKey("a")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("truncates a bucket to the hour in UTC", () => {
    expect(hourBucket(new Date("2026-03-04T15:47:31.500Z")).toISOString()).toBe("2026-03-04T15:00:00.000Z");
  });

  it("starts the month at midnight UTC on the first", () => {
    expect(monthStart(new Date("2026-03-04T15:47:31Z")).toISOString()).toBe("2026-03-01T00:00:00.000Z");
  });
});

describe("ApiKeyService", () => {
  it("issues a key whose plaintext is returned once and never stored", async () => {
    const { service, state } = build([]);
    const created = await service.create({ name: "Production" }, "a-1");

    expect(created.plaintextKey).toMatch(/^gx_live_[0-9a-f]{64}$/);
    expect(state.rows[0].keyHash).toBe(hashKey(created.plaintextKey));
    expect(JSON.stringify(state.rows[0])).not.toContain(created.plaintextKey);
  });

  it("issues a different key every time", async () => {
    const { service } = build([]);
    const a = await service.create({ name: "a" }, null);
    const b = await service.create({ name: "b" }, null);
    expect(a.plaintextKey).not.toBe(b.plaintextKey);
  });

  it("masks the key for display without revealing enough to reconstruct it", async () => {
    const { service } = build();
    const [dto] = await service.list();
    expect(dto.maskedKey).toBe("gx_live_••••9abc");
    expect(dto).not.toHaveProperty("keyHash");
  });

  it("refuses `limited` without a quota, since that is what limited means", async () => {
    const { service } = build();
    await expect(service.updateStatus("k-1", { status: ApiKeyStatus.LIMITED })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("keeps an existing quota when re-limiting without one", async () => {
    const { service } = build([key({ monthlyQuota: 500 })]);
    const out = await service.updateStatus("k-1", { status: ApiKeyStatus.LIMITED });
    expect(out.monthlyQuota).toBe(500);
  });

  it("stamps revokedAt on revoke and clears it on reactivation", async () => {
    const { service, state } = build();
    await service.updateStatus("k-1", { status: ApiKeyStatus.REVOKED });
    expect(state.rows[0].revokedAt).toBeInstanceOf(Date);
    await service.updateStatus("k-1", { status: ApiKeyStatus.ACTIVE });
    expect(state.rows[0].revokedAt).toBeNull();
  });

  it("reports null rates for no traffic rather than a healthy-looking 100%", async () => {
    const { service } = build([], []);
    const s = await service.stats();
    expect(s).toMatchObject({
      requestsToday: 0, avgResponseMs: null, successPercent: null, errorPercent: null,
    });
  });

  it("derives the average and rates from the counters", async () => {
    const { service } = build([key()], [
      { apiKeyId: "k-1", bucket: hourBucket(), requests: 4, errors: 1, durationMsTotal: 800 },
    ]);
    const s = await service.stats();
    expect(s.requestsToday).toBe(4);
    expect(s.avgResponseMs).toBe(200);
    expect(s.successPercent).toBe(75);
    expect(s.errorPercent).toBe(25);
  });

  it("reports how many routes accept a key, so zero traffic can be read correctly", async () => {
    const { service } = build([], []);
    // Nothing in this codebase is key-authenticated yet, so zero traffic is the
    // truth rather than a broken dashboard.
    expect((await service.stats()).keyedRouteCount).toBe(0);
  });

  it("emits one point per hour across the window, empty hours included", async () => {
    const { service } = build([], []);
    const day = await service.traffic("24h");
    expect(day.points).toHaveLength(24);
    expect(day.points.every((p) => p.requests === 0)).toBe(true);
    expect((await service.traffic("7d")).points).toHaveLength(24 * 7);
    // An unrecognised window falls back to the day rather than returning nothing.
    expect((await service.traffic("nonsense")).points).toHaveLength(24);
  });

  it("returns buckets in ascending order an hour apart", async () => {
    const { service } = build([], []);
    const { points } = await service.traffic("24h");
    for (let i = 1; i < points.length; i++) {
      expect(points[i].bucket.getTime() - points[i - 1].bucket.getTime()).toBe(3600_000);
    }
  });
});
