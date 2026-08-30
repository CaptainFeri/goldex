import { SetMetadata } from "@nestjs/common";
import { AdminRole } from "./admin.roles.enum";

export const ROLES_KEY = "AdminRoles";
export const AdminRoles = (...roles: AdminRole[]) => SetMetadata(ROLES_KEY, roles);
