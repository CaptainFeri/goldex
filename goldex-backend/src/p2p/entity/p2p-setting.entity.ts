import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/** Runtime policy, so timeouts and weights are tunable without a deploy. */
@Entity("p2p_setting")
export class P2pSettingEntity {
  @PrimaryColumn({ name: "key" })
  key: string;

  @Column({ name: "value_json", type: "jsonb" })
  valueJson: any;

  @Column({ name: "updated_by_admin_id", type: "uuid", nullable: true })
  updatedByAdminId?: string;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
