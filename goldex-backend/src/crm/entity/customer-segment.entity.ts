import { Entity, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, PrimaryGeneratedColumn } from "typeorm";
import { AdminEntity } from "../../admin/entity/admin.entity";

@Entity("customer_segments")
export class CustomerSegmentEntity {
  @PrimaryGeneratedColumn("uuid")
  public id: string;

  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "jsonb" })
  criteria: Record<string, any>;

  @Column({ type: "boolean", default: false, name: "is_dynamic" })
  isDynamic: boolean;

  @ManyToOne(() => AdminEntity)
  @JoinColumn({ name: "created_by" })
  createdBy: AdminEntity;

  @Column({ name: "created_by" })
  createdById: string;

  @CreateDateColumn({ type: "timestamptz", nullable: true, name: "created_at" })
  createAt?: Date;

  @UpdateDateColumn({ type: "timestamptz", nullable: true, name: "updated_at" })
  updateAt?: Date;
}
