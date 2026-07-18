import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { AdminScheduleService } from "./admin-schedule.service";
import { AdminRole } from "../admin/role/admin.roles.enum";

@Injectable()
export class AdminWorkTimeGuard implements CanActivate {
  constructor(
    private readonly scheduleService: AdminScheduleService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const admin = request.admin;

    if (!admin) return true;

    if (admin.role !== AdminRole.FINANCE) return true;

    const withinHours = await this.scheduleService.isWithinWorkHours(admin.id, "Asia/Tehran");
    if (!withinHours) {
      throw new ForbiddenException(
        "Finance operations are only allowed during scheduled work hours (Saturday-Wednesday, 9AM-6PM IR time)",
      );
    }

    return true;
  }
}
