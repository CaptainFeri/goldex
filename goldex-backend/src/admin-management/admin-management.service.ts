import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CreateAdminDto } from "./dto/create-admin.dto";
import { UpdateAdminDto } from "./dto/update-admin.dto";
import { SuspendAdminDto } from "./dto/suspend-admin.dto";
import { AdminEntity } from "../admin/entity/admin.entity";
import { AdminScheduleEntity } from "../admin-schedule/entity/admin-schedule.entity";
import { AdminRole, RoleHierarchy } from "../admin/role/admin.roles.enum";
import { AdminRoleEntity } from "../admin-role/entity/admin-role.entity";
import { permissionsOf } from "../admin-role/guard/admin-permissions.guard";
import { legacyRoleFor } from "../admin-role/legacy-role";
import { PERMISSION_KEYS, ROOT_ROLE_SLUG } from "../admin-role/permission.catalog";
import * as bcrypt from "bcryptjs";

const FINANCE_DEFAULT_SCHEDULE = [
  { dayOfWeek: 6, dayLabel: "Saturday",  startTime: "09:00", endTime: "18:00" },
  { dayOfWeek: 0, dayLabel: "Sunday",    startTime: "09:00", endTime: "18:00" },
  { dayOfWeek: 1, dayLabel: "Monday",    startTime: "09:00", endTime: "18:00" },
  { dayOfWeek: 2, dayLabel: "Tuesday",   startTime: "09:00", endTime: "18:00" },
  { dayOfWeek: 3, dayLabel: "Wednesday", startTime: "09:00", endTime: "18:00" },
];

@Injectable()
export class AdminManagementService {
  constructor(
    @InjectRepository(AdminEntity)
    private adminRepository: Repository<AdminEntity>,
    @InjectRepository(AdminScheduleEntity)
    private scheduleRepository: Repository<AdminScheduleEntity>,
    @InjectRepository(AdminRoleEntity)
    private roleRepository: Repository<AdminRoleEntity>,
  ) {}

  async create(createAdminDto: CreateAdminDto, currentAdmin?: AdminEntity): Promise<AdminEntity> {
    // Phone is the primary identity — reject duplicates.
    const existingByPhone = await this.adminRepository.findOne({
      where: { phone: createAdminDto.phone },
    });
    if (existingByPhone) {
      throw new ConflictException("Admin with this phone already exists");
    }

    // Email is optional now, but still unique when provided.
    if (createAdminDto.email) {
      const existingByEmail = await this.adminRepository.findOne({
        where: { email: createAdminDto.email },
      });
      if (existingByEmail) {
        throw new ConflictException("Admin with this email already exists");
      }
    }

    // Resolved before the row is written: an admin saved without `role_id` has
    // no permissions at all, and looks identical to one whose role was set —
    // which is exactly how new super admins ended up seeing nothing.
    const role = await this.resolveRole(createAdminDto.roleId, createAdminDto.role);
    if (currentAdmin) this.assertMayGrantRole(currentAdmin, role);

    const admin = this.adminRepository.create({
      phone: createAdminDto.phone,
      email: createAdminDto.email ?? null,
      // Password is required for login step 1 (phone+password) before OTP.
      hashPassword: await bcrypt.hash(createAdminDto.password, 10),
      roleId: role.id,
      role: legacyRoleFor(role),
    });

    const saved = await this.adminRepository.save(admin);

    // Auto-create work schedule for FINANCE role
    if (saved.role === AdminRole.FINANCE) {
      const entries = (createAdminDto.schedules ?? FINANCE_DEFAULT_SCHEDULE).map((s) =>
        this.scheduleRepository.create({ ...s, adminId: saved.id, timezone: "Asia/Tehran" }),
      );
      await this.scheduleRepository.save(entries);
    }

    return saved;
  }

  async findByPhone(phone: string): Promise<AdminEntity | null> {
    return await this.adminRepository.findOne({ where: { phone } });
  }

  async findAll(filters?: { role?: AdminRole; isSuspended?: boolean }): Promise<AdminEntity[]> {
    const queryBuilder = this.adminRepository.createQueryBuilder("admin");

    if (filters?.role) {
      queryBuilder.andWhere("admin.role = :role", { role: filters.role });
    }

    if (filters?.isSuspended !== undefined) {
      queryBuilder.andWhere("admin.isSuspended = :isSuspended", { isSuspended: filters.isSuspended });
    }

    return await queryBuilder.getMany();
  }

  async findOne(id: string): Promise<AdminEntity> {
    const admin = await this.adminRepository.findOne({ where: { id } });

    if (!admin) {
      throw new NotFoundException(`Admin with ID ${id} not found`);
    }

    return admin;
  }

  async findByEmail(email: string): Promise<AdminEntity | null> {
    return await this.adminRepository.findOne({ where: { email } });
  }

  async update(id: string, updateAdminDto: UpdateAdminDto, currentAdmin: AdminEntity): Promise<AdminEntity> {
    const admin = await this.findOne(id);

    // Check permission
    this.checkUpdatePermission(currentAdmin, admin);

    // Check if phone is being updated and if it's already taken
    if (updateAdminDto.phone && updateAdminDto.phone !== admin.phone) {
      const existingByPhone = await this.adminRepository.findOne({
        where: { phone: updateAdminDto.phone },
      });
      if (existingByPhone) {
        throw new ConflictException("Phone already in use");
      }
      admin.phone = updateAdminDto.phone;
    }

    // Check if email is being updated and if it's already taken
    if (updateAdminDto.email && updateAdminDto.email !== admin.email) {
      const existingAdmin = await this.adminRepository.findOne({
        where: { email: updateAdminDto.email },
      });

      if (existingAdmin) {
        throw new ConflictException("Email already in use");
      }
      admin.email = updateAdminDto.email;
    }

    // Update role with permission check
    if (updateAdminDto.roleId !== undefined || (updateAdminDto.role && updateAdminDto.role !== admin.role)) {
      const role = await this.resolveRole(updateAdminDto.roleId, updateAdminDto.role ?? admin.role);
      const nextLegacy = legacyRoleFor(role);
      if (role.id !== admin.roleId || nextLegacy !== admin.role) {
        this.checkRoleUpdatePermission(currentAdmin, admin, nextLegacy);
        this.assertMayGrantRole(currentAdmin, role);
        admin.roleId = role.id;
        // Kept in step with `role_id`: the hierarchy checks above read this
        // column, and a stale value would let the wrong people edit each other.
        admin.role = nextLegacy;
      }
    }

    // Update password if provided
    if (updateAdminDto.password) {
      admin.hashPassword = await bcrypt.hash(updateAdminDto.password, 10);
    }

    return await this.adminRepository.save(admin);
  }

  async suspendAdmin(id: string, suspendAdminDto: SuspendAdminDto, currentAdmin: AdminEntity): Promise<AdminEntity> {
    const admin = await this.findOne(id);

    // Check permission to suspend
    this.checkSuspendPermission(currentAdmin, admin);

    // Prevent self-suspension
    if (currentAdmin.id === id) {
      throw new BadRequestException("You cannot suspend yourself");
    }

    // Prevent suspending SUPER_ADMIN if current is not SUPER_ADMIN
    if (admin.role === AdminRole.SUPER_ADMIN && currentAdmin.role !== AdminRole.SUPER_ADMIN) {
      throw new ForbiddenException("Cannot suspend a SUPER_ADMIN");
    }

    admin.isSuspended = suspendAdminDto.isSuspended;
    admin.suspendedAt = suspendAdminDto.isSuspended ? new Date() : null;
    admin.suspendedBy = suspendAdminDto.isSuspended ? currentAdmin.id : null;

    // You could add a reason field to track suspension reasons
    // admin.suspensionReason = suspendAdminDto.reason;

    return await this.adminRepository.save(admin);
  }

  async remove(id: string, currentAdmin: AdminEntity): Promise<void> {
    const admin = await this.findOne(id);

    // Check permission to delete
    this.checkDeletePermission(currentAdmin, admin);

    // Prevent self-deletion
    if (currentAdmin.id === id) {
      throw new BadRequestException("You cannot delete yourself");
    }

    const result = await this.adminRepository.softDelete(id);

    if (result.affected === 0) {
      throw new NotFoundException(`Admin with ID ${id} not found`);
    }
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.adminRepository.update(id, { lastLoginAt: new Date() });
  }

  async validatePassword(admin: AdminEntity, password: string): Promise<boolean> {
    return await bcrypt.compare(password, admin.hashPassword);
  }

  /**
   * The role row an admin is being placed in.
   *
   * `roleId` wins when given — it is the only way to reach a custom role. The
   * legacy `role` enum falls back to the row whose slug matches it, which is
   * the join migration 097 used to backfill every admin that existed then.
   *
   * A missing row is an error rather than a null `role_id`: an install whose
   * seeded roles are gone is broken, and quietly creating a permission-less
   * admin hides that until someone logs in and finds an empty panel. Naming
   * neither is an error for the same reason in reverse — a default here would
   * hand out whatever role it named.
   */
  private async resolveRole(roleId: string | undefined, slug: AdminRole | undefined): Promise<AdminRoleEntity> {
    // Neither given is a caller mistake, not a reason to pick one. Defaulting
    // would quietly hand out whatever role the default names.
    if (!roleId && !slug) throw new BadRequestException("ADMIN.ROLE_REQUIRED");
    if (roleId) {
      const byId = await this.roleRepository.findOne({ where: { id: roleId } });
      if (!byId) throw new BadRequestException(`ADMIN.ROLE_NOT_FOUND:${roleId}`);
      return byId;
    }
    const wanted = slug as AdminRole;
    const bySlug = await this.roleRepository.findOne({ where: { slug: wanted } });
    if (!bySlug) throw new BadRequestException(`ADMIN.ROLE_NOT_FOUND:${wanted}`);
    return bySlug;
  }

  /**
   * Whatever a role grants, the caller must already hold.
   *
   * The same rule the roles module applies to editing a role — without it,
   * creating an account is a way around the catalog: anyone able to reach this
   * endpoint could mint a super admin and log in as them.
   */
  private assertMayGrantRole(currentAdmin: AdminEntity, role: AdminRoleEntity): void {
    const granted = role.slug === ROOT_ROLE_SLUG ? [...PERMISSION_KEYS] : (role.permissions ?? []);
    const held = permissionsOf(currentAdmin);
    const escalating = granted.filter((p) => !held.includes(p));
    if (escalating.length > 0) {
      throw new ForbiddenException(`ADMIN.CANNOT_GRANT_UNHELD:${escalating.join(",")}`);
    }
  }

  // Permission checking methods
  private checkUpdatePermission(currentAdmin: AdminEntity, targetAdmin: AdminEntity): void {
    const currentRoleWeight = RoleHierarchy[currentAdmin.role];
    const targetRoleWeight = RoleHierarchy[targetAdmin.role];

    // Can only update users with lower or equal role weight
    if (currentRoleWeight < targetRoleWeight) {
      throw new ForbiddenException("Cannot update an admin with higher or equal role");
    }
  }

  private checkRoleUpdatePermission(currentAdmin: AdminEntity, targetAdmin: AdminEntity, newRole: AdminRole): void {
    const currentRoleWeight = RoleHierarchy[currentAdmin.role];
    const targetRoleWeight = RoleHierarchy[targetAdmin.role];
    const newRoleWeight = RoleHierarchy[newRole];

    // Cannot change role of someone with higher or equal authority
    if (currentRoleWeight <= targetRoleWeight) {
      throw new ForbiddenException("Cannot change role of an admin with equal or higher authority");
    }

    // Cannot assign a role higher than your own
    if (newRoleWeight > currentRoleWeight) {
      throw new ForbiddenException("Cannot assign a role higher than your own");
    }
  }

  private checkSuspendPermission(currentAdmin: AdminEntity, targetAdmin: AdminEntity): void {
    const currentRoleWeight = RoleHierarchy[currentAdmin.role];
    const targetRoleWeight = RoleHierarchy[targetAdmin.role];

    // Can only suspend users with lower role weight
    if (currentRoleWeight <= targetRoleWeight) {
      throw new ForbiddenException("Cannot suspend an admin with equal or higher role");
    }
  }

  private checkDeletePermission(currentAdmin: AdminEntity, targetAdmin: AdminEntity): void {
    const currentRoleWeight = RoleHierarchy[currentAdmin.role];
    const targetRoleWeight = RoleHierarchy[targetAdmin.role];

    // Can only delete users with lower role weight
    if (currentRoleWeight <= targetRoleWeight) {
      throw new ForbiddenException("Cannot delete an admin with equal or higher role");
    }
  }
}
