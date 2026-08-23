import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Repository, DataSource, In } from "typeorm";
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
import { MarketTypeEnum } from "../admin-pair/enum/market.type.enum";
import { MESQAL_TO_GRAM } from "../common/constants";
import { RabbitMQService } from "../rabbitmq/rabbitmq.service";
import { MessagePatterns } from "../rabbitmq/interfaces/rabbitmq.interfaces";
import { ProviderPairMappingService } from "../provider-pair-mapping/provider-pair-mapping.service";
import { WalletOrderService } from "../wallet/services/wallet-order.service";
import { TelegramNotifierService } from "../telegram-notifier/telegram-notifier.service";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";
import { UserMarketKindEntity } from "../user/entity/user.market.kind.entity";
import { MarketKindEnum } from "../admin-pair/enum/market.kind.enum";
import { defaultMarketKindsForRole } from "../shared/market-access.helper";
import { OrderBookService } from "../order-book/order-book.service";
import { Side } from "nodejs-order-book";
import { OrderSource } from "../order-book/interfaces/order-book.types";
import { CreditEntity } from "../credit/entity/credit.entity";
import { CreditOrderEntity } from "../credit/entity/credit-order.entity";
import { CreditStatusEnum } from "../credit/enum/credit-status.enum";
import { CreditOrderStatusEnum } from "../credit/enum/credit-order-status.enum";
import { CreditService } from "../credit/credit.service";
import { OrderEvents } from "../shared/constants/events.constants";
import { UserLevelService } from "../user-level/user-level.service";
import { UserKycEntity } from "../user/entity/user.kyc.entity";
import { KycStatusEnum } from "../baseinfo/enum/kycStatus.enum";
import { computePendDeadlines, initialPendDeadlineState } from "../credit/util/pend-deadline.util";

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
    private readonly telegramNotifier: TelegramNotifierService,
    @InjectRepository(UserMarketTypeEntity)
    private readonly userMarketTypeRepo: Repository<UserMarketTypeEntity>,
    @InjectRepository(UserMarketKindEntity)
    private readonly userMarketKindRepo: Repository<UserMarketKindEntity>,
    private readonly orderBookService: OrderBookService,
    @InjectRepository(CreditEntity)
    private readonly creditRepo: Repository<CreditEntity>,
    @InjectRepository(CreditOrderEntity)
    private readonly creditOrderRepo: Repository<CreditOrderEntity>,
    private readonly eventEmitter: EventEmitter2,
    private readonly userLevelService: UserLevelService,
    private readonly creditService: CreditService,
    @InjectRepository(UserKycEntity)
    private readonly kycRepo: Repository<UserKycEntity>,
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

      const userMarketTypes = await this.userMarketTypeRepo.find({ where: { userId: user.id } });
      const allowedMarketTypes = new Set(userMarketTypes.map((r) => r.marketType));
      const pairMarketType = pricePair.baseSymbol?.marketType;
      if (pairMarketType && allowedMarketTypes.size > 0 && !allowedMarketTypes.has(pairMarketType)) {
        throw new BadRequestException(
          `You do not have access to trade on ${pairMarketType} market pairs.`
        );
      }

      // Enforce the user's allowed market kinds (trading modes). Users with no
      // explicit assignment fall back to their role's defaults (CUSTOMER:
      // MARKET+LIMIT, PARTNER: MARKET+LIMIT+OFFER). QUOTE is a legacy/internal
      // flow and is not gated by market kinds.
      const userMarketKinds = await this.userMarketKindRepo.find({ where: { userId: user.id } });
      const allowedMarketKinds = new Set(
        userMarketKinds.length > 0
          ? userMarketKinds.map((r) => r.marketKind)
          : defaultMarketKindsForRole(user.role)
      );
      const requestedKind = dto.orderType as unknown as MarketKindEnum;
      if (
        Object.values(MarketKindEnum).includes(requestedKind) &&
        !allowedMarketKinds.has(requestedKind)
      ) {
        throw new BadRequestException(
          `You do not have access to ${dto.orderType} market trading.`
        );
      }

      if (dto.orderType === OrderTypeEnum.LIMIT && !dto.price) {
        throw new BadRequestException("Price is required for limit orders");
      }

      const activeCredit = await this.creditRepo.findOne({
        where: { userId, status: CreditStatusEnum.ACTIVE },
      });
      if (activeCredit) {
        // Credit v2: Calculate credit amount on first order if not yet calculated
        if (activeCredit.creditLimit === 0) {
          await this.creditService.calculateAndIssueCreditOnFirstOrder(activeCredit.id, dto.pricePairId);
          // Reload credit with updated values
          const updatedCredit = await this.creditRepo.findOne({
            where: { id: activeCredit.id },
          });
          if (updatedCredit) {
            Object.assign(activeCredit, updatedCredit);
          }
        }

        // Credit trading must not be explicitly disabled by the user's level
        // (absent => allowed, opt-out model).
        const creditTradingValue = await this.userLevelService.getFeatureValue(userId, "CREDIT_TRADING_ENABLED");
        const creditTradingDisabled =
          creditTradingValue !== null &&
          creditTradingValue !== undefined &&
          (creditTradingValue === false || creditTradingValue?.enabled === false);
        if (creditTradingDisabled) {
          throw new BadRequestException("CREDIT_TRADING_DISABLED");
        }
        // Enforce the per-credit max execution (open positions) cap by counting
        // currently-active credit-linked orders.
        if (activeCredit.maxExecutionTradeLevel != null) {
          const activeCount = await this.creditOrderRepo.count({
            where: { creditId: activeCredit.id, status: CreditOrderStatusEnum.ACTIVE },
          });
          if (activeCount >= activeCredit.maxExecutionTradeLevel) {
            throw new BadRequestException("CREDIT_EXECUTION_LIMIT_REACHED");
          }
        }
        // Credit v2: parallel-request cap from the facility snapshot.
        const maxParallel = activeCredit.metadata?.maxParallelRequests;
        if (maxParallel != null) {
          const [activeCreditOrders, pendingLinkedOrders] = await Promise.all([
            this.creditOrderRepo.count({
              where: { creditId: activeCredit.id, status: CreditOrderStatusEnum.ACTIVE },
            }),
            this.orderRepository.count({
              where: {
                userId,
                isCreditLinked: true,
                status: OrderStatusEnum.PENDING,
              },
            }),
          ]);
          if (activeCreditOrders + pendingLinkedOrders >= maxParallel) {
            throw new BadRequestException("CREDIT_MAX_PARALLEL_REQUESTS_REACHED");
          }
        }
        // Credit v2: execution-level (hops) cap from the facility snapshot.
        const maxHops = activeCredit.metadata?.maxExecutionLevel;
        if (maxHops != null && activeCredit.usedCredit > 0) {
          const hops = await this.creditOrderRepo.count({
            where: { creditId: activeCredit.id, status: CreditOrderStatusEnum.ACTIVE },
          });
          if (hops + 1 > maxHops) {
            throw new BadRequestException("CREDIT_MAX_EXECUTION_LEVEL_REACHED");
          }
        }
        // Credit v2: drawdown check — re-price collateral; ENFORCE liquidates,
        // ALERT blocks exposure-increasing (BUY) orders.
        if (activeCredit.drawdownPercent != null) {
          const { blockBuy } = await this.creditService.enforceDrawdownRules(activeCredit);
          if (blockBuy && dto.side === OrderSideEnum.BUY) {
            throw new BadRequestException("CREDIT_DRAWDOWN_BLOCKED");
          }
        }
        // Reduce-only mode (handoff Section 25): when riskState is WARNING or
        // MARGIN_CALL, block new/increase orders — only reducing orders allowed.
        if (
          activeCredit.riskState === "WARNING" ||
          activeCredit.riskState === "MARGIN_CALL"
        ) {
          // Allow SELL orders (reducing a BUY position) on credit-linked pairs.
          // Block BUY orders (increasing/opening new positions).
          if (dto.side === "BUY") {
            throw new BadRequestException(
              `CREDIT_REDUCE_ONLY: Credit is in ${activeCredit.riskState} state. ` +
              `Only reducing (sell) orders are allowed.`
            );
          }
        }
      }

      const orderCode = this.generateOrderCode(dto.side, dto.orderType);

      // Credit-linked orders carry the pair's per-side pend deadlines (x/y/z).
      const pendDeadlines = activeCredit
        ? computePendDeadlines(pricePair, dto.side)
        : { warnAt: null, expireAt: null, graceEndAt: null };


      // Only MARKET and QUOTE orders need a provider mapping — LIMIT orders
      // are matched in the order book.
      let providerKey: string | undefined;
      let providerItemId: number | undefined;

      if (dto.orderType !== OrderTypeEnum.LIMIT) {
        providerKey = dto.side === OrderSideEnum.BUY
          ? pricePair.bestBuyProvider
          : pricePair.bestSellProvider;

        if (providerKey) {
          const pairMappings = await this.mappingService.findByPair(dto.pricePairId);
          const match = pairMappings.find((m) => m.providerKey === providerKey);
          providerItemId = match?.providerItemId;
        }

        if (!providerKey || !providerItemId) {
          throw new BadRequestException(
            "No liquidity provider is currently available for this pair. Please try again shortly."
          );
        }
      }

      // Prices: pair prices are per MESGHAL, but the customer trades in GRAMS.
      // The order is PLACED with the provider at the PURE price (no markup) and
      // settled per GRAM at that price. We also compute the DISPLAY price shown
      // to the customer (pure + commission + gain) so the deal record carries
      // both. Pair prices are per MESGHAL.
      const isBuy = dto.side === OrderSideEnum.BUY;
      const isQuote = dto.orderType === OrderTypeEnum.QUOTE;
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

      let displayGram: number;
      let displayMesghal: number;
      let commissionAmt: number;

      if (isQuote) {
        // QUOTE type: commission is NOT baked into the display price.
        //   BUY  → commission charged in QUOTE asset (IRR) on top of pure price
        //   SELL → commission charged in BASE asset (XAU) deducted from qty
        displayGram = gramPrice;
        displayMesghal = providerMesghalPrice;
        const rate = isBuy ? buyComm : sellComm;
        commissionAmt = isBuy
          ? Number(((dto.quantity * gramPrice * rate) / 100).toFixed(8))
          : Number(((dto.quantity * rate) / 100).toFixed(8));
      } else if (dto.orderType === OrderTypeEnum.LIMIT) {
        // LIMIT: the user's limit price IS the display price. Commission is
        // taken as a quantity deduction at settlement, not baked into the price.
        displayGram = gramPrice;
        displayMesghal = providerMesghalPrice;
        commissionAmt = dto.commission || 0;
      } else {
        // MARKET: commission + gain baked into the display price.
        const gainAdj =
          pricePair.baseSymbol?.gainType === GainTypeEnum.PERCENT
            ? (realMesghal * baseGain) / 100
            : baseGain;
        displayMesghal = isBuy
          ? Math.max(0, bestBuy * (1 + buyComm / 100) + gainAdj)
          : Math.max(0, bestSell * (1 - sellComm / 100) - gainAdj);
        displayGram = displayMesghal / MESQAL_TO_GRAM;
        commissionAmt = dto.commission || 0;
      }

      await this.enforceTradingRules(userId, Number(dto.quantity) * gramPrice);

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
        commission: commissionAmt,
        notes: dto.notes,
        isCreditLinked: !!activeCredit,
        pendDeadlineWarnAt: pendDeadlines.warnAt,
        pendDeadlineExpireAt: pendDeadlines.expireAt,
        pendDeadlineGraceEndAt: pendDeadlines.graceEndAt,
        pendDeadlineState: initialPendDeadlineState(pendDeadlines),
        metadata: {
          ...dto.metadata,
          ...(dto.orderType !== OrderTypeEnum.LIMIT ? { providerKey, providerItemId } : {}),
        },
      });

      const savedOrder = await queryRunner.manager.save(order);
      await queryRunner.commitTransaction();

      this.logger.log(`Order created: ${orderCode} for user ${userId}`);
      this.eventEmitter.emit(OrderEvents.PLACED, {
        userId,
        orderId: savedOrder.id,
        symbol: pricePair.baseSymbol?.slug,
        side: savedOrder.side,
        quantity: savedOrder.quantity,
        price: savedOrder.price,
      });

      // Reserve the balance. This runs after the order transaction is
      // committed, so on failure we reject the order instead of leaving it
      // PENDING.
      try {
        await this.walletOrderService.freezeForOrder(savedOrder, pricePair);

        // Track credit execution level and link the order to the credit.
        if (activeCredit && activeCredit.maxExecutionTradeLevel != null) {
          await this.creditRepo.update(activeCredit.id, {
            executedTradeLevel: activeCredit.executedTradeLevel + 1,
          });
          const creditOrder = this.creditOrderRepo.create({
            creditId: activeCredit.id,
            orderId: savedOrder.id,
            priceAtOrderTime: gramPrice,
            status: CreditOrderStatusEnum.ACTIVE,
            drawdownPercent: activeCredit.callMarginPercent,
          });
          await this.creditOrderRepo.save(creditOrder);
        }

        if (dto.orderType === OrderTypeEnum.LIMIT) {
          // ── LIMIT: match in the order book ─────────────────────────
          await this.processLimitOrder(savedOrder, pricePair, gramPrice);
        } else {
          // ── MARKET / QUOTE: dispatch to the provider ───────────────
          const dealType = savedOrder.side === OrderSideEnum.BUY ? 0 : 1;

          const providerGold =
            savedOrder.side === OrderSideEnum.BUY && gramPrice > 0
              ? isQuote
                ? Number(savedOrder.quantity)
                : Number(((Number(savedOrder.quantity) * displayGram) / gramPrice).toFixed(8))
              : Number(savedOrder.quantity);

          this.rmq.publish(MessagePatterns.ORDER_PLACE_REQUEST, {
            pattern: MessagePatterns.ORDER_PLACE_REQUEST,
            data: {
              providerKey,
              itemId: providerItemId,
              dealType,
              count: providerGold,
              price: providerMesghalPrice || undefined,
              gramVolume: providerGold,
              gramPrice,
              customerPrice: displayMesghal,
              customerGramPrice: displayGram,
              clientOrderId: savedOrder.id,
            },
            timestamp: new Date().toISOString(),
            providerKey,
          });
        }
      } catch (err) {
        savedOrder.status = OrderStatusEnum.REJECTED;
        await this.orderRepository.save(savedOrder);
        this.eventEmitter.emit(OrderEvents.REJECTED, {
          userId: savedOrder.userId,
          orderId: savedOrder.id,
          orderCode: savedOrder.orderCode,
          reason: err instanceof Error ? err.message : String(err),
        });
        const errMsg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Failed to process order ${orderCode}: ${errMsg}`);
        throw err instanceof BadRequestException
          ? err
          : new BadRequestException(errMsg || "Could not place order");
      }

      // Only QUOTE-type orders interact with Telegram (separate market from
      // LIMIT/MARKET).  Skip Telegram notification for non-QUOTE orders.
      if (dto.orderType === OrderTypeEnum.QUOTE) {
        const sideLabel = isBuy ? "خرید" : "فروش";
        const slug = pricePair?.baseSymbol?.slug || "—";
        const quoteSlug = pricePair?.quoteSymbol?.slug || "—";
        this.telegramNotifier.sendOrderWithMatchButton(
          `🆕 *سفارش جدید* — ${savedOrder.orderCode}` +
          `\n🔹 ${sideLabel} ${slug}` +
          `\n🔹 مقدار: ${savedOrder.quantity}` +
          `\n🔹 قیمت: ${savedOrder.price ?? "—"} ${quoteSlug}` +
          `\n🔹 وضعیت: ${savedOrder.status}`,
          savedOrder.id,
        );
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

  // Enforces the user's level trading rules: KYC requirement, max order value,
  // max open orders and the daily trading volume limit (amount 0 = unlimited).
  private async enforceTradingRules(userId: string, orderValue: number): Promise<void> {
    // KYC required before trading
    const kycRequired = await this.userLevelService.getFeatureValue(userId, "KYC_REQUIRED");
    if (this.featureEnabled(kycRequired)) {
      const kyc = await this.kycRepo.findOne({ where: { userId } });
      if (!kyc || kyc.status !== KycStatusEnum.APPROVED) {
        throw new BadRequestException("برای معامله ابتدا احراز هویت را تکمیل کنید");
      }
    }

    // Max order value (per order)
    const maxOrder = await this.userLevelService.getFeatureValue(userId, "TRADING_MAX_ORDER_VALUE");
    const maxOrderAmount = typeof maxOrder === "object" ? Number(maxOrder?.amount) : Number(maxOrder);
    if (maxOrderAmount > 0 && orderValue > maxOrderAmount) {
      throw new BadRequestException(
        `حداکثر ارزش هر سفارش در سطح شما ${maxOrderAmount.toLocaleString("fa-IR")} ریال است`
      );
    }

    // Max open orders
    const maxOpen = await this.userLevelService.getFeatureValue(userId, "TRADING_MAX_OPEN_ORDERS");
    const maxOpenOrders = Number(maxOpen);
    if (maxOpenOrders > 0) {
      const openCount = await this.orderRepository.count({
        where: {
          userId,
          status: In([OrderStatusEnum.PENDING, OrderStatusEnum.PARTIALLY_COMPLETED]),
        },
      });
      if (openCount >= maxOpenOrders) {
        throw new BadRequestException(
          `حداکثر سفارش‌های باز در سطح شما ${maxOpenOrders} عدد است`
        );
      }
    }

    // Daily trading volume limit
    const daily = await this.userLevelService.getFeatureValue(userId, "TRADING_DAILY_LIMIT");
    const dailyLimit = typeof daily === "object" ? Number(daily?.amount) : Number(daily);
    if (dailyLimit > 0) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { sum } = (await this.orderRepository
        .createQueryBuilder("order")
        .select("COALESCE(SUM(order.total_value), 0)", "sum")
        .where("order.user_id = :userId", { userId })
        .andWhere("order.created_at >= :start", { start })
        .getRawOne()) as any;
      if (Number(sum) + orderValue > dailyLimit) {
        throw new BadRequestException(
          `سقف معاملات روزانه این سطح ${dailyLimit.toLocaleString("fa-IR")} ریال است`
        );
      }
    }
  }

  private featureEnabled(value: any): boolean {
    if (typeof value === "object" && "enabled" in value) return value.enabled === true;
    if (typeof value === "boolean") return value;
    return false;
  }

  async getUserOrders(userId: string, query: OrderQueryDto): Promise<{ orders: OrderEntity[]; total: number }> {
    const { pricePairId, side, orderType, status, marketTypes, limit = 10, offset = 0 } = query;

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

    // Scope the list to the given base-symbol market types (e.g. elite/offer
    // pages only want orders of the market type they display).
    const marketTypeList = (marketTypes || "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    if (marketTypeList.length > 0) {
      queryBuilder
        .leftJoinAndSelect("pricePair.baseSymbol", "baseSymbol")
        .andWhere("baseSymbol.market_type IN (:...marketTypeList)", { marketTypeList });
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

    // Remove the order from the customer order book (LIMIT orders only).
    // This is safe to call for MARKET/QUOTE orders as cancel returns false.
    this.orderBookService.cancelCustomerOrder(order.pricePairId, order.id);

    // All orders go through freezeForOrder, so always unlock via rejectOrder.
    if (order.pricePair) {
      await this.walletOrderService.rejectOrder(order, order.pricePair, OrderStatusEnum.CANCELLED);
    } else {
      order.status = OrderStatusEnum.CANCELLED;
      order.cancelledAt = new Date();
      await this.orderRepository.save(order);
    }

    // Update CreditOrderEntity status when order is cancelled
    const creditOrder = await this.creditOrderRepo.findOne({
      where: { orderId: order.id, status: CreditOrderStatusEnum.ACTIVE },
    });
    if (creditOrder) {
      creditOrder.status = CreditOrderStatusEnum.CANCELLED;
      await this.creditOrderRepo.save(creditOrder);
    }

    this.logger.log(`Order ${order.orderCode} cancelled by user ${userId}`);
    this.eventEmitter.emit(OrderEvents.CANCELLED, { userId, orderId: order.id });
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

  /**
   * Process a LIMIT order through the order book: match against existing
   * customer orders (P2P), then against the synthetic provider book, and
   * rest any remaining quantity in the customer book.
   */
  private async processLimitOrder(
    order: OrderEntity,
    pricePair: PricePairEntity,
    gramPrice: number,
  ): Promise<void> {
    const side = order.side === OrderSideEnum.BUY ? Side.BUY : Side.SELL;

    const result = this.orderBookService.processLimitOrder(
      order.pricePairId,
      side,
      Number(order.quantity),
      gramPrice,
      order.id,
    );

    let totalExecuted = 0;

    for (const match of result.matchedOrders) {
      const s = match.size;

      await this.walletOrderService.settleLimitMatch(
        order,
        s,
        match.takerPrice,
        match.makerPrice,
        match.makerSource,
        match.makerOrderId,
        pricePair,
      );

      totalExecuted += s;
    }

    if (totalExecuted > 0) {
      const qty = Number(order.quantity);
      const avgPrice = gramPrice;
      order.executedQuantity = Number((totalExecuted).toFixed(8));
      order.averagePrice = avgPrice;
      order.totalValue = Number((totalExecuted * avgPrice).toFixed(8));

      if (totalExecuted >= qty) {
        order.status = OrderStatusEnum.COMPLETED;
        order.completedAt = new Date();
      } else if (totalExecuted > 0) {
        order.status = OrderStatusEnum.PARTIALLY_COMPLETED;
      }

      await this.orderRepository.save(order);

      // Update CreditOrderEntity status when order completes or is cancelled
      if (order.status === OrderStatusEnum.COMPLETED || order.status === OrderStatusEnum.CANCELLED) {
        const creditOrder = await this.creditOrderRepo.findOne({
          where: { orderId: order.id, status: CreditOrderStatusEnum.ACTIVE },
        });
        if (creditOrder) {
          creditOrder.status = order.status === OrderStatusEnum.COMPLETED
            ? CreditOrderStatusEnum.COMPLETED
            : CreditOrderStatusEnum.CANCELLED;
          await this.creditOrderRepo.save(creditOrder);
        }
      }

      this.logger.log(
        `Limit order ${order.orderCode}: ${totalExecuted}/${qty} matched (${result.restingSize} resting)`,
      );
      this.eventEmitter.emit(OrderEvents.MATCHED, {
        userId: order.userId,
        orderId: order.id,
        symbol: pricePair.baseSymbol?.slug,
        quantity: totalExecuted,
        price: avgPrice,
      });
    }
  }

  private generateOrderCode(side: OrderSideEnum, type: OrderTypeEnum): string {
    const prefix = side === OrderSideEnum.BUY ? "B" : "S";
    let typePrefix: string;
    switch (type) {
      case OrderTypeEnum.MARKET:
        typePrefix = "M";
        break;
      case OrderTypeEnum.LIMIT:
        typePrefix = "L";
        break;
      case OrderTypeEnum.QUOTE:
        typePrefix = "Q";
        break;
      default:
        typePrefix = "X";
    }
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
