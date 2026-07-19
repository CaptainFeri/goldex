import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserLevelEntity } from "./entity/user-level.entity";
import { UserEntity } from "../user/entity/user.entity";
import { UserLevelService } from "./user-level.service";
import { UserLevelController } from "./user-level.controller";
import { UserLevelUserController } from "./user-level-user.controller";
import { UserLevelGuard } from "./user-level.guard";

@Module({
  imports: [TypeOrmModule.forFeature([UserLevelEntity, UserEntity])],
  providers: [UserLevelService, UserLevelGuard],
  controllers: [UserLevelController, UserLevelUserController],
  exports: [UserLevelService, UserLevelGuard],
})
export class UserLevelModule {}
