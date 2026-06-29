import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, EntityManager } from "typeorm";
import Decimal from "decimal.js";
import { BalanceActionTypeEnum } from "./enum/balance-action-type.enum";
import { BalanceAdjustTypeEnum } from "./enum/balance-adjust-type.enum";
import { FreezeActionEnum } from "./enum/freeze-action.enum";
import { WalletStatusEnum } from "../wallet/enum/wallet-status.enum";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { AdminWalletLogEntity } from "./entity/admin-wallet-log.entity";
import { UpdateBalanceDto } from "./dtos/update-balance.dto";
import { TransactionTypeEnum } from "../wallet/enum/transaction.type.enum";
import { AdjustBalanceDto } from "./dtos/adjust-balance.dto";
import { FreezeWalletDto } from "./dtos/freeze-wallet.dto";
import { WalletActionDto } from "./dtos/wallet-action.dto";
import { TransactionStatusEnum } from "../wallet/enum/transaction.status.enum";

Decimal.set({
  precision: 20,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -7,
  toExpPos: 21,
});

@Injectable()
export class AdminWalletService {
  constructor(
    @InjectRepository(WalletEntity)
    private walletRepository: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(AdminWalletLogEntity)
    private adminLogRepository: Repository<AdminWalletLogEntity>,
    private dataSource: DataSource
  ) {}

  async updateBalance(adminId: string, updateBalanceDto: UpdateBalanceDto) {
    const { walletId, actionType, transactionType, amount, description, metadata } = updateBalanceDto;

    return await this.dataSource.transaction(async (manager) => {
      const wallet = await this.getWalletForUpdate(manager, walletId);

      if (wallet.status !== WalletStatusEnum.ACTIVE) {
        throw new BadRequestException(`Wallet is ${wallet.status.toLowerCase()}, cannot update balance`);
      }

      const decimalAmount = new Decimal(amount);
      const currentFreeBalance = new Decimal(wallet.freeBalance);
      const currentLockedBalance = new Decimal(wallet.lockedBalance);

      let newFreeBalance: Decimal;
      let newLockedBalance: Decimal;

      if (actionType === BalanceActionTypeEnum.CREDIT) {
        if (transactionType === TransactionTypeEnum.DEPOSIT) {
          newFreeBalance = currentFreeBalance.plus(decimalAmount);
          newLockedBalance = currentLockedBalance;
        } else {
          throw new BadRequestException(`Invalid transaction type for credit action`);
        }
      } else if (actionType === BalanceActionTypeEnum.DEBIT) {
        if (transactionType === TransactionTypeEnum.WITHDRAWAL) {
          const availableBalance = this.getAvailableBalanceDecimal(wallet);
          if (availableBalance.lessThan(decimalAmount)) {
            throw new BadRequestException(
              `Insufficient available balance. Available: ${availableBalance.toString()}, Requested: ${decimalAmount.toString()}`
            );
          }
          newFreeBalance = currentFreeBalance.minus(decimalAmount);
          newLockedBalance = currentLockedBalance;
        } else {
          throw new BadRequestException(`Invalid transaction type for debit action`);
        }
      } else {
        throw new BadRequestException(`Invalid action type`);
      }

      if (newFreeBalance.lessThan(0) || newLockedBalance.lessThan(0)) {
        throw new BadRequestException(`Operation would result in negative balance`);
      }

      wallet.freeBalance = newFreeBalance.toNumber();
      wallet.lockedBalance = newLockedBalance.toNumber();
      wallet.adminNote = description;
      await manager.save(wallet);

      const transaction = this.createTransactionRecord(
        wallet,
        actionType,
        transactionType,
        amount,
        description,
        metadata
      );
      await manager.save(transaction);

      const oldFreeBalance =
        actionType === BalanceActionTypeEnum.CREDIT
          ? newFreeBalance.minus(decimalAmount)
          : newFreeBalance.plus(decimalAmount);

      await this.logAdminAction(manager, adminId, walletId, "UPDATE_BALANCE", {
        actionType,
        transactionType,
        amount: decimalAmount.toString(),
        oldBalance: {
          free: oldFreeBalance.toNumber(),
          locked: wallet.lockedBalance,
        },
        newBalance: {
          free: wallet.freeBalance,
          locked: wallet.lockedBalance,
        },
        description,
        transactionId: transaction.id,
      });

      return {
        success: true,
        wallet,
        transaction,
        message: `Balance ${actionType.toLowerCase()}ed successfully`,
        details: {
          oldBalance: oldFreeBalance.toNumber(),
          newBalance: wallet.freeBalance,
          amount: decimalAmount.toString(),
        },
      };
    });
  }

  async adjustBalance(adminId: string, adjustBalanceDto: AdjustBalanceDto) {
    const { walletId, adjustType, amount, reason, metadata } = adjustBalanceDto;

    return await this.dataSource.transaction(async (manager) => {
      const wallet = await this.getWalletForUpdate(manager, walletId);

      if (wallet.status !== WalletStatusEnum.ACTIVE) {
        throw new BadRequestException(`Wallet is ${wallet.status.toLowerCase()}, cannot adjust balance`);
      }

      const decimalAmount = new Decimal(amount);
      const oldFreeBalance = new Decimal(wallet.freeBalance);
      const oldLockedBalance = new Decimal(wallet.lockedBalance);

      let newFreeBalance: Decimal = oldFreeBalance;
      let newLockedBalance: Decimal = oldLockedBalance;
      let adjustmentType: string;

      switch (adjustType) {
        case BalanceAdjustTypeEnum.INCREASE_FREE:
          newFreeBalance = oldFreeBalance.plus(decimalAmount);
          adjustmentType = "ADMIN_CREDIT";
          break;

        case BalanceAdjustTypeEnum.DECREASE_FREE:
          const availableBalance = this.getAvailableBalanceDecimal(wallet);
          if (availableBalance.lessThan(decimalAmount)) {
            throw new BadRequestException(
              `Insufficient available balance for decrease. Available: ${availableBalance.toString()}, Requested: ${decimalAmount.toString()}`
            );
          }
          newFreeBalance = oldFreeBalance.minus(decimalAmount);
          adjustmentType = "ADMIN_DEBIT";
          break;

        case BalanceAdjustTypeEnum.INCREASE_LOCKED:
          if (oldFreeBalance.lessThan(decimalAmount)) {
            throw new BadRequestException(
              `Insufficient free balance to lock. Free: ${oldFreeBalance.toString()}, Requested: ${decimalAmount.toString()}`
            );
          }
          newFreeBalance = oldFreeBalance.minus(decimalAmount);
          newLockedBalance = oldLockedBalance.plus(decimalAmount);
          adjustmentType = "ADMIN_LOCK";
          break;

        case BalanceAdjustTypeEnum.DECREASE_LOCKED:
          if (oldLockedBalance.lessThan(decimalAmount)) {
            throw new BadRequestException(
              `Insufficient locked balance to unlock. Locked: ${oldLockedBalance.toString()}, Requested: ${decimalAmount.toString()}`
            );
          }
          newFreeBalance = oldFreeBalance.plus(decimalAmount);
          newLockedBalance = oldLockedBalance.minus(decimalAmount);
          adjustmentType = "ADMIN_UNLOCK";
          break;

        default:
          throw new BadRequestException(`Invalid adjustment type`);
      }

      if (newFreeBalance.lessThan(0) || newLockedBalance.lessThan(0)) {
        throw new BadRequestException(`Operation would result in negative balance`);
      }

      wallet.freeBalance = newFreeBalance.toNumber();
      wallet.lockedBalance = newLockedBalance.toNumber();
      wallet.adminNote = reason;
      await manager.save(wallet);

      const transaction = this.createAdjustmentTransaction(
        wallet,
        adjustmentType,
        amount,
        reason,
        metadata,
        adjustType
      );
      await manager.save(transaction);

      await this.logAdminAction(manager, adminId, walletId, "ADJUST_BALANCE", {
        adjustType,
        amount: decimalAmount.toString(),
        oldBalance: {
          free: oldFreeBalance.toNumber(),
          locked: oldLockedBalance.toNumber(),
        },
        newBalance: {
          free: wallet.freeBalance,
          locked: wallet.lockedBalance,
        },
        reason,
        transactionId: transaction.id,
        adjustments: {
          freeChange: newFreeBalance.minus(oldFreeBalance).toString(),
          lockedChange: newLockedBalance.minus(oldLockedBalance).toString(),
        },
      });

      return {
        success: true,
        wallet,
        transaction,
        message: `Balance adjusted successfully`,
        details: {
          oldBalance: { free: oldFreeBalance.toNumber(), locked: oldLockedBalance.toNumber() },
          newBalance: { free: wallet.freeBalance, locked: wallet.lockedBalance },
          changes: {
            free: newFreeBalance.minus(oldFreeBalance).toNumber(),
            locked: newLockedBalance.minus(oldLockedBalance).toNumber(),
          },
        },
      };
    });
  }

  async freezeWallet(adminId: string, freezeWalletDto: FreezeWalletDto) {
    const { walletId, action, amount, reason } = freezeWalletDto;

    return await this.dataSource.transaction(async (manager) => {
      const wallet = await this.getWalletForUpdate(manager, walletId);
      const decimalAmount = amount ? new Decimal(amount) : null;

      switch (action) {
        case FreezeActionEnum.FREEZE_FREE:
          if (!decimalAmount) throw new BadRequestException(`Amount required for freezing free balance`);

          const availableBalance = this.getAvailableBalanceDecimal(wallet);
          if (availableBalance.lessThan(decimalAmount)) {
            throw new BadRequestException(
              `Insufficient available balance to freeze. Available: ${availableBalance.toString()}, Requested: ${decimalAmount.toString()}`
            );
          }

          const newFrozenFreeBalance = new Decimal(wallet.frozenFreeBalance).plus(decimalAmount);
          wallet.frozenFreeBalance = newFrozenFreeBalance.toNumber();
          break;

        case FreezeActionEnum.UNFREEZE_FREE:
          if (!decimalAmount) throw new BadRequestException(`Amount required for unfreezing free balance`);

          const currentFrozenFree = new Decimal(wallet.frozenFreeBalance);
          if (currentFrozenFree.lessThan(decimalAmount)) {
            throw new BadRequestException(
              `Insufficient frozen balance to unfreeze. Frozen: ${currentFrozenFree.toString()}, Requested: ${decimalAmount.toString()}`
            );
          }

          wallet.frozenFreeBalance = currentFrozenFree.minus(decimalAmount).toNumber();
          break;

        case FreezeActionEnum.FREEZE_LOCKED:
          if (!decimalAmount) throw new BadRequestException(`Amount required for freezing locked balance`);

          const currentLocked = new Decimal(wallet.lockedBalance);
          if (currentLocked.lessThan(decimalAmount)) {
            throw new BadRequestException(
              `Insufficient locked balance to freeze. Locked: ${currentLocked.toString()}, Requested: ${decimalAmount.toString()}`
            );
          }

          const newFrozenLockedBalance = new Decimal(wallet.frozenLockedBalance).plus(decimalAmount);
          wallet.frozenLockedBalance = newFrozenLockedBalance.toNumber();
          break;

        case FreezeActionEnum.UNFREEZE_LOCKED:
          if (!decimalAmount) throw new BadRequestException(`Amount required for unfreezing locked balance`);

          const currentFrozenLocked = new Decimal(wallet.frozenLockedBalance);
          if (currentFrozenLocked.lessThan(decimalAmount)) {
            throw new BadRequestException(
              `Insufficient frozen locked balance to unfreeze. Frozen Locked: ${currentFrozenLocked.toString()}, Requested: ${decimalAmount.toString()}`
            );
          }

          wallet.frozenLockedBalance = currentFrozenLocked.minus(decimalAmount).toNumber();
          break;

        case FreezeActionEnum.FREEZE_ENTIRE:
          wallet.status = WalletStatusEnum.FROZEN;
          wallet.frozenAt = new Date();
          break;

        case FreezeActionEnum.UNFREEZE_ENTIRE:
          wallet.status = WalletStatusEnum.ACTIVE;
          wallet.frozenAt = null;
          break;

        default:
          throw new BadRequestException(`Invalid freeze action`);
      }

      wallet.adminNote = reason;
      await manager.save(wallet);

      await this.logAdminAction(manager, adminId, walletId, "FREEZE_WALLET", {
        action,
        amount: decimalAmount ? decimalAmount.toString() : null,
        reason,
        currentStatus: wallet.status,
        frozenFreeBalance: wallet.frozenFreeBalance,
        frozenLockedBalance: wallet.frozenLockedBalance,
      });

      return {
        success: true,
        wallet,
        message: `Wallet ${action.toLowerCase().replace("_", " ")} successfully`,
        details: {
          action,
          amount: decimalAmount ? decimalAmount.toNumber() : null,
          frozenFreeBalance: wallet.frozenFreeBalance,
          frozenLockedBalance: wallet.frozenLockedBalance,
        },
      };
    });
  }

  async updateWalletStatus(adminId: string, walletActionDto: WalletActionDto) {
    const { walletId, status, note } = walletActionDto;

    return await this.dataSource.transaction(async (manager) => {
      const wallet = await this.getWalletForUpdate(manager, walletId);
      const oldStatus = wallet.status;

      if (status) {
        wallet.status = status;
        if (status === WalletStatusEnum.FROZEN) {
          wallet.frozenAt = new Date();
        } else if (wallet.status !== WalletStatusEnum.FROZEN && oldStatus === WalletStatusEnum.FROZEN) {
          wallet.frozenAt = null;
        }
      }

      if (note) {
        wallet.adminNote = note;
      }

      await manager.save(wallet);

      await this.logAdminAction(manager, adminId, walletId, "UPDATE_STATUS", {
        oldStatus,
        newStatus: wallet.status,
        note,
      });

      return {
        success: true,
        wallet,
        message: `Wallet status updated from ${oldStatus} to ${wallet.status}`,
      };
    });
  }

  async getWalletDetails(walletId: string) {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
      relations: { user: true, symbol: true, transactions: true },
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${walletId} not found`);
    }

    const recentTransactions = await this.transactionRepository.find({
      where: { walletId },
      order: { createAt: "DESC" },
      take: 20,
    });

    const adminLogs = await this.adminLogRepository.find({
      where: { walletId },
      order: { createAt: "DESC" },
      take: 50,
    });

    const totalBalance = this.getTotalBalanceDecimal(wallet);
    const availableBalance = this.getAvailableBalanceDecimal(wallet);
    const frozenFreeBalance = new Decimal(wallet.frozenFreeBalance);
    const frozenLockedBalance = new Decimal(wallet.frozenLockedBalance);

    return {
      wallet,
      stats: {
        totalBalance: totalBalance.toNumber(),
        availableBalance: availableBalance.toNumber(),
        frozenFreeBalance: frozenFreeBalance.toNumber(),
        frozenLockedBalance: frozenLockedBalance.toNumber(),

        preciseValues: {
          totalBalance: totalBalance.toString(),
          availableBalance: availableBalance.toString(),
          freeBalance: new Decimal(wallet.freeBalance).toString(),
          lockedBalance: new Decimal(wallet.lockedBalance).toString(),
        },
      },
      recentTransactions,
      adminLogs,
    };
  }

  async getAllWallets(filters?: any) {
    const queryBuilder = this.walletRepository
      .createQueryBuilder("wallet")
      .leftJoinAndSelect("wallet.user", "user")
      .leftJoinAndSelect("wallet.symbol", "symbol");

    if (filters?.userId) {
      queryBuilder.andWhere("wallet.userId = :userId", { userId: filters.userId });
    }

    if (filters?.symbolId) {
      queryBuilder.andWhere("wallet.symbolId = :symbolId", { symbolId: filters.symbolId });
    }

    if (filters?.status) {
      queryBuilder.andWhere("wallet.status = :status", { status: filters.status });
    }

    if (filters?.minBalance) {
      queryBuilder.andWhere("(wallet.freeBalance + wallet.lockedBalance) >= :minBalance", {
        minBalance: filters.minBalance,
      });
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const skip = (page - 1) * limit;

    const [wallets, total] = await queryBuilder
      .skip(skip)
      .take(limit)
      .orderBy("wallet.createAt", "DESC")
      .getManyAndCount();

    const enhancedWallets = wallets.map((wallet) => ({
      ...wallet,
      calculatedStats: {
        totalBalance: this.getTotalBalanceDecimal(wallet).toNumber(),
        availableBalance: this.getAvailableBalanceDecimal(wallet).toNumber(),
        totalBalancePrecise: this.getTotalBalanceDecimal(wallet).toString(),
        availableBalancePrecise: this.getAvailableBalanceDecimal(wallet).toString(),
      },
    }));

    return {
      data: enhancedWallets,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getWalletBalanceHistory(walletId: string, startDate?: Date, endDate?: Date) {
    const queryBuilder = this.adminLogRepository
      .createQueryBuilder("log")
      .where("log.walletId = :walletId", { walletId })
      .andWhere("log.action IN (:...actions)", {
        actions: ["UPDATE_BALANCE", "ADJUST_BALANCE"],
      });

    if (startDate) {
      queryBuilder.andWhere("log.createdAt >= :startDate", { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere("log.createdAt <= :endDate", { endDate });
    }

    const logs = await queryBuilder.orderBy("log.createdAt", "ASC").getMany();

    return logs.map((log) => ({
      timestamp: log.createAt,
      action: log.action,
      oldBalance: log.metadata?.oldBalance,
      newBalance: log.metadata?.newBalance,
      amount: log.metadata?.amount,
      reason: log.metadata?.reason || log.metadata?.description,
      adminId: log.adminId,

      preciseAmount: log.metadata?.amount?.toString(),
    }));
  }

  async batchUpdateBalances(
    adminId: string,
    updates: Array<{
      walletId: string;
      amount: number;
      actionType: BalanceActionTypeEnum;
      transactionType: TransactionTypeEnum;
      reason?: string;
    }>
  ) {
    return await this.dataSource.transaction(async (manager) => {
      const results = [];
      const errors = [];

      for (const update of updates) {
        try {
          const result = await this.updateBalance(adminId, {
            walletId: update.walletId,
            actionType: update.actionType,
            transactionType: update.transactionType,
            amount: update.amount,
            description: update.reason,
            metadata: { batch: true, timestamp: new Date() },
          });
          results.push(result);
        } catch (error) {
          errors.push({
            walletId: update.walletId,
            error: (error as any).message,
            amount: update.amount,
          });
        }
      }

      return {
        success: errors.length === 0,
        results,
        errors,
        summary: {
          total: updates.length,
          successful: results.length,
          failed: errors.length,
        },
      };
    });
  }

  async bulkFreezeWallets(
    adminId: string,
    freezeData: Array<{
      walletId: string;
      action: FreezeActionEnum;
      amount?: number;
      reason?: string;
    }>
  ) {
    return await this.dataSource.transaction(async (manager) => {
      const results = [];
      const errors = [];

      for (const data of freezeData) {
        try {
          const result = await this.freezeWallet(adminId, {
            walletId: data.walletId,
            action: data.action,
            amount: data.amount,
            reason: data.reason,
          });
          results.push(result);
        } catch (error) {
          errors.push({
            walletId: data.walletId,
            error: (error as any).message,
            action: data.action,
          });
        }
      }

      return {
        success: errors.length === 0,
        results,
        errors,
        summary: {
          total: freezeData.length,
          successful: results.length,
          failed: errors.length,
        },
      };
    });
  }

  async validateWalletBalance(walletId: string): Promise<{
    isValid: boolean;
    discrepancies?: {
      expectedTotal: string;
      actualTotal: string;
      difference: string;
    };
  }> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId },
      relations: { transactions: true },
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${walletId} not found`);
    }

    const transactions = await this.transactionRepository.find({
      where: { walletId, status: TransactionStatusEnum.COMPLETED },
    });

    let expectedBalance = new Decimal(0);

    for (const transaction of transactions) {
      const amount = new Decimal(transaction.amount);
      switch (transaction.transactionType) {
        case TransactionTypeEnum.DEPOSIT:
        case TransactionTypeEnum.ADMIN_ADJUSTMENT:
          expectedBalance = expectedBalance.plus(amount);
          break;
        case TransactionTypeEnum.WITHDRAWAL:
          expectedBalance = expectedBalance.minus(amount);
          break;
        default:
          if (transaction.metadata?.actionType === BalanceActionTypeEnum.CREDIT) {
            expectedBalance = expectedBalance.plus(amount);
          } else if (transaction.metadata?.actionType === BalanceActionTypeEnum.DEBIT) {
            expectedBalance = expectedBalance.minus(amount);
          }
      }
    }

    const actualBalance = new Decimal(wallet.freeBalance).plus(wallet.lockedBalance);
    const difference = actualBalance.minus(expectedBalance);

    return {
      isValid: difference.equals(0),
      discrepancies: !difference.equals(0)
        ? {
            expectedTotal: expectedBalance.toString(),
            actualTotal: actualBalance.toString(),
            difference: difference.toString(),
          }
        : undefined,
    };
  }

  private async getWalletForUpdate(manager: EntityManager, walletId: string): Promise<WalletEntity> {
    const wallet = await manager.findOne(WalletEntity, {
      where: { id: walletId },
      lock: { mode: "pessimistic_write" },
    });

    if (!wallet) {
      throw new NotFoundException(`Wallet with ID ${walletId} not found`);
    }

    return wallet;
  }

  private getTotalBalanceDecimal(wallet: WalletEntity): Decimal {
    return new Decimal(wallet.freeBalance).plus(wallet.lockedBalance);
  }

  private getAvailableBalanceDecimal(wallet: WalletEntity): Decimal {
    return new Decimal(wallet.freeBalance).minus(wallet.frozenFreeBalance);
  }

  private createTransactionRecord(
    wallet: WalletEntity,
    actionType: BalanceActionTypeEnum,
    transactionType: TransactionTypeEnum,
    amount: number,
    description: string,
    metadata: any
  ): TransactionEntity {
    const transaction = new TransactionEntity();
    transaction.walletId = wallet.id;
    transaction.wallet = wallet;
    transaction.transactionId = crypto.randomUUID();
    transaction.transactionType = transactionType;
    transaction.status = TransactionStatusEnum.COMPLETED;
    transaction.amount = amount;
    transaction.fee = 0;
    transaction.description = description || `Admin ${actionType.toLowerCase()} operation`;
    transaction.metadata = {
      ...metadata,
      adminOperation: true,
      actionType,
      amountPrecise: new Decimal(amount).toString(),
      walletBalanceAfter: {
        free: new Decimal(wallet.freeBalance).toString(),
        locked: new Decimal(wallet.lockedBalance).toString(),
      },
    };
    transaction.completedAt = new Date();
    return transaction;
  }

  private createAdjustmentTransaction(
    wallet: WalletEntity,
    adjustmentType: string,
    amount: number,
    reason: string,
    metadata: any,
    adjustType: BalanceAdjustTypeEnum
  ): TransactionEntity {
    const transaction = new TransactionEntity();
    transaction.walletId = wallet.id;
    transaction.wallet = wallet;
    transaction.transactionId = crypto.randomUUID();
    transaction.transactionType = TransactionTypeEnum.ADMIN_ADJUSTMENT;
    transaction.status = TransactionStatusEnum.COMPLETED;
    transaction.amount = amount;
    transaction.fee = 0;
    transaction.description = reason || `Admin balance adjustment: ${adjustType}`;
    transaction.metadata = {
      ...metadata,
      adminOperation: true,
      adjustmentType,
      adjustType,
      amountPrecise: new Decimal(amount).toString(),
      walletBalanceAfter: {
        free: new Decimal(wallet.freeBalance).toString(),
        locked: new Decimal(wallet.lockedBalance).toString(),
      },
    };
    transaction.completedAt = new Date();
    return transaction;
  }

  private async logAdminAction(
    manager: EntityManager,
    adminId: string,
    walletId: string,
    action: string,
    metadata: any
  ) {
    const log = new AdminWalletLogEntity();
    log.adminId = adminId;
    log.walletId = walletId;
    log.action = action;
    log.metadata = metadata;
    log.createAt = new Date();
    await manager.save(log);
  }
}
