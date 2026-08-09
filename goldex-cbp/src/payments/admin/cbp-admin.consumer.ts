import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  CbpAdminRequestMessage,
  CbpAdminResponseMessage,
  CbpMessagePatterns,
  RabbitMQMessage,
} from "../../rabbitmq/rabbitmq.interfaces";
import { RabbitMQService } from "../../rabbitmq/rabbitmq.service";
import { GatewayRegistry } from "../gateways/gateway.registry";
import { CbpAdminService } from "./cbp-admin.service";

/**
 * RabbitMQ RPC handler for the admin surface. goldex-cbp stays headless —
 * goldex-backend sends `cbp.admin.request` and we answer on
 * `cbp.admin.response`, keeping health checks and payment logs off the
 * public HTTP layer.
 */
@Injectable()
export class CbpAdminConsumer implements OnModuleInit {
  private readonly logger = new Logger(CbpAdminConsumer.name);

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly admin: CbpAdminService,
    private readonly registry: GatewayRegistry,
  ) {}

  onModuleInit(): void {
    this.rabbit.subscribe(CbpMessagePatterns.CBP_ADMIN_REQUEST, (msg) =>
      void this.handle(msg),
    );
    void this.rabbit.startConsuming();
  }

  private async handle(msg: RabbitMQMessage): Promise<void> {
    const req = msg.data as CbpAdminRequestMessage;
    let ok = false;
    let result: any;
    let error: string | undefined;

    try {
      switch (req.action) {
        case "health":
          result = await this.registry.health();
          break;
        case "gateways":
          result = this.registry.metadata();
          break;
        case "payments":
          result = await this.admin.listPayments(req.params ?? {});
          break;
        case "payment":
          result = await this.admin.getPayment(req.params?.id);
          break;
        default:
          error = `Unknown cbp admin action: ${req.action}`;
      }
      ok = !error;
    } catch (err) {
      error = (err as Error)?.message ?? String(err);
      this.logger.error(
        `CBP admin request failed | action: ${req.action} | error: ${error}`,
      );
    }

    const reply: CbpAdminResponseMessage = { requestId: req.requestId, ok, result, error };
    const message: RabbitMQMessage = {
      pattern: CbpMessagePatterns.CBP_ADMIN_RESPONSE,
      data: reply,
      timestamp: new Date().toISOString(),
    };
    await this.rabbit.publish(CbpMessagePatterns.CBP_ADMIN_RESPONSE, message);
  }
}
