import { Entity, Column, ManyToOne, JoinColumn } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { AdminEntity } from "../../admin/entity/admin.entity";

export enum NoteCategoryEnum {
  GENERAL = "GENERAL",
  SUPPORT = "SUPPORT",
  COMPLIANCE = "COMPLIANCE",
  SALES = "SALES",
  COMPLAINT = "COMPLAINT",
}

@Entity("customer_notes")
export class CustomerNoteEntity extends myBaseEntity {
  @ManyToOne(() => UserEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "user_id" })
  user: UserEntity;

  @Column({ name: "user_id" })
  userId: string;

  @ManyToOne(() => AdminEntity)
  @JoinColumn({ name: "admin_id" })
  admin: AdminEntity;

  @Column({ name: "admin_id" })
  adminId: string;

  @Column({ type: "text" })
  content: string;

  @Column({ type: "enum", enum: NoteCategoryEnum, default: NoteCategoryEnum.GENERAL })
  category: NoteCategoryEnum;

  @Column({ type: "boolean", default: false, name: "is_pinned" })
  isPinned: boolean;
}
