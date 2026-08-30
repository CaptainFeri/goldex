import { Column, Entity } from "typeorm";
import { MyLocalBaseEntity } from "../../shared/entity/base.local.entity";

@Entity("warehouse_history")
export class WarehouseHistoryEntity extends MyLocalBaseEntity {
  @Column({ type: "uuid", name: "warehouse_id", nullable: true })
  warehouseId: string;

  @Column({ type: "uuid", name: "packet_id", nullable: true })
  packetId: string;

  @Column({ type: "uuid", name: "request_id", nullable: true })
  requestId: string;

  @Column({ type: "varchar", length: 100 })
  action: string;

  @Column({ type: "text", nullable: true })
  description: string;

  @Column({ type: "varchar", length: 100, name: "performed_by", nullable: true })
  performedBy: string;

  @Column({ type: "varchar", length: 50, name: "performed_role", nullable: true })
  performedRole: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: any;
}
