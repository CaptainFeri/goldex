import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserTelegramEntity } from "./user-telegram.entity";
import { UserTelegramService } from "./user-telegram.service";
import { UserTelegramController } from "./user-telegram.controller";
import { UserEntity } from "../user/entity/user.entity";
import { UserLevelModule } from "../user-level/user-level.module";

@Module({
  imports: [TypeOrmModule.forFeature([UserTelegramEntity, UserEntity]), UserLevelModule],
  providers: [UserTelegramService],
  controllers: [UserTelegramController],
  exports: [UserTelegramService],
})
export class UserTelegramModule {}
