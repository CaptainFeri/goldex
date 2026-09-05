import { Column, Entity, OneToMany } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { WarehouseStatusEnum } from "../enum/warehouse-status.enum";
import { PacketEntity } from "./packet.entity";
import { WarehouseRequestEntity } from "./warehouse-request.entity";

@Entity("warehouse")
export class WarehouseEntity extends myBaseEntity {
  @Column({ type: "varchar", length: 255 })
  name: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  location: string;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    name: "capacity_total",
    default: 0,
  })
  capacityTotal: number;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    name: "capacity_used",
    default: 0,
  })
  capacityUsed: number;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    name: "capacity_remaining",
    default: 0,
  })
  capacityRemaining: number;

  @Column({ type: "jsonb", name: "delivery_dates", nullable: true })
  deliveryDates: string[];

  @Column({ type: "jsonb", name: "delivery_schedule", nullable: true })
  deliverySchedule: Record<string, { start: string; end: string }>;

  @Column({
    type: "varchar",
    length: 100,
    name: "time_limit",
    nullable: true,
  })
  timeLimit: string;

  @Column({
    type: "enum",
    enum: WarehouseStatusEnum,
    default: WarehouseStatusEnum.ACTIVE,
  })
  status: WarehouseStatusEnum;

  @OneToMany(() => PacketEntity, (packet) => packet.warehouse)
  packets: PacketEntity[];

  @OneToMany(() => WarehouseRequestEntity, (request) => request.warehouse)
  requests: WarehouseRequestEntity[];
}
