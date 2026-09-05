import { Entity, Column, CreateDateColumn, PrimaryGeneratedColumn } from "typeorm";

@Entity("customer_tags")
export class CustomerTagEntity {
  @PrimaryGeneratedColumn("uuid")
  public id: string;

  @Column({ type: "varchar", length: 100, unique: true })
  name: string;

  @Column({ type: "varchar", length: 7 })
  color: string;

  @CreateDateColumn({ type: "timestamptz", nullable: true, name: "created_at" })
  createAt?: Date;
}
