import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AdminNotificationGateway } from "../admin-notification.gateway";
import { UserEvents } from "../../shared/constants/events.constants";

/**
 * Bridges user-level events to the admin real-time feed.
 */
@Injectable()
export class AdminUserLevelListener {
  private readonly logger = new Logger(AdminUserLevelListener.name);

  constructor(private readonly adminGateway: AdminNotificationGateway) {}

  @OnEvent(UserEvents.LEVEL_CHANGE_BLOCKED)
  handleLevelChangeBlocked(payload: { userId: string; levelName: string; blocked: { symbol: string; balance: number }[] }) {
    const detail = (payload.blocked ?? []).map((b) => `${b.symbol} (${b.balance})`).join("، ");
    this.adminGateway.sendToAdmins({
      event: "user.level_change_blocked",
      title: "تغییر سطح مسدود شد",
      body: `تغییر سطح کاربر ${payload.userId} به «${payload.levelName}» مسدود شد. ابتدا موجودی کیف پول خارج از سطح را خالی کنید: ${detail}`,
      type: "warning",
      metadata: {
        userId: payload.userId,
        levelName: payload.levelName,
        blocked: payload.blocked,
      },
    });
  }
}