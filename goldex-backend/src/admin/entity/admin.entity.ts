// admin.entity.ts
import { Column, Entity, OneToMany } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { AdminRole } from "../role/admin.roles.enum";

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

  @Column({
    type: "enum",
    enum: AdminRole,
    default: AdminRole.ADMIN,
  })
  role: AdminRole;

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
