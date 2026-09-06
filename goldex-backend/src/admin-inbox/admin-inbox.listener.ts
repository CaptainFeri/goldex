import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AdminNotificationGateway } from "../notification/admin-notification.gateway";
import { DepositEvents, P2pEvents, WithdrawEvents } from "../shared/constants/events.constants";
import { AdminInboxService } from "./admin-inbox.service";
import { InboxCategory, InboxSeverity } from "./admin-inbox.enums";

const REASON_LABELS: Record<string, string> = {
  WITHDRAWER_REJECT: "رد توسط برداشت‌کننده",
  WITHDRAWER_NO_RESPONSE: "عدم پاسخ برداشت‌کننده",
  SETTLEMENT_TIMEOUT: "اتمام مهلت تسویه",
  RECEIPT_MISMATCH: "مغایرت رسید",
  DUPLICATE_PAYMENT: "پرداخت تکراری",
  ADMIN_ACCOUNT_UNAVAILABLE: "عدم دسترسی به حساب مدیر",
};

/**
 * Turns domain events into durable inbox items.
 *
 * These events used to be broadcast over the websocket only, which meant an
 * operator who was not connected at that moment never learned about them.
 * `publish` stores the item first and then pushes it, so the live feed becomes
 * an optimisation rather than the only delivery.
 *
 * Amounts stay in `metadata` in rial and are deliberately not written into the
 * body text: prose cannot be converted to toman for display, and a bare number
 * with no unit next to a toman-denominated panel is worse than no number.
 */
@Injectable()
export class AdminInboxListener {
  private readonly logger = new Logger(AdminInboxListener.name);

  constructor(
    private readonly inbox: AdminInboxService,
    private readonly gateway: AdminNotificationGateway,
  ) {}

  @OnEvent(DepositEvents.CREATED)
  async onDepositCreated(p: { depositId: string; amount: number; type?: string; userId?: string }) {
    await this.inbox.publish(
      {
        event: "deposit.created",
        category: InboxCategory.DEPOSIT,
        severity: InboxSeverity.INFO,
        title: "درخواست واریز جدید",
        body: "یک درخواست واریز ثبت شد و در انتظار بررسی است.",
        metadata: { depositId: p.depositId, amount: p.amount, type: p.type, userId: p.userId, link: "/deposits" },
        requiredPermission: "deposits",
      },
      this.gateway,
    );
  }

  @OnEvent(WithdrawEvents.CREATED)
  async onWithdrawCreated(p: { withdrawId: string; amount: number; type?: string; userId?: string }) {
    await this.inbox.publish(
      {
        event: "withdraw.created",
        category: InboxCategory.WITHDRAWAL,
        severity: InboxSeverity.INFO,
        title: "درخواست برداشت جدید",
        body: "یک درخواست برداشت ثبت شد و در انتظار بررسی است.",
        metadata: { withdrawId: p.withdrawId, amount: p.amount, type: p.type, userId: p.userId, link: "/withdraws" },
        requiredPermission: "withdrawals_view",
      },
      this.gateway,
    );
  }

  @OnEvent(P2pEvents.ESCALATED)
  async onP2pEscalated(p: { escalationId: string; matchId: string; reason: string; amount: number }) {
    await this.inbox.publish(
      {
        event: "p2p.escalated",
        category: InboxCategory.WITHDRAWAL,
        // An escalation is the one case that always needs an operator.
        severity: InboxSeverity.URGENT,
        title: "پرونده همتا به همتا نیازمند تعیین‌تکلیف",
        body: REASON_LABELS[p.reason] ?? p.reason,
        metadata: {
          escalationId: p.escalationId,
          matchId: p.matchId,
          reason: p.reason,
          amount: p.amount,
          link: `/p2p?escalation=${p.escalationId}`,
        },
        requiredPermission: "withdrawals_view",
      },
      this.gateway,
    );
    this.logger.warn(`p2p escalation ${p.escalationId} added to the admin inbox (${p.reason})`);
  }
}
