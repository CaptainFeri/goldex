import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { DepositEntity } from "../deposit/deposit.entity";
import { DepositStatusEnum } from "../deposit/enum/deposit-status.enum";
import { WithdrawEntity } from "../withdraw/withdraw.entity";
import { WithdrawStatusEnum } from "../withdraw/enum/withdraw-status.enum";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { TransactionTypeEnum } from "../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../wallet/enum/transaction.status.enum";
import { WalletStatusEnum } from "../wallet/enum/wallet-status.enum";
import { WalletTypeEnum } from "../wallet/enum/wallet-type.enum";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DepositEvents, WithdrawEvents } from "../shared/constants/events.constants";
import { PaymentEventMessage } from "../rabbitmq/interfaces/rabbitmq.interfaces";

/**
 * Applies payment lifecycle events published by goldex-cbp to backend
 * deposit/withdraw records and wallets. All wallet mutations happen in a
 * transaction with a pessimistic lock; terminal-state guards keep the
 * flow idempotent against redelivered messages.
 */
@Injectable()
export class PaymentEventService {
  private readonly logger = new Logger(PaymentEventService.name);

  constructor(
    @InjectRepository(DepositEntity)
    private readonly depositRepo: Repository<DepositEntity>,
    @InjectRepository(WithdrawEntity)
    private readonly withdrawRepo: Repository<WithdrawEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepo: Repository<TransactionEntity>,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async handleEvent(event: PaymentEventMessage): Promise<void> {
    if (event.operation === "deposit") {
      await this.handleDeposit(event);
    } else {
      await this.handleWithdraw(event);
    }
  }

  private async handleDeposit(event: PaymentEventMessage): Promise<void> {
    let deposit: DepositEntity;
    try {
      deposit = await this.depositRepo.findOne({ where: { id: event.externalReference } });
    } catch (err) {
      this.logger.error(`Failed to load deposit ${event.externalReference}: ${(err as Error).message}`);
      return;
    }
    if (!deposit) {
      this.logger.warn(`Deposit event for unknown deposit ${event.externalReference}, skipping`);
      return;
    }

    if (this.isDepositTerminal(deposit.status)) return;

    switch (event.status) {
      case "processing":
        if (deposit.status === DepositStatusEnum.PENDING) {
          deposit.status = DepositStatusEnum.PROCESSING;
          this.mergePaymentMeta(deposit, event);
          await this.depositRepo.save(deposit);
        }
        break;
      case "succeeded":
        await this.completeGatewayDeposit(deposit, event);
        break;
      case "failed":
        deposit.status = DepositStatusEnum.FAILED;
        deposit.completedAt = new Date();
        this.mergePaymentMeta(deposit, event);
        await this.depositRepo.save(deposit);
        this.emitDepositEvent(DepositEvents.FAILED, deposit);
        break;
      case "rejected":
        deposit.status = DepositStatusEnum.CANCELLED;
        this.mergePaymentMeta(deposit, event);
        await this.depositRepo.save(deposit);
        this.emitDepositEvent(DepositEvents.CANCELLED, deposit);
        break;
      default:
        this.logger.warn(`Unknown deposit event status: ${event.status}`);
    }
  }

  private async handleWithdraw(event: PaymentEventMessage): Promise<void> {
    let withdraw: WithdrawEntity;
    try {
      withdraw = await this.withdrawRepo.findOne({ where: { id: event.externalReference } });
    } catch (err) {
      this.logger.error(`Failed to load withdraw ${event.externalReference}: ${(err as Error).message}`);
      return;
    }
    if (!withdraw) {
      this.logger.warn(`Withdraw event for unknown withdraw ${event.externalReference}, skipping`);
      return;
    }

    if (this.isWithdrawTerminal(withdraw.status)) return;

    switch (event.status) {
      case "processing":
        if (withdraw.status === WithdrawStatusEnum.PENDING) {
          withdraw.status = WithdrawStatusEnum.PROCESSING;
          this.mergePaymentMeta(withdraw, event);
          await this.withdrawRepo.save(withdraw);
        }
        break;
      case "succeeded":
        await this.completeGatewayWithdraw(withdraw, event);
        break;
      case "failed":
        withdraw.status = WithdrawStatusEnum.FAILED;
        withdraw.completedAt = new Date();
        this.mergePaymentMeta(withdraw, event);
        await this.withdrawRepo.save(withdraw);
        this.emitWithdrawEvent(WithdrawEvents.FAILED, withdraw);
        break;
      case "rejected":
        withdraw.status = WithdrawStatusEnum.CANCELLED;
        this.mergePaymentMeta(withdraw, event);
        await this.withdrawRepo.save(withdraw);
        this.emitWithdrawEvent(WithdrawEvents.CANCELLED, withdraw);
        break;
      default:
        this.logger.warn(`Unknown withdraw event status: ${event.status}`);
    }
  }

  private isDepositTerminal(status: DepositStatusEnum): boolean {
    return (
      status === DepositStatusEnum.COMPLETED ||
      status === DepositStatusEnum.FAILED ||
      status === DepositStatusEnum.CANCELLED
    );
  }

  private emitDepositEvent(event: string, deposit: DepositEntity): void {
    this.eventEmitter.emit(event, {
      userId: deposit.userId,
      depositId: deposit.id,
      amount: deposit.amount,
      type: deposit.type,
      symbolId: deposit.symbolId,
      status: deposit.status,
    });
  }

  private emitWithdrawEvent(event: string, withdraw: WithdrawEntity): void {
    this.eventEmitter.emit(event, {
      userId: withdraw.userId,
      withdrawId: withdraw.id,
      amount: withdraw.amount,
      type: withdraw.type,
      symbolId: withdraw.symbolId,
      status: withdraw.status,
    });
  }

  private isWithdrawTerminal(status: WithdrawStatusEnum): boolean {
    return (
      status === WithdrawStatusEnum.COMPLETED ||
      status === WithdrawStatusEnum.FAILED ||
      status === WithdrawStatusEnum.CANCELLED
    );
  }

  private mergePaymentMeta(entity: DepositEntity | WithdrawEntity, event: PaymentEventMessage): void {
    entity.metadata = {
      ...(entity.metadata ?? {}),
      payment: {
        paymentId: event.paymentId,
        identifier: event.identifier,
        gatewayCode: event.gatewayCode,
        ...(event.ipgReference ? { ipgReference: event.ipgReference } : {}),
        ...(event.gatewayUrl ? { gatewayUrl: event.gatewayUrl } : {}),
        ...(event.error ? { error: event.error } : {}),
      },
    };
  }

  private async completeGatewayDeposit(deposit: DepositEntity, event: PaymentEventMessage): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const locked = await queryRunner.manager.findOne(DepositEntity, {
        where: { id: deposit.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!locked) throw new NotFoundException("Deposit not found");
      if (this.isDepositTerminal(locked.status)) {
        await queryRunner.commitTransaction();
        return;
      }

      let wallet = await queryRunner.manager.findOne(WalletEntity, {
        where: { userId: locked.userId, symbolId: locked.symbolId, walletType: WalletTypeEnum.DEPOSIT },
        lock: { mode: "pessimistic_write" },
      });

      if (!wallet) {
        const symbol = await this.symbolRepo.findOne({ where: { id: locked.symbolId } });
        if (!symbol) throw new NotFoundException("Symbol not found");
        wallet = queryRunner.manager.create(WalletEntity, {
          userId: locked.userId,
          symbolId: locked.symbolId,
          walletType: WalletTypeEnum.DEPOSIT,
          freeBalance: 0,
          lockedBalance: 0,
          status: WalletStatusEnum.ACTIVE,
        });
        wallet = await queryRunner.manager.save(wallet);
      }

      wallet.freeBalance = Number((Number(wallet.freeBalance) + Number(locked.amount)).toFixed(8));
      await queryRunner.manager.save(wallet);

      const tx = this.transactionRepo.create({
        walletId: wallet.id,
        transactionId: `DEP-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
        transactionType: TransactionTypeEnum.DEPOSIT,
        status: TransactionStatusEnum.COMPLETED,
        amount: Number(locked.amount),
        description: `Gateway deposit completed: ${locked.type} (${event.identifier ?? event.paymentId})`,
        metadata: {
          depositId: locked.id,
          depositType: locked.type,
          gatewayCode: event.gatewayCode,
          paymentId: event.paymentId,
        },
        completedAt: new Date(),
      });
      await queryRunner.manager.save(tx);

      locked.status = DepositStatusEnum.COMPLETED;
      locked.completedAt = new Date();
      this.mergePaymentMeta(locked, event);
      await queryRunner.manager.save(locked);
      await queryRunner.commitTransaction();

      this.logger.log(`Gateway deposit ${locked.id} completed: ${locked.amount} credited to wallet ${wallet.id}`);
      this.emitDepositEvent(DepositEvents.COMPLETED, locked);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  private async completeGatewayWithdraw(withdraw: WithdrawEntity, event: PaymentEventMessage): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const locked = await queryRunner.manager.findOne(WithdrawEntity, {
        where: { id: withdraw.id },
        lock: { mode: "pessimistic_write" },
      });
      if (!locked) throw new NotFoundException("Withdraw not found");
      if (this.isWithdrawTerminal(locked.status)) {
        await queryRunner.commitTransaction();
        return;
      }

      let wallet = await queryRunner.manager.findOne(WalletEntity, {
        where: { userId: locked.userId, symbolId: locked.symbolId, walletType: WalletTypeEnum.DEPOSIT },
        lock: { mode: "pessimistic_write" },
      });

      if (!wallet) {
        throw new BadRequestException("User does not have a wallet for this symbol");
      }

      const amount = Number(locked.amount);
      if (Number(wallet.freeBalance) < amount) {
        throw new BadRequestException("Insufficient balance for gateway withdrawal");
      }

      wallet.freeBalance = Number((Number(wallet.freeBalance) - amount).toFixed(8));
      await queryRunner.manager.save(wallet);

      const tx = this.transactionRepo.create({
        walletId: wallet.id,
        transactionId: `WTH-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
        transactionType: TransactionTypeEnum.WITHDRAWAL,
        status: TransactionStatusEnum.COMPLETED,
        amount: -amount,
        description: `Gateway withdrawal completed: ${locked.type} (${event.identifier ?? event.paymentId})`,
        metadata: {
          withdrawId: locked.id,
          withdrawType: locked.type,
          gatewayCode: event.gatewayCode,
          paymentId: event.paymentId,
        },
        completedAt: new Date(),
      });
      await queryRunner.manager.save(tx);

      locked.status = WithdrawStatusEnum.COMPLETED;
      locked.completedAt = new Date();
      this.mergePaymentMeta(locked, event);
      await queryRunner.manager.save(locked);
      await queryRunner.commitTransaction();

      this.logger.log(`Gateway withdraw ${locked.id} completed: ${amount} deducted from wallet ${wallet.id}`);
      this.emitWithdrawEvent(WithdrawEvents.COMPLETED, locked);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
