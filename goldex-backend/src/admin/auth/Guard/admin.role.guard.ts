// roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";

@Injectable()
export class AdminRolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<AdminRole[]>("roles", context.getHandler());

    if (!requiredRoles) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const admin = request.user;

    if (!admin) {
      throw new ForbiddenException("No admin found");
    }

    // Check if admin is suspended
    if (admin.isSuspended) {
      throw new ForbiddenException("Your account is suspended");
    }

    const adminRoleWeight = RoleHierarchy[admin.role];
    const requiredRoleWeight = Math.max(...requiredRoles.map((role) => RoleHierarchy[role]));

    // Check if admin has sufficient permissions
    if (adminRoleWeight >= requiredRoleWeight) {
      return true;
    }

    throw new ForbiddenException("Insufficient permissions");
  }
}

// roles.decorator.ts
import { SetMetadata } from "@nestjs/common";
import { AdminRole, RoleHierarchy } from "../../../admin/role/admin.roles.enum";

export const Roles = (...roles: AdminRole[]) => SetMetadata("roles", roles);
