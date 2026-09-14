import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import {
  CbpMessagePatterns,
  RabbitMQMessage,
  SymbolSyncMessage,
} from "../../rabbitmq/rabbitmq.interfaces";
import { RabbitMQService } from "../../rabbitmq/rabbitmq.service";
import { SymbolTypeEnum } from "../../symbols/enum/symbol.type.enum";
import { SymbolsService } from "../../symbols/symbols.service";

/**
 * Keeps cbp symbols in sync with goldex-backend (admin panel edits).
 * Backend publishes `symbol.sync` whenever a symbol is created, updated,
 * activated or removed.
 *
 * A sync cbp refuses used to die in this log, where nobody was looking: the
 * admin saw their edit save, and the symbol quietly stayed as it was here
 * until a user hit a gateway that had never been configured. A refusal now
 * goes back over the bus so the operator who made the edit is told.
 */
@Injectable()
export class SymbolSyncConsumer implements OnModuleInit {
  private readonly logger = new Logger(SymbolSyncConsumer.name);

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly symbolsService: SymbolsService,
  ) {}

  onModuleInit(): void {
    this.rabbit.subscribe(
      CbpMessagePatterns.SYMBOL_SYNC,
      (msg) => void this.onSymbolSync(msg),
    );
  }

  private async onSymbolSync(msg: RabbitMQMessage): Promise<void> {
    try {
      const data = msg.data as SymbolSyncMessage;
      const symbol = await this.symbolsService.upsertFromSync({
        slug: data.slug,
        name: data.name,
        symbolType: data.symbolType as SymbolTypeEnum,
        hasPaymentGateway: data.hasPaymentGateway,
        isActive: data.isActive,
        depositTypes: data.depositTypes,
        withdrawTypes: data.withdrawTypes,
        depositGateways: data.depositGateways,
        withdrawGateways: data.withdrawGateways,
        defaultDepositGateway: data.defaultDepositGateway,
        defaultWithdrawGateway: data.defaultWithdrawGateway,
      });
      this.logger.log(`Symbol synced: ${symbol.slug} (${symbol.id})`);
    } catch (err) {
      // A validation failure here means cbp's copy of the symbol-type rules
      // disagrees with the backend's, which owns them — the message names the
      // list cbp will accept.
      const slug = (msg.data as SymbolSyncMessage)?.slug ?? "?";
      const reason = (err as Error)?.message ?? String(err);
      this.logger.error(`Failed to sync symbol "${slug}": ${reason}`);

      // Reported, never rethrown: the sync is not retryable — redelivering a
      // configuration cbp has already refused would fail identically forever.
      // What is needed is a person, so tell them.
      try {
        await this.rabbit.publish(CbpMessagePatterns.SYMBOL_SYNC_FAILED, {
          pattern: CbpMessagePatterns.SYMBOL_SYNC_FAILED,
          data: { slug, reason },
          timestamp: new Date().toISOString(),
        });
      } catch (publishErr) {
        this.logger.error(
          `Could not report the failed sync of "${slug}": ${(publishErr as Error)?.message}`,
        );
      }
    }
  }
}
