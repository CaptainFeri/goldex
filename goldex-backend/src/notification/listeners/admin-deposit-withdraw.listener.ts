import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { AdminNotificationGateway } from "../admin-notification.gateway";
import { DepositEvents, WithdrawEvents } from "../../shared/constants/events.constants";

/**
 * Bridges deposit/withdraw events to the admin real-time feed so operators
 * are alerted the moment a new request (manual or portal/gateway) is created.
 */
@Injectable()
export class AdminDepositWithdrawListener {
  private readonly logger = new Logger(AdminDepositWithdrawListener.name);

  constructor(private readonly adminGateway: AdminNotificationGateway) {}

  @OnEvent(DepositEvents.CREATED)
  handleDepositCreated(payload: { depositId: string; amount: number; type?: string; userId?: string }) {
    this.adminGateway.sendToAdmins({
      event: "deposit.created",
      title: "درخواست واریز جدید",
      body: `درخواست واریز به مبلغ ${payload.amount} ثبت شد و در انتظار بررسی است`,
      type: "info",
      metadata: { depositId: payload.depositId, amount: payload.amount, type: payload.type },
    });
  }

  @OnEvent(WithdrawEvents.CREATED)
  handleWithdrawCreated(payload: { withdrawId: string; amount: number; type?: string; userId?: string }) {
    this.adminGateway.sendToAdmins({
      event: "withdraw.created",
      title: "درخواست برداشت جدید",
      body: `درخواست برداشت به مبلغ ${payload.amount} ثبت شد و در انتظار بررسی است`,
      type: "info",
      metadata: { withdrawId: payload.withdrawId, amount: payload.amount, type: payload.type },
    });
  }
}
