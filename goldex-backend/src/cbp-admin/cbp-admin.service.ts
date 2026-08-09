import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "crypto";
import { MessagePatterns, RabbitMQMessage } from "../rabbitmq/interfaces/rabbitmq.interfaces";
import { RabbitMQService } from "../rabbitmq/rabbitmq.service";

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * RabbitMQ RPC client for the goldex-cbp admin surface. goldex-cbp is
 * headless — every admin query (health checks, payment logs) is sent as a
 * `cbp.admin.request` message and awaited via a matching `cbp.admin.response`.
 */
@Injectable()
export class CbpAdminService implements OnModuleInit {
  private readonly logger = new Logger(CbpAdminService.name);
  private readonly pending = new Map<string, PendingRequest>();
  private readonly timeoutMs = 90_000;

  constructor(private readonly rmq: RabbitMQService) {}

  async onModuleInit(): Promise<void> {
    await this.rmq.subscribe(MessagePatterns.CBP_ADMIN_RESPONSE, (msg) => {
      this.handleReply(msg);
    });
    await this.rmq.startConsuming();
  }

  request<T = any>(action: string, params?: Record<string, any>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const requestId = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`CBP did not answer "${action}" within ${this.timeoutMs / 1000}s`));
      }, this.timeoutMs);

      this.pending.set(requestId, { resolve, reject, timer });

      const message: RabbitMQMessage = {
        pattern: MessagePatterns.CBP_ADMIN_REQUEST,
        data: { requestId, action, params },
        timestamp: new Date().toISOString(),
      };
      void this.rmq.publish(MessagePatterns.CBP_ADMIN_REQUEST, message);
    });
  }

  health() {
    return this.request("health");
  }

  gateways() {
    return this.request("gateways");
  }

  payments(params?: Record<string, any>) {
    return this.request("payments", params);
  }

  payment(id: string) {
    return this.request("payment", { id });
  }

  private handleReply(msg: RabbitMQMessage): void {
    const { requestId, ok, result, error } = msg.data ?? {};
    const entry = this.pending.get(requestId);
    if (!entry) {
      this.logger.warn(`No pending request for cbp reply ${requestId}`);
      return;
    }
    this.pending.delete(requestId);
    clearTimeout(entry.timer);
    if (ok) {
      entry.resolve(result);
    } else {
      entry.reject(new Error(error ?? "CBP admin request failed"));
    }
  }
}
