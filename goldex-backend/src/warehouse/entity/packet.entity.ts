import { Column, Entity, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { WarehouseEntity } from "./warehouse.entity";
import { PacketStatusEnum } from "../enum/packet-status.enum";

@Entity("packet")
export class PacketEntity extends myBaseEntity {
  @ManyToOne(() => WarehouseEntity, (warehouse) => warehouse.packets, {
    onDelete: "SET NULL",
  })
  @JoinColumn({ name: "warehouse_id" })
  warehouse: WarehouseEntity;

  @Column({ name: "warehouse_id", type: "uuid", nullable: true })
  warehouseId: string;

  @Column({
    type: "decimal",
    precision: 20,
    scale: 8,
    name: "pure_weight",
  })
  pureWeight: number;

  @Column({ type: "varchar", length: 255, name: "id_secure", unique: true })
  idSecure: string;

  @Column({ type: "timestamptz", name: "date_time", default: () => "NOW()" })
  dateTime: Date;

  @Column({ type: "timestamptz", name: "delivery_time", nullable: true })
  deliveryTime: Date;

  @Column({
    type: "enum",
    enum: PacketStatusEnum,
    default: PacketStatusEnum.PENDING,
  })
  status: PacketStatusEnum;

  @Column({
    type: "varchar",
    length: 100,
    name: "warehouse_index_position",
    nullable: true,
  })
  warehouseIndexPosition: string;

  @Column({ type: "decimal", precision: 10, scale: 4, nullable: true })
  ang: number;

  @Column({ type: "decimal", precision: 10, scale: 4, nullable: true })
  ayar: number;

  @Column({ type: "decimal", precision: 20, scale: 8, name: "apparent_weight", nullable: true })
  apparentWeight: number;

  @Column({ type: "decimal", precision: 20, scale: 8, nullable: true })
  wastage: number;

  @Column({ type: "uuid", name: "parent_id", nullable: true })
  parentId: string;

  @Column({ type: "varchar", length: 500, nullable: true })
  picture: string;

  @ManyToOne(() => UserEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "user_id", type: "uuid", nullable: true })
  userId: string;

  @Column({ type: "varchar", length: 500, name: "qr_code", nullable: true })
  qrCode: string;

  @Column({
    type: "boolean",
    name: "is_orphan",
    default: false,
  })
  isOrphan: boolean;

  @Column({
    type: "varchar",
    length: 100,
    name: "batch_number",
    nullable: true,
  })
  batchNumber: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: any;
}
