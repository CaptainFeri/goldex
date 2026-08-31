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
 * Backend publishes `symbol.sync` whenever a symbol is created/updated.
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
      this.logger.error(
        `Failed to sync symbol "${(msg.data as SymbolSyncMessage)?.slug ?? "?"}": ` +
          `${(err as Error)?.message ?? err}`,
      );
    }
  }
}
