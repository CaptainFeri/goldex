import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { NotificationService } from "../notification.service";
import { NotificationTypeEnum } from "../enum/notification-type.enum";
import { NotificationCategoryEnum } from "../enum/notification-category.enum";
import { NotificationChannelEnum } from "../enum/notification-channel.enum";
import { P2pEvents } from "../../shared/constants/events.constants";

const fmt = (n?: number) => Number(n ?? 0).toLocaleString("fa-IR");

const REASON_LABELS: Record<string, string> = {
  WITHDRAWER_REJECT: "رد توسط برداشت‌کننده",
  WITHDRAWER_NO_RESPONSE: "عدم پاسخ برداشت‌کننده",
  SETTLEMENT_TIMEOUT: "اتمام مهلت تسویه",
  RECEIPT_MISMATCH: "مغایرت رسید",
  DUPLICATE_PAYMENT: "پرداخت تکراری",
  ADMIN_ACCOUNT_UNAVAILABLE: "نبود حساب مدیر در دسترس",
};

/**
 * Turns p2p events into notifications for the two customers involved and, for
 * anything that needs a human, an alert on the admin feed.
 *
 * Every payload already carries the participants it concerns, so nothing here
 * queries the p2p tables — the notification module stays decoupled from them.
 */
@Injectable()
export class P2pEventListener {
  private readonly logger = new Logger(P2pEventListener.name);

  constructor(
    private readonly notificationService: NotificationService,
  ) {}

  /** Skips cleanly when a side is absent — an admin-funded match has no peer. */
  private async notify(
    userId: string | undefined,
    type: NotificationTypeEnum,
    title: string,
    body: string,
    metadata: Record<string, any>,
    channels?: NotificationChannelEnum[],
  ) {
    if (!userId) return;
    try {
      await this.notificationService.create({
        userId,
        type,
        category: NotificationCategoryEnum.SYSTEM,
        title,
        body,
        metadata,
        ...(channels ? { channels } : {}),
      });
    } catch (err) {
      // A failed notification must never fail the settlement that triggered it.
      this.logger.error(`p2p notification failed for user ${userId}: ${(err as Error).message}`);
    }
  }

  @OnEvent(P2pEvents.MATCHED)
  async onMatched(p: {
    matchId: string;
    amount: number;
    depositUserId: string;
    withdrawUserId?: string;
    source?: string;
    expiresAt?: Date;
  }) {
    await this.notify(
      p.depositUserId,
      NotificationTypeEnum.INFO,
      "حساب مقصد واریز آماده شد",
      `مبلغ ${fmt(p.amount)} ریال را به حساب نمایش‌داده‌شده واریز و سپس رسید را ثبت کنید. این رزرو مهلت محدودی دارد.`,
      { matchId: p.matchId, amount: p.amount, expiresAt: p.expiresAt },
    );

    await this.notify(
      p.withdrawUserId,
      NotificationTypeEnum.INFO,
      "یک واریزکننده برای برداشت شما پیدا شد",
      `بخشی از درخواست برداشت شما به مبلغ ${fmt(p.amount)} ریال رزرو شد. پس از واریز، رسید برای تأیید شما ارسال می‌شود.`,
      { matchId: p.matchId, amount: p.amount },
    );
  }

  /**
   * The one notification with a deadline attached to it: the withdrawer now
   * has a limited window before the case leaves their hands.
   */
  @OnEvent(P2pEvents.PROOF_SUBMITTED)
  async onProofSubmitted(p: {
    matchId: string;
    amount: number;
    depositUserId?: string;
    withdrawUserId?: string;
    responseDeadlineAt?: Date;
  }) {
    await this.notify(
      p.withdrawUserId,
      NotificationTypeEnum.WARNING,
      "رسید واریز ثبت شد — نیازمند تأیید شما",
      `واریزکننده مبلغ ${fmt(p.amount)} ریال را پرداخت کرده است. لطفاً حساب خود را بررسی و پرداخت را تأیید یا رد کنید؛ در صورت عدم پاسخ تا مهلت تعیین‌شده، پرونده به پشتیبانی ارجاع می‌شود.`,
      { matchId: p.matchId, amount: p.amount, responseDeadlineAt: p.responseDeadlineAt },
      [NotificationChannelEnum.IN_APP, NotificationChannelEnum.SMS],
    );

    await this.notify(
      p.depositUserId,
      NotificationTypeEnum.INFO,
      "رسید شما ثبت شد",
      "رسید شما ثبت و برای تأیید به برداشت‌کننده ارسال شد.",
      { matchId: p.matchId, amount: p.amount },
    );
  }

  @OnEvent(P2pEvents.CONFIRMED)
  async onConfirmed(p: {
    matchId: string;
    amount: number;
    depositUserId?: string;
    withdrawUserId?: string;
  }) {
    await this.notify(
      p.depositUserId,
      NotificationTypeEnum.SUCCESS,
      "واریز شما تأیید شد",
      `مبلغ ${fmt(p.amount)} ریال به کیف پول شما اضافه شد.`,
      { matchId: p.matchId, amount: p.amount },
      [NotificationChannelEnum.IN_APP, NotificationChannelEnum.EMAIL],
    );

    await this.notify(
      p.withdrawUserId,
      NotificationTypeEnum.SUCCESS,
      "یک بخش از برداشت شما تسویه شد",
      `مبلغ ${fmt(p.amount)} ریال از موجودی قفل‌شده شما کسر و این بخش تسویه شد.`,
      { matchId: p.matchId, amount: p.amount },
    );
  }

  @OnEvent(P2pEvents.WITHDRAW_COMPLETED)
  async onWithdrawCompleted(p: { withdrawId: string; userId: string; amount: number }) {
    await this.notify(
      p.userId,
      NotificationTypeEnum.SUCCESS,
      "درخواست برداشت تکمیل شد",
      `کل مبلغ ${fmt(p.amount)} ریال درخواست برداشت شما تسویه شد.`,
      { withdrawId: p.withdrawId, amount: p.amount },
      [NotificationChannelEnum.IN_APP, NotificationChannelEnum.EMAIL],
    );
  }

  @OnEvent(P2pEvents.REJECTED)
  async onRejected(p: {
    matchId: string;
    amount?: number;
    depositUserId?: string;
    withdrawUserId?: string;
    reason?: string;
  }) {
    await this.notify(
      p.depositUserId,
      NotificationTypeEnum.WARNING,
      "پرداخت شما رد شد و در حال بررسی است",
      "برداشت‌کننده دریافت این مبلغ را تأیید نکرد. پرونده به پشتیبانی ارجاع شد و نتیجه پس از بررسی به شما اعلام می‌شود.",
      { matchId: p.matchId, amount: p.amount, reason: p.reason },
      [NotificationChannelEnum.IN_APP, NotificationChannelEnum.SMS],
    );

    await this.notify(
      p.withdrawUserId,
      NotificationTypeEnum.INFO,
      "رد پرداخت ثبت شد",
      "رد شما ثبت و پرونده برای بررسی به پشتیبانی ارجاع شد.",
      { matchId: p.matchId },
    );
  }

  @OnEvent(P2pEvents.RESPONSE_TIMEOUT)
  async onResponseTimeout(p: {
    matchId: string;
    amount?: number;
    depositUserId?: string;
    withdrawUserId?: string;
  }) {
    await this.notify(
      p.withdrawUserId,
      NotificationTypeEnum.WARNING,
      "مهلت پاسخ شما به پایان رسید",
      "به دلیل عدم پاسخ در مهلت تعیین‌شده، این پرداخت برای تعیین‌تکلیف به پشتیبانی ارجاع شد.",
      { matchId: p.matchId, amount: p.amount },
      [NotificationChannelEnum.IN_APP, NotificationChannelEnum.SMS],
    );

    await this.notify(
      p.depositUserId,
      NotificationTypeEnum.WARNING,
      "پرداخت شما در حال بررسی است",
      "برداشت‌کننده در مهلت مقرر پاسخ نداد. پرونده به پشتیبانی ارجاع شد و مبلغ شما بدون بررسی از بین نمی‌رود.",
      { matchId: p.matchId, amount: p.amount },
    );
  }

  @OnEvent(P2pEvents.RESERVATION_EXPIRED)
  async onReservationExpired(p: { matchId: string; amount?: number; depositUserId?: string }) {
    await this.notify(
      p.depositUserId,
      NotificationTypeEnum.WARNING,
      "مهلت رزرو شما به پایان رسید",
      "چون رسیدی در مهلت رزرو ثبت نشد، حساب مقصد آزاد شد. در صورت تمایل دوباره درخواست واریز ثبت کنید.",
      { matchId: p.matchId, amount: p.amount },
    );
  }

  @OnEvent(P2pEvents.NO_MATCH)
  async onNoMatch(p: { depositIntentId: string }) {
    this.logger.debug(`p2p intent ${p.depositIntentId} is still queued for matching`);
  }

  /**
   * Escalations are the one case that always reaches an operator: the amount,
   * the age and the reason are what the queue is triaged on (spec §7.3).
   */
  @OnEvent(P2pEvents.ESCALATED)
  async onEscalated(p: {
    escalationId: string;
    matchId: string;
    reason: string;
    amount: number;
    depositUserId?: string;
    withdrawUserId?: string;
  }) {
    const reason = REASON_LABELS[p.reason] ?? p.reason;
    // The admin-facing announcement is raised by AdminInboxListener, which
    // stores it as an inbox item and broadcasts it from there.
    this.logger.warn(`p2p escalation ${p.escalationId} announced to admins (${p.reason})`);
  }

  @OnEvent(P2pEvents.ESCALATION_RESOLVED)
  async onEscalationResolved(p: {
    escalationId: string;
    matchId: string;
    resolution: string;
    amount?: number;
    depositUserId?: string;
    withdrawUserId?: string;
  }) {
    // CONFIRM_PAYMENT and SETTLE_FROM_ADMIN already notify through the
    // settlement events, so only the outcomes that end without one are
    // announced here.
    const silent = ["CONFIRM_PAYMENT", "REQUEST_MORE_EVIDENCE"];
    if (silent.includes(p.resolution)) {
      if (p.resolution === "REQUEST_MORE_EVIDENCE") {
        await this.notify(
          p.depositUserId,
          NotificationTypeEnum.WARNING,
          "مدارک تکمیلی لازم است",
          "پشتیبانی برای بررسی پرداخت شما به مدارک یا اطلاعات بیشتری نیاز دارد.",
          { matchId: p.matchId, escalationId: p.escalationId },
        );
      }
      return;
    }

    const bodies: Record<string, string> = {
      REJECT_PAYMENT: "پس از بررسی، این پرداخت پذیرفته نشد. برای پیگیری با پشتیبانی تماس بگیرید.",
      SETTLE_FROM_ADMIN: "درخواست برداشت شما از حساب مدیر تسویه شد.",
      REOPEN_MATCHING: "این پرداخت لغو و درخواست شما دوباره در صف تطبیق قرار گرفت.",
      CANCEL_REQUEST: "این درخواست پس از بررسی پشتیبانی بسته شد.",
    };
    const body = bodies[p.resolution] ?? "پرونده شما توسط پشتیبانی تعیین‌تکلیف شد.";

    await this.notify(
      p.depositUserId,
      NotificationTypeEnum.INFO,
      "نتیجه بررسی پشتیبانی",
      body,
      { matchId: p.matchId, escalationId: p.escalationId, resolution: p.resolution },
    );
    await this.notify(
      p.withdrawUserId,
      NotificationTypeEnum.INFO,
      "نتیجه بررسی پشتیبانی",
      body,
      { matchId: p.matchId, escalationId: p.escalationId, resolution: p.resolution },
    );
  }
}
