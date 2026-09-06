import { Column, Entity, Index } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";

/**
 * Hourly rollup of API-key traffic.
 *
 * Counters per hour rather than a row per request: the traffic chart needs 24
 * points, the stats need sums, and neither needs individual requests. A row per
 * request would grow without bound to answer questions nobody asks.
 */
@Entity("api_key_usage")
@Index(["apiKeyId", "bucket"], { unique: true })
export class ApiKeyUsageEntity extends myBaseEntity {
  @Column({ name: "api_key_id", type: "uuid" })
  apiKeyId: string;

  /** Truncated to the hour, UTC. */
  @Index()
  @Column({ type: "timestamptz" })
  bucket: Date;

  @Column({ type: "int", default: 0 })
  requests: number;

  /** Responses with status >= 400. */
  @Column({ type: "int", default: 0 })
  errors: number;

  /** Summed, so the average is a division at read time and never drifts. */
  @Column({ name: "duration_ms_total", type: "bigint", default: 0 })
  durationMsTotal: string;
}
