import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { In, IsNull, LessThan, Not, Repository } from "typeorm";
import { OrderEntity } from "./order.entity";
import { OrderStatusEnum } from "./enum/order.status.enum";
import { OrderTypeEnum } from "./enum/order.type.enum";
import { RabbitMQService } from "../rabbitmq/rabbitmq.service";
import { MessagePatterns } from "../rabbitmq/interfaces/rabbitmq.interfaces";

/** How long an order may sit pending before we go and ask about it. */
const STUCK_AFTER_MS = 3 * 60_000;
/** Asking about thousands at once would be a stampede, not a reconciliation. */
const BATCH = 50;

/**
 * Chases orders the provider answered about but we never heard.
 *
 * A MARKET order locks the customer's balance and is settled by exactly one
 * message from the pricing-engine. That message can be lost — the broker is
 * down for a moment, either service restarts mid-flight — and the engine's
 * tracking lives in memory, so a restart forgets the order entirely. Nothing
 * else would ever release the balance.
 *
 * So the backend stops relying on being told. It periodically asks about any
 * order still pending past the point where an answer should have arrived; the
 * engine replies from the deal it recorded, on the same channel the original
 * notification would have used. Asking again is harmless: settlement ignores
 * an order that already reached a terminal state.
 */
@Injectable()
export class StuckOrderReconciler {
  private readonly logger = new Logger(StuckOrderReconciler.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepo: Repository<OrderEntity>,
    private readonly rmq: RabbitMQService
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async reconcile(): Promise<void> {
    try {
      const stuck = await this.findStuck();
      if (stuck.length === 0) return;

      let asked = 0;
      for (const order of stuck) {
        const providerKey = order.metadata?.providerKey;
        if (!providerKey) {
          // Without the provider there is nobody to ask; say so once per pass
          // rather than leaving it looking handled.
          this.logger.warn(
            `Order ${order.orderCode} is stuck pending but records no provider; it needs an admin`
          );
          continue;
        }

        await this.rmq.publishCommand(
          MessagePatterns.PROVIDER_COMMAND_ORDER_STATUS,
          {
            providerKey,
            orderId: order.providerOrderId,
            clientOrderId: order.id,
          },
          providerKey
        );
        asked++;
      }

      if (asked > 0) {
        this.logger.log(`Asked the pricing-engine about ${asked} stuck order(s)`);
      }
    } catch (err) {
      this.logger.error(`Stuck-order reconciliation failed: ${(err as Error).message}`);
    }
  }

  /**
   * Orders that went to a provider, were acknowledged, and never resolved.
   *
   * A missing `providerOrderId` means the placement itself never came back, so
   * there is no provider-side deal to ask about — that is a different failure
   * and not this sweep's to fix.
   */
  private findStuck(): Promise<OrderEntity[]> {
    return this.orderRepo.find({
      where: {
        status: OrderStatusEnum.PENDING,
        orderType: In([OrderTypeEnum.MARKET, OrderTypeEnum.QUOTE]),
        providerOrderId: Not(IsNull()),
        createAt: LessThan(new Date(Date.now() - STUCK_AFTER_MS)),
      },
      order: { createAt: "ASC" },
      take: BATCH,
    });
  }
}
