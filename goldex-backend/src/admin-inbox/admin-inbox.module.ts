import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { NotificationModule } from "../notification/notification.module";
import { AdminInboxController } from "./admin-inbox.controller";
import { AdminInboxService } from "./admin-inbox.service";
import { AdminInboxListener } from "./admin-inbox.listener";
import { AdminNotificationEntity } from "./entity/admin-notification.entity";
import { AdminNotificationReadEntity } from "./entity/admin-notification-read.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminNotificationEntity, AdminNotificationReadEntity]),
    // For the websocket gateway, so a published item is both stored and pushed.
    NotificationModule,
  ],
  controllers: [AdminInboxController],
  providers: [AdminInboxService, AdminInboxListener],
  exports: [AdminInboxService],
})
export class AdminInboxModule {}
