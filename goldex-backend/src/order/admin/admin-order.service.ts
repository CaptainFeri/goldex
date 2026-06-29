import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { OrderEntity } from "../order.entity";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { TransactionEntity } from "../../wallet/entities/transaction.entity";
import { PricePairEntity } from "../../admin-pair/entity/price.pair.entity";
import { TransactionTypeEnum } from "../../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../../wallet/enum/transaction.status.enum";
import { AdminWalletLogEntity } from "../../admin-wallet/entity/admin-wallet-log.entity";
import { AdminUpdateOrderDto } from "./dto/admin-update-order.dto";
import { OrderStatusEnum } from "../enum/order.status.enum";
import { OrderSideEnum } from "../enum/order.side.enum";

@Injectable()
export class AdminOrderService {
  private readonly logger = new Logger(AdminOrderService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private readonly transactionRepository: Repository<TransactionEntity>,
    @InjectRepository(AdminWalletLogEntity)
    private readonly adminWalletLogRepository: Repository<AdminWalletLogEntity>,
    @InjectRepository(PricePairEntity)
    private readonly pricePairRepository: Repository<PricePairEntity>,
    private readonly dataSource: DataSource
  ) {}

  async getAllOrders(query: any): Promise<{ orders: OrderEntity[]; total: number }> {
    const { userId, pricePairId, side, orderType, status, search, limit = 10, offset = 0, startDate, endDate } = query;

    const queryBuilder = this.orderRepository
      .createQueryBuilder("order")
      .leftJoinAndSelect("order.user", "user")
      .leftJoinAndSelect("order.pricePair", "pricePair")
      .leftJoinAndSelect("order.transactions", "transactions");

    if (userId) {
      queryBuilder.andWhere("order.user_id = :userId", { userId });
    }

    if (pricePairId) {
      queryBuilder.andWhere("order.price_pair_id = :pricePairId", { pricePairId });
    }

    if (side) {
      queryBuilder.andWhere("order.side = :side", { side });
    }

    if (orderType) {
      queryBuilder.andWhere("order.order_type = :orderType", { orderType });
    }

    if (status) {
      queryBuilder.andWhere("order.status = :status", { status });
    }

    if (search) {
      queryBuilder.andWhere("(order.order_code ILIKE :search OR user.email ILIKE :search)", { search: `%${search}%` });
    }

    if (startDate) {
      queryBuilder.andWhere("order.created_at >= :startDate", { startDate });
    }

    if (endDate) {
      queryBuilder.andWhere("order.created_at <= :endDate", { endDate });
    }

    queryBuilder.orderBy("order.created_at", "DESC").skip(offset).take(limit);

    const [orders, total] = await queryBuilder.getManyAndCount();

    return { orders, total };
  }

  async adminUpdateOrder(orderId: string, adminId: string, dto: AdminUpdateOrderDto): Promise<OrderEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const order = await this.orderRepository.findOne({
        where: { id: orderId },
        relations: { user: true, pricePair: true },
      });

      if (!order) {
        throw new NotFoundException("Order not found");
      }

      if (dto.executedQuantity && dto.executedQuantity > 0) {
        await this.processAdminPassedOrder(queryRunner, order, dto, adminId);
      }

      if (dto.status) {
        order.status = dto.status;
        if (dto.status === OrderStatusEnum.COMPLETED) {
          order.completedAt = new Date();
        } else if (dto.status === OrderStatusEnum.CANCELLED) {
          order.cancelledAt = new Date();
        }
      }

      if (dto.quantity) {
        if (dto.quantity < order.executedQuantity) {
          throw new BadRequestException("Quantity cannot be less than executed quantity");
        }
        order.quantity = dto.quantity;
      }

      if (dto.price) {
        order.price = dto.price;
      }

      if (dto.commission) {
        order.commission = dto.commission;
      }

      if (dto.notes) {
        order.notes = dto.notes;
      }

      if (dto.adminNote) {
        order.metadata = {
          ...order.metadata,
          adminNote: dto.adminNote,
          adminId,
          updatedAt: new Date(),
        };
      }

      if (order.executedQuantity >= order.quantity) {
        order.status = OrderStatusEnum.COMPLETED;
        order.completedAt = new Date();
      }

      const savedOrder = await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();

      this.logger.log(`Order ${order.orderCode} updated by admin ${adminId}`);

      return savedOrder;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Failed to update order ${orderId} by admin ${adminId}`, (error as any).stack);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async processAdminPassedOrder(
    queryRunner: any,
    order: OrderEntity,
    dto: AdminUpdateOrderDto,
    adminId: string
  ): Promise<void> {
    const { executedQuantity, price, commission } = dto;

    const remainingQuantity = order.quantity - order.executedQuantity;
    if (executedQuantity > remainingQuantity) {
      throw new BadRequestException(
        `Executed quantity (${executedQuantity}) exceeds remaining quantity (${remainingQuantity})`
      );
    }

    const executionPrice = price || order.price || 0;
    const commissionAmount = commission || order.commission || 0;

    const pricePair = await this.pricePairRepository.findOne({
      where: { id: order.pricePairId },
      relations: { baseSymbol: true, quoteSymbol: true },
    });

    if (!pricePair) {
      throw new NotFoundException("Price pair not found");
    }

    const baseWallet = await this.getOrCreateWallet(queryRunner, order.userId, pricePair.baseSymbol.id);

    const quoteWallet = await this.getOrCreateWallet(queryRunner, order.userId, pricePair.quoteSymbol.id);

    if (order.side === OrderSideEnum.BUY) {
      await this.processBuyOrderExecution(
        queryRunner,
        order,
        executedQuantity,
        executionPrice,
        commissionAmount,
        baseWallet,
        quoteWallet,
        adminId,
        pricePair
      );
    } else {
      await this.processSellOrderExecution(
        queryRunner,
        order,
        executedQuantity,
        executionPrice,
        commissionAmount,
        baseWallet,
        quoteWallet,
        adminId,
        pricePair
      );
    }

    const newExecutedQuantity = order.executedQuantity + executedQuantity;
    const oldTotalValue = order.executedQuantity * order.averagePrice;
    const newTotalValue = executedQuantity * executionPrice;
    const totalValue = oldTotalValue + newTotalValue;

    order.executedQuantity = newExecutedQuantity;
    order.averagePrice = newExecutedQuantity > 0 ? totalValue / newExecutedQuantity : 0;
    order.totalValue = totalValue;

    if (order.executedQuantity >= order.quantity) {
      order.status = OrderStatusEnum.COMPLETED;
      order.completedAt = new Date();
    } else if (order.executedQuantity > 0) {
      order.status = OrderStatusEnum.PARTIALLY_COMPLETED;
    }
  }

  private async processBuyOrderExecution(
    queryRunner: any,
    order: OrderEntity,
    quantity: number,
    price: number,
    commission: number,
    baseWallet: WalletEntity,
    quoteWallet: WalletEntity,
    adminId: string,
    pricePair: PricePairEntity
  ): Promise<void> {
    const totalCost = quantity * price;
    const totalWithCommission = totalCost + commission;

    if (quoteWallet.freeBalance < totalWithCommission) {
      throw new BadRequestException(
        `Insufficient ${pricePair.quoteSymbol.slug} balance. Required: ${totalWithCommission}, Available: ${quoteWallet.freeBalance}`
      );
    }

    quoteWallet.freeBalance = Number((quoteWallet.freeBalance - totalWithCommission).toFixed(8));

    baseWallet.freeBalance = Number((baseWallet.freeBalance + quantity).toFixed(8));

    await queryRunner.manager.save(quoteWallet);
    await queryRunner.manager.save(baseWallet);

    const baseTransaction = this.transactionRepository.create({
      wallet: baseWallet,
      walletId: baseWallet.id,
      order: order,
      orderId: order.id,
      transactionId: `TXN-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
      transactionType: TransactionTypeEnum.BUY,
      status: TransactionStatusEnum.COMPLETED,
      amount: quantity,
      fee: 0,
      price: price,
      description: `Admin executed buy order ${order.orderCode}: Received ${quantity} ${pricePair.baseSymbol.slug}`,
      metadata: {
        orderCode: order.orderCode,
        executedBy: "admin",
        adminId,
        executionPrice: price,
      },
      completedAt: new Date(),
    });

    const quoteTransaction = this.transactionRepository.create({
      wallet: quoteWallet,
      walletId: quoteWallet.id,
      order: order,
      orderId: order.id,
      transactionId: `TXN-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
      transactionType: TransactionTypeEnum.ORDER,
      status: TransactionStatusEnum.COMPLETED,
      amount: -totalCost,
      fee: commission,
      price: price,
      description: `Admin executed buy order ${order.orderCode}: Spent ${totalCost} ${pricePair.quoteSymbol.slug} + ${commission} fee`,
      metadata: {
        orderCode: order.orderCode,
        executedBy: "admin",
        adminId,
        executionPrice: price,
        baseAmount: quantity,
        commission: commission,
      },
      completedAt: new Date(),
    });

    await queryRunner.manager.save(baseTransaction);
    await queryRunner.manager.save(quoteTransaction);

    await this.createAdminWalletLog(queryRunner, adminId, baseWallet.id, "ADMIN_PASSED_BUY_ORDER", {
      orderCode: order.orderCode,
      quantity,
      price,
      commission,
      transactionId: baseTransaction.transactionId,
    });

    await this.createAdminWalletLog(queryRunner, adminId, quoteWallet.id, "ADMIN_PASSED_BUY_ORDER", {
      orderCode: order.orderCode,
      totalCost,
      commission,
      transactionId: quoteTransaction.transactionId,
    });
  }

  private async processSellOrderExecution(
    queryRunner: any,
    order: OrderEntity,
    quantity: number,
    price: number,
    commission: number,
    baseWallet: WalletEntity,
    quoteWallet: WalletEntity,
    adminId: string,
    pricePair: PricePairEntity
  ): Promise<void> {
    const totalRevenue = quantity * price;
    const totalAfterCommission = totalRevenue - commission;

    if (baseWallet.freeBalance < quantity) {
      throw new BadRequestException(
        `Insufficient ${pricePair.baseSymbol.slug} balance. Required: ${quantity}, Available: ${baseWallet.freeBalance}`
      );
    }

    baseWallet.freeBalance = Number((baseWallet.freeBalance - quantity).toFixed(8));

    quoteWallet.freeBalance = Number((quoteWallet.freeBalance + totalAfterCommission).toFixed(8));

    await queryRunner.manager.save(baseWallet);
    await queryRunner.manager.save(quoteWallet);

    const baseTransaction = this.transactionRepository.create({
      wallet: baseWallet,
      walletId: baseWallet.id,
      order: order,
      orderId: order.id,
      transactionId: `TXN-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
      transactionType: TransactionTypeEnum.SELL,
      status: TransactionStatusEnum.COMPLETED,
      amount: -quantity,
      fee: 0,
      price: price,
      description: `Admin executed sell order ${order.orderCode}: Spent ${quantity} ${pricePair.baseSymbol.slug}`,
      metadata: {
        orderCode: order.orderCode,
        executedBy: "admin",
        adminId,
        executionPrice: price,
      },
      completedAt: new Date(),
    });

    const quoteTransaction = this.transactionRepository.create({
      wallet: quoteWallet,
      walletId: quoteWallet.id,
      order: order,
      orderId: order.id,
      transactionId: `TXN-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
      transactionType: TransactionTypeEnum.ORDER,
      status: TransactionStatusEnum.COMPLETED,
      amount: totalRevenue,
      fee: commission,
      price: price,
      description: `Admin executed sell order ${order.orderCode}: Received ${totalRevenue} ${pricePair.quoteSymbol.slug} - ${commission} fee`,
      metadata: {
        orderCode: order.orderCode,
        executedBy: "admin",
        adminId,
        executionPrice: price,
        baseAmount: quantity,
        commission: commission,
      },
      completedAt: new Date(),
    });

    await queryRunner.manager.save(baseTransaction);
    await queryRunner.manager.save(quoteTransaction);

    await this.createAdminWalletLog(queryRunner, adminId, baseWallet.id, "ADMIN_PASSED_SELL_ORDER", {
      orderCode: order.orderCode,
      quantity,
      price,
      transactionId: baseTransaction.transactionId,
    });

    await this.createAdminWalletLog(queryRunner, adminId, quoteWallet.id, "ADMIN_PASSED_SELL_ORDER", {
      orderCode: order.orderCode,
      totalRevenue,
      commission,
      transactionId: quoteTransaction.transactionId,
    });
  }

  private async getOrCreateWallet(queryRunner: any, userId: string, symbolId: string): Promise<WalletEntity> {
    let wallet = await queryRunner.manager.findOne(WalletEntity, {
      where: { userId, symbolId },
    });

    if (!wallet) {
      wallet = queryRunner.manager.create(WalletEntity, {
        userId,
        symbolId,
        symbol: { id: symbolId },
        user: { id: userId },
        freeBalance: 0,
        lockedBalance: 0,
        status: "ACTIVE",
      });
      wallet = await queryRunner.manager.save(wallet);
    }

    return wallet;
  }

  private async createAdminWalletLog(
    queryRunner: any,
    adminId: string,
    walletId: string,
    action: string,
    metadata: any
  ): Promise<void> {
    const log = this.adminWalletLogRepository.create({
      adminId,
      walletId,
      wallet: { id: walletId },
      action,
      metadata: {
        ...metadata,
        timestamp: new Date(),
      },
    });

    await queryRunner.manager.save(log);
  }

  async cancelOrderAsAdmin(orderId: string, adminId: string, reason: string): Promise<OrderEntity> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    if (order.status !== OrderStatusEnum.PENDING && order.status !== OrderStatusEnum.PARTIALLY_COMPLETED) {
      throw new BadRequestException(`Cannot cancel order with status: ${order.status}`);
    }

    order.status = OrderStatusEnum.CANCELLED;
    order.cancelledAt = new Date();
    order.metadata = {
      ...order.metadata,
      cancelledBy: "admin",
      adminId,
      reason,
      cancelledAt: new Date(),
    };

    this.logger.log(`Order ${order.orderCode} cancelled by admin ${adminId}. Reason: ${reason}`);

    return this.orderRepository.save(order);
  }
}
