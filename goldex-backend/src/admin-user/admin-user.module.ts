import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminUserService } from "./admin-user.service";
import { UserEntity } from "../user/entity/user.entity";
import { BaseinfoModule } from "../baseinfo/baseinfo.module";
import { AdminUserController } from "./admin-user.controller";
import { UserProfileEntity } from "../user/entity/user.profile.entity";
import { UserLoginHistoryEntity } from "../user/entity/user.login.history.entity";

@Module({
  imports: [BaseinfoModule, TypeOrmModule.forFeature([UserEntity, UserProfileEntity, UserLoginHistoryEntity])],
  providers: [AdminUserService],
  controllers: [AdminUserController],
})
export class AdminUserModule {}
