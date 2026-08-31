import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, ILike, MoreThanOrEqual, LessThanOrEqual, And } from "typeorm";
import { OrderEntity } from "../order.entity";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { TransactionEntity } from "../../wallet/entities/transaction.entity";
import { PricePairEntity } from "../../admin-pair/entity/price.pair.entity";
import { TransactionTypeEnum } from "../../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../../wallet/enum/transaction.status.enum";
import { WalletTypeEnum } from "../../wallet/enum/wallet-type.enum";
import { AdminWalletLogEntity } from "../../admin-wallet/entity/admin-wallet-log.entity";
import { AdminUpdateOrderDto } from "./dto/admin-update-order.dto";
import { OrderStatusEnum } from "../enum/order.status.enum";
import { OrderSideEnum } from "../enum/order.side.enum";
import { QuoteRequestEntity, QuoteRequestStatus } from "../../quote-request/quote-request.entity";
import { WalletOrderService } from "../../wallet/services/wallet-order.service";
import { OrderBookService } from "../../order-book/order-book.service";
import { CreditOrderEntity } from "../../credit/entity/credit-order.entity";
import { CreditOrderStatusEnum } from "../../credit/enum/credit-order-status.enum";
import { OrderBookStatus } from "../../order-book/interfaces/order-book.types";
import {
  MarketPoolType,
  MarketStatus,
  PairPoolStatusEntity,
} from "../../market-status/entity/pair-pool-status.entity";

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
    @InjectRepository(QuoteRequestEntity)
    private readonly quoteRequestRepository: Repository<QuoteRequestEntity>,
    @InjectRepository(CreditOrderEntity)
    private readonly creditOrderRepo: Repository<CreditOrderEntity>,
    @InjectRepository(PairPoolStatusEntity)
    private readonly poolStatusRepo: Repository<PairPoolStatusEntity>,
    private readonly dataSource: DataSource,
    private readonly walletOrderService: WalletOrderService,
    private readonly orderBookService: OrderBookService,
  ) {}

  async getAllOrders(query: any): Promise<{ orders: any[]; total: number }> {
    const { userId, pricePairId, side, orderType, status, search, limit = 10, offset = 0, startDate, endDate } = query;
    const take = Number(limit) || 10;
    const skip = Number(offset) || 0;

    const orderWhere = this.buildOrderWhere({ userId, pricePairId, side, orderType, status, search, startDate, endDate });

    const [orderRows, ordersTotal] = await this.orderRepository.findAndCount({
      where: orderWhere,
      relations: { user: true, pricePair: { baseSymbol: true, quoteSymbol: true }, transactions: true },
      order: { createAt: "DESC" },
    });

    const skipQuotes = orderType && orderType !== "QUOTE";
    let quoteRows: QuoteRequestEntity[] = [];
    let quotesTotal = 0;

    if (!skipQuotes) {
      const quoteWhere = this.buildQuoteWhere({ userId, pricePairId, side, orderType, status, search, startDate, endDate });
      if (quoteWhere) {
        const result = await this.quoteRequestRepository.findAndCount({
          where: quoteWhere,
          relations: { user: true, pricePair: { baseSymbol: true, quoteSymbol: true } },
          order: { createAt: "DESC" },
        });
        quoteRows = result[0];
        quotesTotal = result[1];
      }
    }

    const mappedQuotes = quoteRows.map((qr) => this.mapQuoteToOrder(qr));

    const allItems = [...orderRows, ...mappedQuotes];
    allItems.sort((a, b) => new Date(b.createAt).getTime() - new Date(a.createAt).getTime());

    const total = ordersTotal + quotesTotal;
    const paged = allItems.slice(skip, skip + take);

    return { orders: paged, total };
  }

  private buildOrderWhere(filters: {
    userId?: string; pricePairId?: string; side?: string; orderType?: string;
    status?: string; search?: string; startDate?: string; endDate?: string;
  }): any {
    const base: any = {};
    if (filters.userId) base.userId = filters.userId;
    if (filters.pricePairId) base.pricePairId = filters.pricePairId;
    if (filters.side) base.side = filters.side;
    if (filters.orderType && filters.orderType !== "QUOTE") base.orderType = filters.orderType;
    if (filters.status) base.status = filters.status;
    if (filters.startDate && filters.endDate) {
      base.createAt = And(MoreThanOrEqual(new Date(filters.startDate)), LessThanOrEqual(new Date(filters.endDate)));
    } else if (filters.startDate) {
      base.createAt = MoreThanOrEqual(new Date(filters.startDate));
    } else if (filters.endDate) {
      base.createAt = LessThanOrEqual(new Date(filters.endDate));
    }

    if (filters.search) {
      return [
        { ...base, orderCode: ILike(`%${filters.search}%`) },
        { ...base, user: { email: ILike(`%${filters.search}%`) } },
      ];
    }
    return base;
  }

  private buildQuoteWhere(filters: {
    userId?: string; pricePairId?: string; side?: string; orderType?: string;
    status?: string; search?: string; startDate?: string; endDate?: string;
  }): any {
    const base: any = {};
    if (filters.userId) base.userId = filters.userId;
    if (filters.pricePairId) base.pricePairId = filters.pricePairId;
    if (filters.side) base.side = filters.side;
    if (filters.startDate && filters.endDate) {
      base.createAt = And(MoreThanOrEqual(new Date(filters.startDate)), LessThanOrEqual(new Date(filters.endDate)));
    } else if (filters.startDate) {
      base.createAt = MoreThanOrEqual(new Date(filters.startDate));
    } else if (filters.endDate) {
      base.createAt = LessThanOrEqual(new Date(filters.endDate));
    }

    if (filters.status) {
      const mapped = this.mapOrderStatusToQuoteStatus(filters.status);
      if (!mapped) return null;
      base.status = mapped;
    }

    if (filters.search) {
      return [
        { ...base, user: { email: ILike(`%${filters.search}%`) } },
      ];
    }
    return base;
  }

  private mapOrderStatusToQuoteStatus(orderStatus: string): QuoteRequestStatus | null {
    switch (orderStatus) {
      case "PENDING": return QuoteRequestStatus.PENDING;
      case "COMPLETED": return QuoteRequestStatus.MATCHED;
      case "CANCELLED": return QuoteRequestStatus.CANCELLED;
      default: return null;
    }
  }

  private mapQuoteToOrder(qr: QuoteRequestEntity): any {
    const statusMap: Record<string, string> = {
      [QuoteRequestStatus.PENDING]: "PENDING",
      [QuoteRequestStatus.MATCHED]: "COMPLETED",
      [QuoteRequestStatus.CANCELLED]: "CANCELLED",
    };
    return {
      id: qr.id,
      orderCode: qr.id,
      user: qr.user,
      userId: qr.userId,
      pricePair: qr.pricePair,
      pricePairId: qr.pricePairId,
      side: qr.side,
      orderType: "QUOTE",
      quantity: qr.quantity,
      price: qr.price,
      executedQuantity: qr.status === QuoteRequestStatus.MATCHED ? qr.quantity : 0,
      totalValue: null,
      commission: null,
      status: statusMap[qr.status] ?? qr.status,
      createAt: qr.createAt,
      updateAt: qr.updateAt,
      completedAt: qr.matchedAt ?? null,
      cancelledAt: null,
      notes: qr.notes ?? null,
      averagePrice: null,
      customerPrice: null,
      mesghalPrice: null,
      providerOrderId: null,
      metadata: null,
      transactions: [],
      version: null,
    };
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

      const statusExplicitlySet = !!dto.status;

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

      if (!statusExplicitlySet && order.executedQuantity >= order.quantity) {
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

    // Update CreditOrderEntity status when order completes
    if (order.status === OrderStatusEnum.COMPLETED) {
      const creditOrder = await this.creditOrderRepo.findOne({
        where: { orderId: order.id, status: CreditOrderStatusEnum.ACTIVE },
      });
      if (creditOrder) {
        creditOrder.status = CreditOrderStatusEnum.COMPLETED;
        await this.creditOrderRepo.save(creditOrder);
      }
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

    // LIMIT orders have funds in lockedBalance (frozen by freezeForOrder).
    // MARKET orders also freeze, but are normally settled immediately.
    // Always prefer lockedBalance for admin execution — if the order was
    // frozen, freeBalance won't have the funds.
    if (quoteWallet.lockedBalance < totalWithCommission) {
      throw new BadRequestException(
        `Insufficient locked ${pricePair.quoteSymbol.slug} balance. Required: ${totalWithCommission}, Locked: ${quoteWallet.lockedBalance}`
      );
    }

    quoteWallet.lockedBalance = Number((quoteWallet.lockedBalance - totalWithCommission).toFixed(8));

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

    if (baseWallet.lockedBalance < quantity) {
      throw new BadRequestException(
        `Insufficient locked ${pricePair.baseSymbol.slug} balance. Required: ${quantity}, Locked: ${baseWallet.lockedBalance}`
      );
    }

    baseWallet.lockedBalance = Number((baseWallet.lockedBalance - quantity).toFixed(8));

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
      where: { userId, symbolId, walletType: WalletTypeEnum.DEPOSIT },
      lock: { mode: "pessimistic_write" },
    });

    if (!wallet) {
      wallet = queryRunner.manager.create(WalletEntity, {
        userId,
        symbolId,
        walletType: WalletTypeEnum.DEPOSIT,
        symbol: { id: symbolId },
        user: { id: userId },
        freeBalance: 0,
        lockedBalance: 0,
        status: "ACTIVE",
      });
      wallet = await queryRunner.manager.save(wallet);
    }

    wallet.freeBalance = Number(wallet.freeBalance) || 0;
    wallet.lockedBalance = Number(wallet.lockedBalance) || 0;

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
      relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    if (order.status !== OrderStatusEnum.PENDING && order.status !== OrderStatusEnum.PARTIALLY_COMPLETED) {
      throw new BadRequestException(`Cannot cancel order with status: ${order.status}`);
    }

    // Remove from customer order book (LIMIT orders only — no-op otherwise)
    this.orderBookService.cancelCustomerOrder(order.pricePairId, order.id);

    // Attach admin metadata BEFORE rejectOrder saves the order, so the
    // version column increment in rejectOrder's save covers both changes
    // and we avoid an OptimisticLockException from a second save.
    order.metadata = {
      ...(order.metadata || {}),
      cancelledBy: "admin",
      adminId,
      reason,
      cancelledAt: new Date(),
    };

    // Unlock frozen funds and mark as cancelled (handles status + cancelledAt)
    await this.walletOrderService.rejectOrder(order, order.pricePair, OrderStatusEnum.CANCELLED);

    this.logger.log(`Order ${order.orderCode} cancelled by admin ${adminId}. Reason: ${reason}`);

    return this.getOrderById(orderId);
  }

  private async getOrderById(orderId: string): Promise<OrderEntity> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: { user: true, pricePair: { baseSymbol: true, quoteSymbol: true } },
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  /**
   * Shared Limit Market book state for every pair, joined with that pair's
   * LIMIT pool status. Lets an admin answer "which books are live, which are
   * empty, and which are closed" without opening each pair in turn.
   */
  async getOrderBookOverview(): Promise<{
    pairs: (OrderBookStatus & {
      limitPoolStatus: MarketStatus | null;
      limitPoolOverridden: boolean;
    })[];
    summary: {
      totalPairs: number;
      validPairs: number;
      withBook: number;
      openPools: number;
      withRestingOrders: number;
      totalRestingOrders: number;
      /** Valid pairs whose pool is open but whose book has nothing in it. */
      emptyWhileOpen: number;
      /** In-memory book and database disagree — the restore missed orders. */
      outOfSync: number;
      crossed: number;
      /** Valid pairs with no in-memory book at all; a LIMIT order would fail. */
      missingBook: number;
    };
  }> {
    const [statuses, poolRows] = await Promise.all([
      this.orderBookService.getAllStatuses(),
      this.poolStatusRepo.find({ where: { poolType: MarketPoolType.LIMIT } }),
    ]);

    const poolByPair = new Map(poolRows.map((row) => [row.pairId, row]));

    const pairs = statuses.map((status) => {
      const pool = poolByPair.get(status.pairId);
      return {
        ...status,
        limitPoolStatus: pool?.effectiveStatus ?? null,
        limitPoolOverridden: !!pool?.adminOverride,
      };
    });

    const isOpen = (p: (typeof pairs)[number]) => p.limitPoolStatus !== MarketStatus.CLOSED;

    return {
      pairs,
      summary: {
        totalPairs: pairs.length,
        validPairs: pairs.filter((p) => p.isValid).length,
        withBook: pairs.filter((p) => p.hasBook).length,
        openPools: pairs.filter(isOpen).length,
        withRestingOrders: pairs.filter((p) => p.restingOrders > 0).length,
        totalRestingOrders: pairs.reduce((sum, p) => sum + p.restingOrders, 0),
        emptyWhileOpen: pairs.filter((p) => p.isValid && isOpen(p) && p.restingOrders === 0).length,
        outOfSync: pairs.filter((p) => !p.inSync).length,
        crossed: pairs.filter((p) => p.crossed).length,
        missingBook: pairs.filter((p) => p.isValid && !p.hasBook).length,
      },
    };
  }
}
