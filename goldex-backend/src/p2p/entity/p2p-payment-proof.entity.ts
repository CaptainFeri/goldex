import { Column, Entity, JoinColumn, OneToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { P2pMatchEntity } from "./p2p-match.entity";

@Entity("p2p_payment_proof")
export class P2pPaymentProofEntity extends myBaseEntity {
  @Column({ name: "match_id", type: "uuid", unique: true })
  matchId: string;

  @OneToOne(() => P2pMatchEntity, (m) => m.paymentProof, { onDelete: "CASCADE" })
  @JoinColumn({ name: "match_id" })
  match: P2pMatchEntity;

  @Column({ name: "amount", type: "decimal", precision: 20, scale: 8 })
  amount: number;

  @Column({ name: "source_account", nullable: true })
  sourceAccount?: string;

  @Column({ name: "destination_account", nullable: true })
  destinationAccount?: string;

  @Column({ name: "tracking_code", nullable: true })
  trackingCode?: string;

  @Column({ name: "paid_at", type: "timestamptz", nullable: true })
  paidAt?: Date;

  /** MinIO object name; served to clients only as a presigned URL. */
  @Column({ name: "receipt_object_name", nullable: true })
  receiptObjectName?: string;

  @Column({ name: "ocr_result_json", type: "jsonb", nullable: true })
  ocrResultJson?: Record<string, any>;

  /** The receipt's own numbers disagree with the match — raises an escalation. */
  @Column({ name: "ocr_mismatch", default: false })
  ocrMismatch: boolean;

  /** Makes a re-submitted proof return the first one instead of creating a second. */
  @Column({ name: "idempotency_key", nullable: true, unique: true })
  idempotencyKey?: string;

  @Column({ name: "submitted_at", type: "timestamptz", nullable: true })
  submittedAt?: Date;
}
