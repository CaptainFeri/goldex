import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { WarehouseEntity } from "./warehouse.entity";
import { MovementDirectionEnum, MovementPartyEnum, MovementSourceEnum } from "../enum/movement.enum";

/**
 * One physical crossing of the warehouse door.
 *
 * Metal entering or leaving used to be an implicit side effect of three
 * different service methods, with nothing that could be queried afterwards.
 * `warehouse_history` is an audit trail — free-text descriptions of what an
 * operator did — not a ledger: it has no direction, no signed weight and no
 * counterparty column, so "what physically entered warehouse 1 today, and from
 * whom" was unanswerable without reading prose.
 *
 * This is that ledger. Every path that moves metal writes one row, whether it
 * came from a request, a provider settlement, a manual entry, or the wastage
 * consumed in cutting a package.
 *
 * Deliberately separate from `warehouse_request`: a request is paperwork, and
 * paperwork is not movement. A request can be raised and never fulfilled, and
 * metal can move with no request behind it at all — which is precisely the case
 * worth being able to list.
 */
@Entity("warehouse_movement")
@Index(["warehouseId", "createAt"])
@Index(["direction", "createAt"])
export class WarehouseMovementEntity extends myBaseEntity {
  @ManyToOne(() => WarehouseEntity, { onDelete: "SET NULL" })
  @JoinColumn({ name: "warehouse_id" })
  warehouse: WarehouseEntity;

  @Column({ name: "warehouse_id", type: "uuid" })
  warehouseId: string;

  @Column({ type: "enum", enum: MovementDirectionEnum })
  direction: MovementDirectionEnum;

  @Column({ type: "enum", enum: MovementSourceEnum })
  source: MovementSourceEnum;

  /**
   * Net weight (750) that crossed the door, always a positive magnitude.
   * Direction lives in `direction`, never in the sign — a signed column
   * invites a query that forgets to check which way it went.
   */
  @Column({ type: "decimal", precision: 20, scale: 8, name: "net_weight" })
  netWeight: number;

  @Column({ name: "symbol_id", type: "uuid", nullable: true })
  symbolId: string;

  @Column({ name: "party_type", type: "enum", enum: MovementPartyEnum })
  partyType: MovementPartyEnum;

  @ManyToOne(() => UserEntity, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "party_user_id" })
  partyUser: UserEntity;

  @Column({ name: "party_user_id", type: "uuid", nullable: true })
  partyUserId: string;

  @Column({ name: "provider_key", type: "varchar", length: 100, nullable: true })
  providerKey: string;

  /**
   * The packages this movement covers.
   *
   * A list rather than a foreign key: an intake may be shelved as several
   * packages and a withdrawal may be served by a combination of them, and both
   * are one crossing of the door.
   */
  @Column({ name: "packet_ids", type: "jsonb", nullable: true })
  packetIds: string[];

  /** The paperwork behind it, when there was any. */
  @Column({ name: "request_id", type: "uuid", nullable: true })
  requestId: string;

  @Column({ name: "settlement_id", type: "uuid", nullable: true })
  settlementId: string;

  @Column({ name: "voucher_id", type: "uuid", nullable: true })
  voucherId: string;

  /** The operator who handled it. */
  @Column({ name: "admin_id", type: "uuid", nullable: true })
  adminId: string;

  @Column({ type: "text", nullable: true })
  notes: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: any;
}
