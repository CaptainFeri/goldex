import { Column, Entity } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";

/**
 * Install-wide price-engine settings. Exactly one row, enforced by a unique
 * index on `singleton` in the migration — the same shape as
 * `platform_settings`, and for the same reason: a second row would make "the"
 * engine config mean whichever the query happened to return first.
 *
 * Only the settings this backend actually owns live here. The provider set
 * (the "sources" toggles) is **not** copied in: providers are rows in
 * `provider`, mirrored from the pricing engine and toggled through a command
 * on the queue, so duplicating their on/off state here would give two answers
 * to one question.
 */
@Entity("price_engine_config")
export class PriceEngineConfigEntity extends myBaseEntity {
  /** Always true; the unique index on it is what keeps this table one row. */
  @Column({ type: "boolean", default: true })
  singleton: boolean;

  /**
   * How often a price client should refresh, in seconds.
   *
   * This is the **client** cadence — what the panels poll the ticker and the
   * price screen at — not the interval the pricing engine fetches on. The
   * engine's own fetch loop is configured per provider
   * (`provider.metadata_refresh_interval_ms`) and is not reachable from here,
   * so claiming this drove it would be a lie the operator could not see
   * through.
   */
  @Column({ name: "refresh_interval_sec", type: "int", default: 3 })
  refreshIntervalSec: number;
}
