import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminEntity } from "../admin/entity/admin.entity";
import { AdminRoleEntity } from "./entity/admin-role.entity";
import { AdminRoleController } from "./admin-role.controller";
import { AdminRoleService } from "./admin-role.service";
import { AdminPermissionsGuard } from "./guard/admin-permissions.guard";

@Module({
  imports: [TypeOrmModule.forFeature([AdminRoleEntity, AdminEntity])],
  controllers: [AdminRoleController],
  providers: [AdminRoleService, AdminPermissionsGuard],
  exports: [AdminRoleService, AdminPermissionsGuard],
})
export class AdminRoleModule {}
