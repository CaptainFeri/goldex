import { FileTargetEnum } from "../../file/enum/file.target.enum";
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  DeleteDateColumn,
} from "typeorm";
import { UserEntity } from "./user.entity";

export enum KycDocumentStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

@Entity("kyc_documents")
@Index(["userId", "status"])
@Index(["status", "createdAt"])
export class UserKycDocumentEntity {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column({ type: "uuid", name: "user_id" })
  @Index()
  userId: string;

  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({
    type: "enum",
    enum: FileTargetEnum,
    name: "file_target",
  })
  fileTarget: FileTargetEnum;

  @Column({
    name: "file_name",
  })
  fileName: string;

  @Column({
    name: "file_url",
  })
  fileUrl: string;

  @Column({
    name: "file_size",
  })
  fileSize: number;

  @Column({
    name: "mime_type",
  })
  mimeType: string;

  @Column({ nullable: true })
  etag: string;

  @Column({
    type: "enum",
    enum: KycDocumentStatus,
    default: KycDocumentStatus.PENDING,
  })
  status: KycDocumentStatus;

  @Column({ type: "text", nullable: true, name: "rejection_reason" })
  rejectionReason: string;

  @Column({ type: "jsonb", nullable: true, default: {} })
  metadata: Record<string, any>;

  @Column({ type: "uuid", nullable: true, name: "reviewed_by" })
  reviewedBy: string;

  @Column({ type: "timestamp", nullable: true, name: "reviewed_at" })
  reviewedAt: Date;

  @CreateDateColumn({
    name: "created_at",
  })
  createdAt: Date;

  @UpdateDateColumn({
    name: "updated_at",
  })
  updatedAt: Date;

  @DeleteDateColumn({
    type: "timestamptz",
    nullable: true,
    name: "deleted_at",
  })
  deleteAt?: Date;
}
