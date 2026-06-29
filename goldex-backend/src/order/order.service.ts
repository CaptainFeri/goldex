import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { OrderEntity } from "./order.entity";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { OrderQueryDto } from "./dto/order-query.dto";
import { UserEntity } from "../user/entity/user.entity";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { OrderTypeEnum } from "./enum/order.type.enum";
import { OrderStatusEnum } from "./enum/order.status.enum";
import { OrderSideEnum } from "./enum/order.side.enum";
import { GainTypeEnum } from "../admin-symbol/enum/gain.type.enum";
import { MESQAL_TO_GRAM } from "../common/constants";
import { RabbitMQService } from "../rabbitmq/rabbitmq.service";
import { MessagePatterns } from "../rabbitmq/interfaces/rabbitmq.interfaces";
import { ProviderPairMappingService } from "../provider-pair-mapping/provider-pair-mapping.service";
import { WalletOrderService } from "../wallet/services/wallet-order.service";

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(PricePairEntity)
    private readonly pricePairRepository: Repository<PricePairEntity>,
    private readonly dataSource: DataSource,
    private readonly rmq: RabbitMQService,
    private readonly mappingService: ProviderPairMappingService,
    private readonly walletOrderService: WalletOrderService,
  ) {}

  async createOrder(userId: string, dto: CreateOrderDto): Promise<OrderEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const user = await this.userRepository.findOne({
        where: { id: userId },
      });

      if (!user) {
        throw new NotFoundException("User not found");
      }

      const pricePair = await this.pricePairRepository.findOne({
        where: { id: dto.pricePairId },
        relations: { baseSymbol: true, quoteSymbol: true },
      });

      if (!pricePair) {
        throw new NotFoundException("Price pair not found");
      }

      if (!pricePair.isValid) {
        throw new BadRequestException("Price pair is not active");
      }

      if (dto.orderType === OrderTypeEnum.LIMIT && !dto.price) {
        throw new BadRequestException("Price is required for limit orders");
      }

      const orderCode = this.generateOrderCode(dto.side, dto.orderType);

      const providerKey = dto.side === OrderSideEnum.BUY
        ? pricePair.bestBuyProvider
        : pricePair.bestSellProvider;

      let providerItemId: number | undefined;
      if (providerKey) {
        const pairMappings = await this.mappingService.findByPair(dto.pricePairId);
        const match = pairMappings.find((m) => m.providerKey === providerKey);
        providerItemId = match?.providerItemId;
      }

      // Without a provider + item mapping the order can never be dispatched or
      // resolved (it would sit PENDING forever). Fail fast with a clear message
      // instead of creating a dead order.
      if (!providerKey || !providerItemId) {
        throw new BadRequestException(
          "No liquidity provider is currently available for this pair. Please try again shortly."
        );
      }

      // Prices: pair prices are per MESGHAL, but the customer trades in GRAMS.
      // The order is PLACED with the provider at the PURE price (no markup) and
      // settled per GRAM at that price. We also compute the DISPLAY price shown
      // to the customer (pure + commission + gain) so the deal record carries
      // both. Pair prices are per MESGHAL.
      const isBuy = dto.side === OrderSideEnum.BUY;
      const buyComm = Number(pricePair.buyCommission) || 0;
      const sellComm = Number(pricePair.sellCommission) || 0;
      const baseGain = Number(pricePair.baseSymbol?.gain) || 0;
      const bestBuy = Number(pricePair.bestBuyPrice) || 0;
      const bestSell = Number(pricePair.bestSellPrice) || 0;
      const realMesghal = isBuy ? bestBuy : bestSell;
      const realGramPrice = realMesghal / MESQAL_TO_GRAM;
      // For LIMIT orders the user supplies their own (gram) price.
      const gramPrice = dto.price || realGramPrice;
      // Mesghal price for the provider (convert the per-gram price back).
      const providerMesghalPrice = gramPrice * MESQAL_TO_GRAM;

      // Display (customer-shown) price = pure ± commission ± gain.
      const gainAdj =
        pricePair.baseSymbol?.gainType === GainTypeEnum.PERCENT ? (realMesghal * baseGain) / 100 : baseGain;
      const displayMesghal = isBuy
        ? Math.max(0, bestBuy * (1 + buyComm / 100) + gainAdj)
        : Math.max(0, bestSell * (1 - sellComm / 100) - gainAdj);
      const displayGram = displayMesghal / MESQAL_TO_GRAM;

      const order = this.orderRepository.create({
        user: { id: userId },
        userId,
        pricePair: { id: dto.pricePairId },
        pricePairId: dto.pricePairId,
        orderCode,
        side: dto.side,
        orderType: dto.orderType,
        status: OrderStatusEnum.PENDING,
        quantity: dto.quantity, // grams
        executedQuantity: 0,
        price: displayGram, // customer-shown GRAM price (= customerGramPrice) the user trades at
        customerPrice: displayGram, // customer-shown GRAM price (charged on a BUY)
        mesghalPrice: providerMesghalPrice, // PURE provider price per mesghal (used to settle)
        averagePrice: 0,
        totalValue: 0,
        commission: dto.commission || 0,
        notes: dto.notes,
        metadata: {
          ...dto.metadata,
          providerKey,
          providerItemId,
        },
      });

      const savedOrder = await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();

      this.logger.log(`Order created: ${orderCode} for user ${userId}`);

      // Reserve the balance and dispatch to the provider. This runs after the
      // order transaction is committed, so on failure (e.g. insufficient funds)
      // we reject the order and surface the error instead of leaving it PENDING.
      try {
        await this.walletOrderService.freezeForOrder(savedOrder, pricePair);

        const dealType = savedOrder.side === OrderSideEnum.BUY ? 0 : 1;

        // On a BUY we spend the user's DISPLAY-priced IRR at the provider's pure
        // price, so we buy more gold than the user ordered; the surplus is our
        // XAU profit. On a SELL we hand over exactly the user's gold.
        const providerGold =
          savedOrder.side === OrderSideEnum.BUY && gramPrice > 0
            ? Number(((Number(savedOrder.quantity) * displayGram) / gramPrice).toFixed(8))
            : Number(savedOrder.quantity);

        // The provider deals in MESGHAL; we also record the gram volume + gram
        // price on the deal so it's clear what the customer traded.
        this.rmq.publish(MessagePatterns.ORDER_PLACE_REQUEST, {
          pattern: MessagePatterns.ORDER_PLACE_REQUEST,
          data: {
            providerKey,
            itemId: providerItemId,
            dealType,
            count: providerGold,
            price: providerMesghalPrice || undefined, // pure mesghal price for the provider
            gramVolume: providerGold, // gold actually bought from the provider
            gramPrice, // pure per-gram price
            customerPrice: displayMesghal, // customer-shown price per mesghal (with commission + gain)
            customerGramPrice: displayGram, // customer-shown price per gram
            clientOrderId: savedOrder.id,
          },
          timestamp: new Date().toISOString(),
          providerKey,
        });
      } catch (err) {
        savedOrder.status = OrderStatusEnum.REJECTED;
        await this.orderRepository.save(savedOrder);
        this.logger.error(`Failed to process order ${orderCode}: ${(err as Error).message}`);
        throw err instanceof BadRequestException
          ? err
          : new BadRequestException((err as Error).message || "Could not place order");
      }

      return savedOrder;
    } catch (error) {
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getUserOrders(userId: string, query: OrderQueryDto): Promise<{ orders: OrderEntity[]; total: number }> {
    const { pricePairId, side, orderType, status, limit = 10, offset = 0 } = query;

    const queryBuilder = this.orderRepository
      .createQueryBuilder("order")
      .leftJoinAndSelect("order.pricePair", "pricePair")
      .leftJoinAndSelect("order.transactions", "transactions")
      .where("order.user_id = :userId", { userId });

    if (pricePairId) {
      queryBuilder.andWhere("order.price_pair_id = :pricePairId", {
        pricePairId,
      });
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

    queryBuilder.orderBy("order.created_at", "DESC").skip(offset).take(limit);

    const [orders, total] = await queryBuilder.getManyAndCount();

    return { orders, total };
  }

  async getOrderById(orderId: string, userId?: string): Promise<OrderEntity> {
    const where: any = { id: orderId };
    if (userId) {
      where.userId = userId;
    }

    const order = await this.orderRepository.findOne({
      where,
      relations: { pricePair: true, transactions: true, user: true },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return order;
  }

  async cancelOrder(userId: string, orderId: string): Promise<OrderEntity> {
    // Load with the symbol relations needed to release the wallet lock.
    const order = await this.orderRepository.findOne({
      where: { id: orderId, userId },
      relations: { pricePair: { baseSymbol: true, quoteSymbol: true } },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    if (order.status !== OrderStatusEnum.PENDING && order.status !== OrderStatusEnum.PARTIALLY_COMPLETED) {
      throw new BadRequestException(`Cannot cancel order with status: ${order.status}`);
    }

    // A balance freeze only happened if the order was dispatched to a provider.
    const wasFrozen = !!(order.metadata?.providerKey && order.metadata?.providerItemId);

    if (wasFrozen && order.pricePair) {
      // Unlocks the frozen balance and marks the order CANCELLED atomically.
      await this.walletOrderService.rejectOrder(order, order.pricePair, OrderStatusEnum.CANCELLED);
    } else {
      order.status = OrderStatusEnum.CANCELLED;
      order.cancelledAt = new Date();
      await this.orderRepository.save(order);
    }

    this.logger.log(`Order ${order.orderCode} cancelled by user ${userId}`);
    return this.getOrderById(orderId, userId);
  }

  async updateOrder(orderId: string, dto: UpdateOrderDto, userId?: string): Promise<OrderEntity> {
    const order = await this.getOrderById(orderId, userId);

    if (dto.status) {
      order.status = dto.status;
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

    if (dto.notes) {
      order.notes = dto.notes;
    }

    return this.orderRepository.save(order);
  }

  private generateOrderCode(side: OrderSideEnum, type: OrderTypeEnum): string {
    const prefix = side === OrderSideEnum.BUY ? "B" : "S";
    const typePrefix = type === OrderTypeEnum.MARKET ? "M" : "L";
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = crypto.randomUUID().split("-")[0].toUpperCase();
    return `ORD-${prefix}${typePrefix}-${timestamp}-${random}`;
  }

  async getOrderByCode(orderCode: string): Promise<OrderEntity> {
    const order = await this.orderRepository.findOne({
      where: { orderCode },
      relations: { pricePair: true, transactions: true, user: true },
    });

    if (!order) {
      throw new NotFoundException("Order not found");
    }

    return order;
  }
}
