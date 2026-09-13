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

  /**
   * The material this package holds.
   *
   * Allocation used to match on weight alone, which let a request for gold be
   * served a package of silver. It is nullable only because rows written
   * before this column existed cannot be told apart by weight either.
   */
  @Column({ type: "uuid", name: "symbol_id", nullable: true })
  symbolId: string;

  /**
   * Who handed this package in, and which admin took delivery of it.
   *
   * Recorded facts, not ownership: a package in the warehouse is fungible, so
   * the one user 1 brought in may be released to user 2 on their withdrawal.
   * Written once at intake and never changed after — `userId` is what moves.
   */
  @ManyToOne(() => UserEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "sender_user_id" })
  sender: UserEntity;

  @Column({ name: "sender_user_id", type: "uuid", nullable: true })
  senderUserId: string;

  @Column({ name: "received_by_admin_id", type: "uuid", nullable: true })
  receivedByAdminId: string;

  /** The other half of the chain: who took it out, and which admin released it. */
  @ManyToOne(() => UserEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "delivered_to_user_id" })
  deliveredTo: UserEntity;

  @Column({ name: "delivered_to_user_id", type: "uuid", nullable: true })
  deliveredToUserId: string;

  @Column({ name: "delivered_by_admin_id", type: "uuid", nullable: true })
  deliveredByAdminId: string;

  /** The warehouse request this package was created for, when it came from one. */
  @Column({ name: "source_request_id", type: "uuid", nullable: true })
  sourceRequestId: string;

  /**
   * For packages packed out of provider settlement material: which provider it
   * came from and which settlement row it draws down. Held as columns rather
   * than parsed back out of `batchNumber`, which the unpacked-material balance
   * would otherwise have to depend on.
   */
  @Column({ name: "provider_key", type: "varchar", length: 100, nullable: true })
  providerKey: string;

  @Column({ name: "settlement_id", type: "uuid", nullable: true })
  settlementId: string;

  /**
   * The withdrawal request currently holding this package, while its status is
   * RESERVED.
   *
   * A reverse pointer rather than relying on `warehouse_request.packet_id`,
   * because a combination allocation ties several packages to one request and
   * that column can only name one of them.
   */
  @Column({ name: "reserved_for_request_id", type: "uuid", nullable: true })
  reservedForRequestId: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: any;
}
