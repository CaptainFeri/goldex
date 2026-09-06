import { Column, Entity, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * Accounting policy the admin controls at runtime — chiefly which symbol the
 * books are reported in. Key/value so a new knob does not need a migration.
 */
@Entity("accounting_setting")
export class AccountingSettingEntity {
  @PrimaryColumn({ name: "key" })
  key: string;

  @Column({ name: "value_json", type: "jsonb" })
  valueJson: any;

  @Column({ name: "updated_by_admin_id", type: "uuid", nullable: true })
  updatedByAdminId?: string;

  @UpdateDateColumn({ name: "updated_at", type: "timestamptz" })
  updatedAt: Date;
}
