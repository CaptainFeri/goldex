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
  ) {}

  async create(createAdminDto: CreateAdminDto, currentAdminId?: string): Promise<AdminEntity> {
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

    const admin = this.adminRepository.create({
      phone: createAdminDto.phone,
      email: createAdminDto.email ?? null,
      // Password is required for login step 1 (phone+password) before OTP.
      hashPassword: await bcrypt.hash(createAdminDto.password, 10),
      role: createAdminDto.role || AdminRole.ADMIN,
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
    if (updateAdminDto.role && updateAdminDto.role !== admin.role) {
      this.checkRoleUpdatePermission(currentAdmin, admin, updateAdminDto.role);
      admin.role = updateAdminDto.role;
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
