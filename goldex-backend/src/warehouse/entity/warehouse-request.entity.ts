import { Column, Entity, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { AdminEntity } from "../../admin/entity/admin.entity";
import { WarehouseEntity } from "./warehouse.entity";
import { PacketEntity } from "./packet.entity";
import { RequestTypeEnum } from "../enum/request-type.enum";
import { RequestStatusEnum } from "../enum/request-status.enum";

@Entity("warehouse_request")
export class WarehouseRequestEntity extends myBaseEntity {
  @Column({
    type: "enum",
    enum: RequestTypeEnum,
    name: "type",
  })
  type: RequestTypeEnum;

  @Column({
    type: "enum",
    enum: RequestStatusEnum,
    default: RequestStatusEnum.PENDING,
  })
  status: RequestStatusEnum;

  @ManyToOne(() => UserEntity, { onDelete: "SET NULL" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "user_id", type: "uuid" })
  userId: string;

  @ManyToOne(() => PacketEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "packet_id" })
  packet: PacketEntity;

  @Column({ name: "packet_id", type: "uuid", nullable: true })
  packetId: string;

  @ManyToOne(() => WarehouseEntity, (warehouse) => warehouse.requests, {
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "warehouse_id" })
  warehouse: WarehouseEntity;

  @Column({ name: "warehouse_id", type: "uuid" })
  warehouseId: string;

  @ManyToOne(() => AdminEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "admin_id" })
  admin: AdminEntity;

  @Column({ name: "admin_id", type: "uuid", nullable: true })
  adminId: string;

  @Column({ type: "decimal", precision: 20, scale: 8 })
  weight: number;

  @Column({ type: "uuid", name: "symbol_id", nullable: true })
  symbolId: string;

  @Column({ type: "timestamptz", name: "delivery_date", nullable: true })
  deliveryDate: Date;

  @Column({ type: "varchar", length: 100, name: "delivery_time", nullable: true })
  deliveryTime: string;

  @Column({ type: "varchar", length: 500, name: "delivery_location", nullable: true })
  deliveryLocation: string;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({ type: "timestamptz", name: "processed_at", nullable: true })
  processedAt: Date;

  @Column({ type: "jsonb", nullable: true })
  metadata: any;
}
