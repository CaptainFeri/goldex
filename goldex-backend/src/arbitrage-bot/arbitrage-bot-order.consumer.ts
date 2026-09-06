import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { RabbitMQService } from "../rabbitmq/rabbitmq.service";
import { MessagePatterns, RabbitMQMessage } from "../rabbitmq/interfaces/rabbitmq.interfaces";
import { ArbitrageBotEngineService } from "./arbitrage-bot-engine.service";

/** `bot:<tradeId>:<leg>` — the namespace bot legs use for their client ids. */
const BOT_LEG_PREFIX = "bot:";

interface ProviderOrderEvent {
  providerKey: string;
  orderId: string;
  clientOrderId?: string;
  status: number;
  statusStr?: string;
}

/**
 * Settles bot legs from the provider order stream.
 *
 * Bot legs share the engine's order channel with customer orders, so they are
 * told apart by their client order id: anything without the `bot:` prefix
 * belongs to the customer-order consumer and is ignored here.
 */
@Injectable()
export class ArbitrageBotOrderConsumer implements OnModuleInit {
  private readonly logger = new Logger(ArbitrageBotOrderConsumer.name);

  constructor(
    private readonly rmq: RabbitMQService,
    private readonly engine: ArbitrageBotEngineService
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rmq.subscribe(MessagePatterns.ORDER_STATUS_CHANGED, (msg: RabbitMQMessage) =>
      this.handle(msg)
    );
  }

  private async handle(msg: RabbitMQMessage): Promise<void> {
    try {
      const data = msg.data as ProviderOrderEvent;
      const parsed = this.parseLeg(data?.clientOrderId);
      if (!parsed) return;

      // The engine reports 1 for a confirmed deal and anything else for a
      // rejection, the same convention the customer-order consumer uses.
      await this.engine.applyLegResult(
        parsed.tradeId,
        parsed.leg,
        data.status === 1,
        data.statusStr
      );
    } catch (err) {
      this.logger.error(`bot order settlement failed: ${(err as Error).message}`);
    }
  }

  private parseLeg(clientOrderId?: string): { tradeId: string; leg: "buy" | "sell" } | null {
    if (!clientOrderId?.startsWith(BOT_LEG_PREFIX)) return null;
    const [, tradeId, leg] = clientOrderId.split(":");
    if (!tradeId || (leg !== "buy" && leg !== "sell")) return null;
    return { tradeId, leg };
  }
}
