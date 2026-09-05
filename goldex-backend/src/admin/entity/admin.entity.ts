// admin.entity.ts
import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { AdminRole } from "../role/admin.roles.enum";
import { AdminRoleEntity } from "../../admin-role/entity/admin-role.entity";

@Entity("admin")
export class AdminEntity extends myBaseEntity {
  // Admins authenticate by mobile + OTP (Kavenegar). Phone is the login identity.
  @Column({ unique: true, nullable: true })
  phone: string;

  // Email/password are legacy/optional now — kept for identification only.
  @Column({ unique: true, nullable: true })
  email: string;

  @Column({
    name: "hash_password",
    nullable: true,
  })
  hashPassword: string;

  /**
   * Legacy identity, kept because several code paths still read it.
   * Authorization reads `roleRef.permissions`, not this.
   */
  @Column({
    type: "enum",
    enum: AdminRole,
    default: AdminRole.ADMIN,
  })
  role: AdminRole;

  @Column({ name: "role_id", type: "uuid", nullable: true })
  roleId?: string | null;

  /** The data-driven role this admin's permissions come from. */
  @ManyToOne(() => AdminRoleEntity, { nullable: true, onDelete: "SET NULL" })
  @JoinColumn({ name: "role_id" })
  roleRef?: AdminRoleEntity | null;

  @Column({
    name: "is_suspended",
    type: "boolean",
    default: false,
  })
  isSuspended: boolean;

  @Column({
    name: "suspended_at",
    type: "timestamp",
    nullable: true,
  })
  suspendedAt: Date | null;

  @Column({
    name: "suspended_by",
    type: "uuid",
    nullable: true,
  })
  suspendedBy: string | null;

  @Column({
    name: "last_login_at",
    type: "timestamp",
    nullable: true,
  })
  lastLoginAt: Date | null;
}
