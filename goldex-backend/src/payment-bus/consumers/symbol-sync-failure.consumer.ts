import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { RabbitMQService } from "../../rabbitmq/rabbitmq.service";
import { MessagePatterns, RabbitMQMessage } from "../../rabbitmq/interfaces/rabbitmq.interfaces";
import { SymbolEvents } from "../../shared/constants/events.constants";

/**
 * Hears cbp refusing a symbol sync, and tells someone.
 *
 * The sync is fire-and-forget: the admin panel reports the edit saved as soon
 * as the row is written, and whether cbp accepted it is decided afterwards on
 * another service. When it refused, the failure stayed in a cbp log — the
 * symbol kept its old configuration there, and the first sign of it was a user
 * meeting a payment gateway that had never been configured.
 *
 * Nothing here retries. A configuration cbp has already rejected will be
 * rejected identically next time; what the situation needs is a person, so
 * this raises the event that reaches the operator inbox.
 */
@Injectable()
export class SymbolSyncFailureConsumer implements OnModuleInit {
  private readonly logger = new Logger(SymbolSyncFailureConsumer.name);

  constructor(
    private readonly rmq: RabbitMQService,
    private readonly events: EventEmitter2,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.rmq.subscribe(MessagePatterns.SYMBOL_SYNC_FAILED, (msg: RabbitMQMessage) => {
      void this.handle(msg);
    });
    await this.rmq.startConsuming();
  }

  private async handle(msg: RabbitMQMessage): Promise<void> {
    const data = (msg?.data ?? {}) as { slug?: string; reason?: string };
    const slug = data.slug ?? "?";
    const reason = data.reason ?? "unknown reason";

    this.logger.error(`cbp refused the sync of symbol "${slug}": ${reason}`);
    this.events.emit(SymbolEvents.SYNC_FAILED, { slug, reason });
  }
}
