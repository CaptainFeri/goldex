import { Entity, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn } from "typeorm";
import { AdminEntity } from "../../admin/entity/admin.entity";

export enum SegmentOperatorEnum {
  UNION = "UNION",
  INTERSECT = "INTERSECT",
  DIFFERENCE = "DIFFERENCE",
}

@Entity("customer_segment_combinations")
export class CustomerSegmentCombinationEntity {
  @PrimaryGeneratedColumn("uuid")
  public id: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  // Segment ids to combine, in order.
  @Column({ type: "jsonb" })
  segmentIds: string[];

  @Column({ type: "enum", enum: SegmentOperatorEnum, name: "operator" })
  operator: SegmentOperatorEnum;

  @ManyToOne(() => AdminEntity)
  @JoinColumn({ name: "created_by" })
  createdBy: AdminEntity;

  @Column({ name: "created_by" })
  createdById: string;

  @Column({ type: "timestamptz", nullable: true, name: "last_synced_at" })
  lastSyncedAt: Date;

  @CreateDateColumn({ type: "timestamptz", nullable: true, name: "created_at" })
  createAt?: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true, name: "updated_at" })
  updateAt?: Date;
}