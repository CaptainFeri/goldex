import { Injectable, Logger } from "@nestjs/common";
import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from "typeorm";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { FinanceLogEntity } from "./entity/finance-log.entity";
import { mapTransactionType } from "./finance-action.map";

/**
 * Writes a finance-log row for every wallet transaction, as it is inserted.
 *
 * The requirement is that *no* money movement goes unlogged, and fourteen
 * services move money. Explicit log calls in each of them would cover today's
 * code and quietly miss whatever is added next, so the log hangs off the one
 * thing every balance change already does: write a `TransactionEntity`. Coverage
 * is then a property of the design rather than a convention to remember.
 *
 * It runs inside the caller's transaction (`event.manager`), so a log row and
 * the balance change it describes commit or roll back together — a logged
 * movement that never happened would be as wrong as an unlogged one.
 *
 * Services that know more than the transaction does — who the admin was, which
 * credit facility, what business decision drove it — still write their own
 * richer row. This is the floor, not a replacement for those.
 */
@Injectable()
@EventSubscriber()
export class FinanceLogSubscriber implements EntitySubscriberInterface<TransactionEntity> {
  private readonly logger = new Logger(FinanceLogSubscriber.name);

  constructor(dataSource: DataSource) {
    // Nest instantiates this as a provider; TypeORM only calls it once it is in
    // the DataSource's subscriber list.
    dataSource.subscribers.push(this);
  }

  listenTo() {
    return TransactionEntity;
  }

  async afterInsert(event: InsertEvent<TransactionEntity>): Promise<void> {
    const txn = event.entity;
    if (!txn) return;

    const metadata = (txn.metadata ?? {}) as Record<string, unknown>;
    const userId = await this.resolveUserId(event, txn, metadata);

    const log = event.manager.create(FinanceLogEntity, {
      // Present only where the mover recorded it; a user-driven movement has none.
      adminId: this.asUuid(metadata.adminId),
      userId,
      creditId: this.asUuid(metadata.creditId),
      walletId: txn.walletId ?? null,
      orderId: txn.orderId ?? null,
      actionType: mapTransactionType(txn.transactionType),
      description: txn.description ?? null,
      metadata: {
        source: "transaction",
        transactionId: txn.transactionId ?? null,
        transactionRowId: txn.id ?? null,
        transactionType: txn.transactionType ?? null,
        status: txn.status ?? null,
        amount: txn.amount ?? null,
        fee: txn.fee ?? null,
        // Carried through so a reader gets the mover's own context without
        // having to join back to the transaction.
        transactionMetadata: txn.metadata ?? null,
      },
      actionTime: new Date(),
    });
    await event.manager.save(FinanceLogEntity, log);
  }

  /**
   * Whose money moved. Most services put the user on the transaction's metadata;
   * when they have not, the wallet says so — and it is readable here because the
   * lookup runs in the same transaction as the insert.
   */
  private async resolveUserId(
    event: InsertEvent<TransactionEntity>,
    txn: TransactionEntity,
    metadata: Record<string, unknown>,
  ): Promise<string | null> {
    const fromMetadata = this.asUuid(metadata.userId);
    if (fromMetadata) return fromMetadata;
    if (!txn.walletId) return null;

    try {
      const wallet = await event.manager.findOne(WalletEntity, {
        where: { id: txn.walletId },
        select: { id: true, userId: true },
      });
      return wallet?.userId ?? null;
    } catch (error) {
      // A missing owner must not stop the money: the row is still written,
      // just without the user, and the wallet id identifies it.
      this.logger.warn(
        `Could not resolve the owner of wallet ${txn.walletId} for the finance log: ` +
          `${(error as Error).message}`,
      );
      return null;
    }
  }

  /** Metadata is free-form jsonb, so only accept what the uuid columns take. */
  private asUuid(value: unknown): string | null {
    return typeof value === "string" &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
      ? value
      : null;
  }
}
