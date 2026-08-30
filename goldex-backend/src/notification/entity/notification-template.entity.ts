import { Entity, Column, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn } from "typeorm";

@Entity("notification_templates")
export class NotificationTemplateEntity {
  @PrimaryGeneratedColumn("uuid")
  public id: string;

  @Column({ type: "varchar", length: 100, unique: true })
  slug: string;

  @Column({ type: "varchar", length: 255 })
  title: string;

  @Column({ type: "jsonb", name: "channels_config" })
  channelsConfig: Record<string, { enabled: boolean; subject?: string; body: string }>;

  @CreateDateColumn({ type: "timestamptz", nullable: true, name: "created_at" })
  createAt?: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true, name: "updated_at" })
  updateAt?: Date;
}
