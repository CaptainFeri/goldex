import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Not, Repository } from "typeorm";
import { AdminEntity } from "../admin/entity/admin.entity";
import { AdminRoleEntity } from "./entity/admin-role.entity";
import { permissionsOf } from "./guard/admin-permissions.guard";
import {
  PERMISSIONS,
  PERMISSION_KEYS,
  ROOT_ROLE_SLUG,
  isPermissionKey,
} from "./permission.catalog";
import {
  AdminRoleDto,
  CreateRoleDto,
  MAX_CREDIT_AMOUNT,
  PermissionDto,
  RoleCapabilitiesDto,
  RoleMemberDto,
  RoleStatsDto,
  UpdateRoleDto,
} from "./dto/admin-role.dto";

/** The permission that governs this module itself. */
const ROLES_MANAGE = "roles_manage";

/** Fees are quoted to three decimals; more is a typo, not a finer rate. */
const FEE_DECIMALS = 3;

@Injectable()
export class AdminRoleService {
  constructor(
    @InjectRepository(AdminRoleEntity) private readonly roles: Repository<AdminRoleEntity>,
    @InjectRepository(AdminEntity) private readonly admins: Repository<AdminEntity>,
  ) {}

  catalog(): PermissionDto[] {
    return PERMISSIONS.map((p) => ({ key: p.key, label: p.label }));
  }

  async list(caller: AdminEntity): Promise<AdminRoleDto[]> {
    const roles = await this.roles.find({ order: { isFixed: "DESC", createAt: "ASC" } });
    const counts = await this.memberCounts(roles.map((r) => r.id));
    return roles.map((r) => this.toDto(r, counts.get(r.id) ?? 0, caller));
  }

  async stats(): Promise<RoleStatsDto> {
    const roles = await this.roles.find();
    const counts = await this.memberCounts(roles.map((r) => r.id));
    return {
      total: roles.length,
      totalMembers: [...counts.values()].reduce((a, b) => a + b, 0),
      fixed: roles.filter((r) => r.isFixed).length,
      empty: roles.filter((r) => (counts.get(r.id) ?? 0) === 0).length,
    };
  }

  async findOne(caller: AdminEntity, id: string): Promise<AdminRoleDto> {
    const role = await this.require(id);
    const counts = await this.memberCounts([role.id]);
    return this.toDto(role, counts.get(role.id) ?? 0, caller);
  }

  async members(id: string): Promise<RoleMemberDto[]> {
    await this.require(id);
    const rows = await this.admins.find({ where: { roleId: id }, order: { createAt: "ASC" } });
    return rows.map((a) => ({
      id: a.id,
      phone: a.phone ?? null,
      email: a.email ?? null,
      isSuspended: a.isSuspended,
      lastLoginAt: a.lastLoginAt ?? null,
    }));
  }

  async create(caller: AdminEntity, dto: CreateRoleDto): Promise<AdminRoleDto> {
    const permissions = this.validatePermissions(caller, dto.permissions ?? []);
    this.validateConfig(dto);

    const role = await this.roles.save(
      this.roles.create({
        // Slugs are generated, never taken from the request: code keys off them
        // and a caller-chosen slug could collide with a fixed role's.
        slug: await this.nextSlug(dto.roleName),
        roleName: dto.roleName,
        isFixed: false,
        permissions,
        wallets: dto.wallets ?? [],
        configs: dto.configs ?? {},
        pairs: dto.pairs ?? [],
        maxCredit: dto.maxCredit ?? null,
      }),
    );
    return this.findOne(caller, role.id);
  }

  async update(caller: AdminEntity, id: string, dto: UpdateRoleDto): Promise<AdminRoleDto> {
    const role = await this.require(id);
    this.assertEditable(role);
    this.validateConfig(dto);

    if (dto.roleName !== undefined && dto.roleName !== role.roleName) {
      // Identity is frozen for a migrated role; configuration is not.
      if (role.isFixed) throw new ForbiddenException("ROLE.FIXED_CANNOT_RENAME");
      role.roleName = dto.roleName;
    }
    if (dto.wallets !== undefined) role.wallets = dto.wallets;
    if (dto.configs !== undefined) role.configs = dto.configs;
    if (dto.pairs !== undefined) role.pairs = dto.pairs;
    if (dto.maxCredit !== undefined) role.maxCredit = dto.maxCredit;
    if (dto.permissions !== undefined) {
      role.permissions = await this.checkedPermissions(caller, role, dto.permissions);
    }

    await this.roles.save(role);
    return this.findOne(caller, id);
  }

  async setPermissions(caller: AdminEntity, id: string, permissions: string[]): Promise<AdminRoleDto> {
    const role = await this.require(id);
    this.assertEditable(role);
    role.permissions = await this.checkedPermissions(caller, role, permissions);
    await this.roles.save(role);
    return this.findOne(caller, id);
  }

  async remove(id: string): Promise<void> {
    const role = await this.require(id);
    if (role.isFixed) throw new ForbiddenException("ROLE.FIXED_CANNOT_DELETE");
    const members = await this.admins.count({ where: { roleId: id } });
    // Deleting a role out from under its members would silently strip their
    // access rather than move it somewhere deliberate.
    if (members > 0) throw new BadRequestException("ROLE.HAS_MEMBERS");
    await this.roles.softRemove(role);
  }

  // ── Invariants ──────────────────────────────────────────────────────────

  /**
   * The three rules that hold on every role write.
   *
   * 1. You cannot remove `roles_manage` from your own role — the fastest way to
   *    lock yourself out of the screen you are standing on.
   * 2. You cannot grant a permission your own role lacks. Otherwise any holder
   *    of `roles_manage` could mint themselves the full set by proxy, and the
   *    catalog would mean nothing.
   * 3. At least one active, unsuspended admin must keep `roles_manage`. Without
   *    it the whole install is locked out with no way back through the API.
   */
  private async checkedPermissions(
    caller: AdminEntity,
    role: AdminRoleEntity,
    requested: string[],
  ): Promise<string[]> {
    const next = this.validatePermissions(caller, requested);

    const callerRoleId = caller.roleId ?? caller.roleRef?.id;
    const losingManage = !next.includes(ROLES_MANAGE) && role.permissions.includes(ROLES_MANAGE);

    if (losingManage && callerRoleId === role.id) {
      throw new ForbiddenException("ROLE.CANNOT_REMOVE_OWN_ROLES_MANAGE");
    }
    if (losingManage && !(await this.someoneElseKeepsManage(role.id))) {
      throw new ForbiddenException("ROLE.LAST_ROLES_MANAGE");
    }
    return next;
  }

  /** Is there an active admin outside this role who still holds `roles_manage`? */
  private async someoneElseKeepsManage(excludingRoleId: string): Promise<boolean> {
    const roles = await this.roles.find();
    const keepers = roles
      .filter((r) => r.id !== excludingRoleId)
      .filter((r) => r.slug === ROOT_ROLE_SLUG || r.permissions.includes(ROLES_MANAGE))
      .map((r) => r.id);
    if (keepers.length === 0) return false;
    const active = await this.admins.count({
      where: { roleId: In(keepers), isSuspended: false },
    });
    return active > 0;
  }

  /** Keys must be in the catalog, and within what the caller themselves holds. */
  private validatePermissions(caller: AdminEntity, requested: string[]): string[] {
    const unique = [...new Set(requested)];
    const unknown = unique.filter((p) => !isPermissionKey(p));
    if (unknown.length > 0) throw new BadRequestException(`ROLE.UNKNOWN_PERMISSION:${unknown.join(",")}`);

    const held = permissionsOf(caller);
    const escalating = unique.filter((p) => !held.includes(p));
    if (escalating.length > 0) {
      throw new ForbiddenException(`ROLE.CANNOT_GRANT_UNHELD:${escalating.join(",")}`);
    }
    return unique;
  }

  /** The root role is the lock-out guard and is not editable at all. */
  private assertEditable(role: AdminRoleEntity): void {
    if (role.slug === ROOT_ROLE_SLUG) throw new ForbiddenException("ROLE.ROOT_IMMUTABLE");
  }

  private validateConfig(dto: CreateRoleDto | UpdateRoleDto): void {
    const wallets = dto.wallets ?? [];

    if (dto.maxCredit !== undefined && dto.maxCredit !== null && Number(dto.maxCredit) > MAX_CREDIT_AMOUNT) {
      throw new BadRequestException("ROLE.MAX_CREDIT_EXCEEDED");
    }

    for (const [wallet, config] of Object.entries(dto.configs ?? {})) {
      if (wallets.length > 0 && !wallets.includes(wallet)) {
        throw new BadRequestException(`ROLE.CONFIG_FOR_UNSELECTED_WALLET:${wallet}`);
      }
      for (const fee of ["buyFee", "sellFee"] as const) {
        const value = (config as any)?.[fee];
        if (value === undefined || value === null || value === "") continue;
        const decimals = String(value).split(".")[1]?.length ?? 0;
        if (decimals > FEE_DECIMALS) throw new BadRequestException(`ROLE.FEE_TOO_PRECISE:${wallet}.${fee}`);
      }
      if ((config as any)?.hasCredit === "yes") {
        const amount = (config as any)?.creditAmount;
        // Required, because a credit-enabled wallet with no ceiling is an
        // unbounded one.
        if (amount === undefined || amount === null || amount === "") {
          throw new BadRequestException(`ROLE.CREDIT_AMOUNT_REQUIRED:${wallet}`);
        }
        if (Number(amount) > MAX_CREDIT_AMOUNT) {
          throw new BadRequestException(`ROLE.CREDIT_AMOUNT_EXCEEDED:${wallet}`);
        }
      }
    }

    for (const pair of dto.pairs ?? []) {
      const parts = pair.split("-");
      if (parts.length !== 2) throw new BadRequestException(`ROLE.MALFORMED_PAIR:${pair}`);
      // Sorted form, so "fiat-crypto" and "crypto-fiat" cannot both exist.
      if ([...parts].sort().join("-") !== pair) throw new BadRequestException(`ROLE.PAIR_NOT_SORTED:${pair}`);
      const outside = parts.filter((p) => !wallets.includes(p));
      if (outside.length > 0) throw new BadRequestException(`ROLE.PAIR_OUTSIDE_WALLETS:${pair}`);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async require(id: string): Promise<AdminRoleEntity> {
    const role = await this.roles.findOne({ where: { id } });
    if (!role) throw new NotFoundException("ROLE.NOT_FOUND");
    return role;
  }

  private async memberCounts(roleIds: string[]): Promise<Map<string, number>> {
    if (roleIds.length === 0) return new Map();
    const rows = await this.admins
      .createQueryBuilder("a")
      .select("a.role_id", "roleId")
      .addSelect("COUNT(*)", "count")
      .where("a.role_id IN (:...roleIds)", { roleIds })
      .groupBy("a.role_id")
      .getRawMany<{ roleId: string; count: string }>();
    return new Map(rows.map((r) => [r.roleId, Number(r.count)]));
  }

  private async nextSlug(name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "role";
    // `withDeleted` matters: deletion here is a soft delete, but the unique
    // index on `slug` still holds the soft-deleted row. Looking only at live
    // rows would hand back a slug the database then rejects, so creating a
    // role, deleting it, and creating it again would 500.
    let slug = base;
    for (let i = 2; await this.roles.findOne({ where: { slug }, withDeleted: true }); i++) {
      slug = `${base}-${i}`;
    }
    return slug;
  }

  private toDto(role: AdminRoleEntity, memberCount: number, caller: AdminEntity): AdminRoleDto {
    const isRoot = role.slug === ROOT_ROLE_SLUG;
    const callerCanManage = permissionsOf(caller).includes(ROLES_MANAGE);

    const capabilities: RoleCapabilitiesDto = {
      canDelete: callerCanManage && !role.isFixed && memberCount === 0,
      canRename: callerCanManage && !role.isFixed,
      canEditPermissions: callerCanManage && !isRoot,
      canEditConfig: callerCanManage && !isRoot,
    };

    return {
      id: role.id,
      slug: role.slug,
      roleName: role.roleName,
      isFixed: role.isFixed,
      wallets: role.wallets ?? [],
      pairs: role.pairs ?? [],
      configs: role.configs ?? {},
      maxCredit: role.maxCredit ?? null,
      // The root role's set is definitional, not stored, so it is reported the
      // same way the guard computes it.
      permissions: isRoot ? [...PERMISSION_KEYS] : (role.permissions ?? []),
      memberCount,
      capabilities,
      createAt: role.createAt,
    };
  }
}
