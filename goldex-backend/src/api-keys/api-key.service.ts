import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiKeyEntity, ApiKeyStatus } from "./entity/api-key.entity";
import { ApiKeyUsageEntity } from "./entity/api-key-usage.entity";
import { KEYED_ROUTES } from "./api-key.constants";
import {
  ApiKeyDto,
  ApiStatsDto,
  CreateApiKeyDto,
  CreatedApiKeyDto,
  TrafficDto,
  UpdateApiKeyStatusDto,
} from "./dto/api-key.dto";

/** Environment-agnostic; there is no separate sandbox surface yet. */
const KEY_PREFIX = "gx_live_";
const KEY_BYTES = 32;

export function hashKey(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

/** Start of the current calendar month, UTC. */
export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** The hour a timestamp falls in, UTC. */
export function hourBucket(at = new Date()): Date {
  const d = new Date(at);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(ApiKeyEntity) private readonly keys: Repository<ApiKeyEntity>,
    @InjectRepository(ApiKeyUsageEntity) private readonly usage: Repository<ApiKeyUsageEntity>,
  ) {}

  // ── Lifecycle ───────────────────────────────────────────────────────────

  async list(): Promise<ApiKeyDto[]> {
    const rows = await this.keys.find({ order: { createAt: "DESC" } });
    const counts = await this.monthlyRequestsFor(rows.map((r) => r.id));
    return rows.map((r) => this.toDto(r, counts.get(r.id) ?? 0));
  }

  async create(dto: CreateApiKeyDto, createdBy: string | null): Promise<CreatedApiKeyDto> {
    const plaintext = `${KEY_PREFIX}${randomBytes(KEY_BYTES).toString("hex")}`;
    const row = await this.keys.save(
      this.keys.create({
        name: dto.name,
        keyHash: hashKey(plaintext),
        keyPrefix: KEY_PREFIX,
        lastFour: plaintext.slice(-4),
        status: ApiKeyStatus.ACTIVE,
        monthlyQuota: dto.monthlyQuota ?? null,
        createdBy,
      }),
    );
    // The only time the plaintext exists outside the caller's request.
    return { ...this.toDto(row, 0), plaintextKey: plaintext };
  }

  async updateStatus(id: string, dto: UpdateApiKeyStatusDto): Promise<ApiKeyDto> {
    const row = await this.require(id);

    if (dto.status === ApiKeyStatus.LIMITED) {
      const quota = dto.monthlyQuota ?? row.monthlyQuota;
      // "Limited" with no cap would authenticate exactly like "active" while
      // reading as a restriction in the UI.
      if (!quota) throw new BadRequestException("API_KEY.QUOTA_REQUIRED");
      row.monthlyQuota = quota;
    } else if (dto.monthlyQuota !== undefined) {
      row.monthlyQuota = dto.monthlyQuota;
    }

    if (dto.status === ApiKeyStatus.REVOKED && row.status !== ApiKeyStatus.REVOKED) {
      row.revokedAt = new Date();
    }
    if (dto.status !== ApiKeyStatus.REVOKED) row.revokedAt = null;

    row.status = dto.status;
    await this.keys.save(row);
    return this.toDto(row, await this.monthlyRequests(id));
  }

  async remove(id: string): Promise<void> {
    const row = await this.require(id);
    // Soft delete: the usage rows reference this key, and the traffic history
    // for a deleted key is still real traffic that happened.
    await this.keys.softRemove(row);
  }

  // ── Authentication ──────────────────────────────────────────────────────

  async findByPlaintext(plaintext: string): Promise<ApiKeyEntity | null> {
    const presented = hashKey(plaintext);
    const row = await this.keys.findOne({ where: { keyHash: presented } });
    if (!row) return null;
    // The lookup already matched, so this is belt-and-braces rather than the
    // primary check — but it costs nothing and keeps the comparison constant-time.
    const a = Buffer.from(presented, "hex");
    const b = Buffer.from(row.keyHash, "hex");
    return a.length === b.length && timingSafeEqual(a, b) ? row : null;
  }

  // ── Usage ───────────────────────────────────────────────────────────────

  /** Upsert one hour's counters. Atomic, so concurrent requests cannot lose counts. */
  async record(apiKeyId: string, durationMs: number, isError: boolean, at = new Date()): Promise<void> {
    await this.usage.query(
      `INSERT INTO "api_key_usage" ("api_key_id", "bucket", "requests", "errors", "duration_ms_total")
         VALUES ($1, $2, 1, $3, $4)
       ON CONFLICT ("api_key_id", "bucket") DO UPDATE SET
         "requests"          = "api_key_usage"."requests" + 1,
         "errors"            = "api_key_usage"."errors" + $3,
         "duration_ms_total" = "api_key_usage"."duration_ms_total" + $4,
         "updated_at"        = now()`,
      [apiKeyId, hourBucket(at), isError ? 1 : 0, Math.max(0, Math.round(durationMs))],
    );
    await this.keys.update({ id: apiKeyId }, { lastUsedAt: at });
  }

  async monthlyRequests(apiKeyId: string): Promise<number> {
    return (await this.monthlyRequestsFor([apiKeyId])).get(apiKeyId) ?? 0;
  }

  private async monthlyRequestsFor(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const rows = await this.usage
      .createQueryBuilder("u")
      .select("u.api_key_id", "id")
      .addSelect("COALESCE(SUM(u.requests), 0)", "total")
      .where("u.api_key_id IN (:...ids)", { ids })
      .andWhere("u.bucket >= :from", { from: monthStart() })
      .groupBy("u.api_key_id")
      .getRawMany<{ id: string; total: string }>();
    return new Map(rows.map((r) => [r.id, Number(r.total)]));
  }

  // ── Dashboard ───────────────────────────────────────────────────────────

  async stats(): Promise<ApiStatsDto> {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    const row = await this.usage
      .createQueryBuilder("u")
      .select("COALESCE(SUM(u.requests), 0)", "requests")
      .addSelect("COALESCE(SUM(u.errors), 0)", "errors")
      .addSelect("COALESCE(SUM(u.duration_ms_total), 0)", "duration")
      .where("u.bucket >= :from", { from: dayStart })
      .getRawOne<{ requests: string; errors: string; duration: string }>();

    const requests = Number(row?.requests ?? 0);
    const errors = Number(row?.errors ?? 0);
    const duration = Number(row?.duration ?? 0);

    return {
      requestsToday: requests,
      // Null rather than 0 or 100: with no traffic there is no average and no
      // success rate, and reporting "100% success" for zero requests is a lie
      // an operator would act on.
      avgResponseMs: requests > 0 ? Math.round(duration / requests) : null,
      successPercent: requests > 0 ? round2(((requests - errors) / requests) * 100) : null,
      errorPercent: requests > 0 ? round2((errors / requests) * 100) : null,
      activeKeys: await this.keys.count({ where: { status: ApiKeyStatus.ACTIVE } }),
      keyedRouteCount: KEYED_ROUTES.length,
    };
  }

  async traffic(window: string): Promise<TrafficDto> {
    const hours = window === "7d" ? 24 * 7 : 24;
    const from = hourBucket(new Date(Date.now() - (hours - 1) * 3600_000));

    const rows = await this.usage
      .createQueryBuilder("u")
      .select("u.bucket", "bucket")
      .addSelect("COALESCE(SUM(u.requests), 0)", "requests")
      .addSelect("COALESCE(SUM(u.errors), 0)", "errors")
      .where("u.bucket >= :from", { from })
      .groupBy("u.bucket")
      .orderBy("u.bucket", "ASC")
      .getRawMany<{ bucket: Date; requests: string; errors: string }>();

    const byBucket = new Map(rows.map((r) => [new Date(r.bucket).getTime(), r]));

    // Every hour in the window is emitted, including the empty ones — a chart
    // that silently drops quiet hours misreports the shape of the traffic.
    const points = Array.from({ length: hours }, (_, i) => {
      const bucket = new Date(from.getTime() + i * 3600_000);
      const hit = byBucket.get(bucket.getTime());
      return {
        bucket,
        requests: Number(hit?.requests ?? 0),
        errors: Number(hit?.errors ?? 0),
      };
    });

    return { points, keyedRouteCount: KEYED_ROUTES.length };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async require(id: string): Promise<ApiKeyEntity> {
    const row = await this.keys.findOne({ where: { id } });
    if (!row) throw new NotFoundException("API_KEY.NOT_FOUND");
    return row;
  }

  private toDto(row: ApiKeyEntity, monthlyRequests: number): ApiKeyDto {
    return {
      id: row.id,
      name: row.name,
      maskedKey: `${row.keyPrefix}••••${row.lastFour}`,
      status: row.status,
      monthlyQuota: row.monthlyQuota,
      monthlyRequests,
      lastUsedAt: row.lastUsedAt ?? null,
      createAt: row.createAt ?? null,
    };
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
