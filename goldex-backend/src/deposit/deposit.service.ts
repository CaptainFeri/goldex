import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { DepositEntity } from "./deposit.entity";
import { CreateDepositDto } from "./dto/create-deposit.dto";
import { DepositQueryDto } from "./dto/deposit-query.dto";
import { ProcessDepositDto } from "./dto/process-deposit.dto";
import { DepositStatusEnum } from "./enum/deposit-status.enum";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { TransactionTypeEnum } from "../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../wallet/enum/transaction.status.enum";
import { WalletStatusEnum } from "../wallet/enum/wallet-status.enum";
import { WalletTypeEnum } from "../wallet/enum/wallet-type.enum";
import { getDefaultDepositTypes, GATEWAY_BOUND_TYPES } from "../admin-symbol/constants/symbol-type-type-map";
import { PaymentBusService } from "../payment-bus/payment-bus.service";
import { DepositEvents } from "../shared/constants/events.constants";
import { UserLevelService } from "../user-level/user-level.service";
import { DepositTypeEnum } from "../admin-symbol/enum/deposit-type.enum";
import { P2pDepositService } from "../p2p/services/p2p-deposit.service";
import { P2pAuditActorEnum } from "../p2p/enum/p2p.enums";
import { PaginatedDto, paginate } from "../shared/dto/paginated.dto";

@Injectable()
export class DepositService {
  private readonly logger = new Logger(DepositService.name);

  constructor(
    @InjectRepository(DepositEntity)
    private depositRepo: Repository<DepositEntity>,
    @InjectRepository(SymbolEntity)
    private symbolRepo: Repository<SymbolEntity>,
    @InjectRepository(WalletEntity)
    private walletRepo: Repository<WalletEntity>,
    @InjectRepository(TransactionEntity)
    private transactionRepo: Repository<TransactionEntity>,
    private dataSource: DataSource,
    private readonly paymentBus: PaymentBusService,
    private readonly eventEmitter: EventEmitter2,
    private readonly userLevelService: UserLevelService,
    private readonly p2pDeposit: P2pDepositService,
  ) {}

  async create(userId: string, dto: CreateDepositDto): Promise<DepositEntity> {
    const symbol = await this.symbolRepo.findOne({ where: { id: dto.symbolId } });
    if (!symbol) throw new NotFoundException("Symbol not found");

    const allowed = symbol.depositTypes?.length
      ? symbol.depositTypes
      : getDefaultDepositTypes(symbol.symbolType);

    if (!allowed.includes(dto.type)) {
      throw new BadRequestException(
        `Deposit type "${dto.type}" is not allowed for this symbol. Allowed: ${allowed.join(", ")}`,
      );
    }

    const gatewayBound = GATEWAY_BOUND_TYPES.has(dto.type);
    let gatewayCode: string | undefined;
    if (gatewayBound) {
      if (!symbol.hasPaymentGateway) {
        throw new BadRequestException(
          `Deposit type "${dto.type}" requires a payment gateway but symbol "${symbol.slug}" has none configured`,
        );
      }
      gatewayCode = dto.gatewayCode ?? symbol.defaultDepositGateway;
      if (!gatewayCode) {
        throw new BadRequestException(
          `No deposit gateway configured for symbol "${symbol.slug}". Choose one of: ${(symbol.depositGateways ?? []).join(", ")}`,
        );
      }
      const available = symbol.depositGateways ?? [];
      if (available.length && !available.includes(gatewayCode)) {
        throw new BadRequestException(
          `Gateway "${gatewayCode}" is not allowed for symbol "${symbol.slug}". Allowed: ${available.join(", ")}`,
        );
      }
    }

    const deposit = this.depositRepo.create({
      userId,
      symbolId: dto.symbolId,
      type: dto.type,
      amount: dto.amount,
      notes: dto.notes,
      picturePath: dto.picturePath,
      metadata: dto.metadata,
      gatewayCode,
      status: DepositStatusEnum.PENDING,
    });

    const saved = await this.depositRepo.save(deposit);
    this.eventEmitter.emit(DepositEvents.CREATED, {
      userId: saved.userId,
      depositId: saved.id,
      amount: saved.amount,
      type: saved.type,
      symbolId: saved.symbolId,
    });

    // p2p is not gateway-bound: no provider call, just an intent that the
    // matching engine fills. The KYC and level checks above still applied.
    if (saved.type === DepositTypeEnum.P2P) {
      await this.p2pDeposit.createForDeposit(
        saved,
        dto.metadata?.constraints,
        { actorType: P2pAuditActorEnum.USER, actorId: userId },
      );
      return this.findById(saved.id);
    }

    if (gatewayBound) {
      this.paymentBus.requestDeposit({
        externalReference: saved.id,
        userId: saved.userId,
        symbolSlug: symbol.slug,
        symbolType: symbol.symbolType,
        type: saved.type,
        amount: saved.amount,
        // The slug, not symbol.name: this is a machine field on a payments
        // rail, and the rial symbol's name is "ریال ایران" — a localized label
        // no consumer can compare against. The gateway integrations already
        // send "IRR", and symbolSlug above carries the same value.
        currency: symbol.slug,
        gatewayCode,
        picturePath: saved.picturePath,
        notes: saved.notes,
        metadata: saved.metadata,
      });
      this.logger.log(
        `Gateway deposit ${saved.id} created, payment.request.deposit published (gateway: ${gatewayCode})`,
      );
    }

    return saved;
  }

  async findByUser(userId: string, query: DepositQueryDto) {
    const { status, page = 1, limit = 20 } = query;
    const where: any = { userId };
    if (status) where.status = status;

    const [items, total] = await this.depositRepo.findAndCount({
      where,
      relations: { symbol: true },
      order: { createAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit };
  }

  async findById(id: string): Promise<DepositEntity> {
    const deposit = await this.depositRepo.findOne({
      where: { id },
      relations: { symbol: true, user: true },
    });
    if (!deposit) throw new NotFoundException("Deposit not found");
    return deposit;
  }

  async findUserDepositById(userId: string, id: string): Promise<DepositEntity> {
    const deposit = await this.findById(id);
    if (deposit.userId !== userId) throw new ForbiddenException("Access denied");
    return deposit;
  }

  async cancel(userId: string, id: string): Promise<DepositEntity> {
    const deposit = await this.findUserDepositById(userId, id);
    if (deposit.status !== DepositStatusEnum.PENDING) {
      throw new BadRequestException("Only pending deposits can be cancelled");
    }
    deposit.status = DepositStatusEnum.CANCELLED;
    const saved = await this.depositRepo.save(deposit);
    this.eventEmitter.emit(DepositEvents.CANCELLED, {
      userId: saved.userId,
      depositId: saved.id,
      amount: saved.amount,
    });
    return saved;
  }

  async findAll(query: DepositQueryDto): Promise<PaginatedDto<DepositEntity>> {
    const { status } = query;
    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await this.depositRepo.findAndCount({
      where,
      relations: { symbol: true, user: true },
      order: { createAt: "DESC" },
      skip: query.skip,
      take: query.take,
    });

    return paginate(items, total, query);
  }

  async process(adminId: string, id: string, dto: ProcessDepositDto): Promise<DepositEntity> {
    const deposit = await this.findById(id);
    if (deposit.status !== DepositStatusEnum.PENDING && deposit.status !== DepositStatusEnum.PROCESSING) {
      throw new BadRequestException("Deposit is not in a processable state");
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      deposit.status = dto.status;
      deposit.adminId = adminId;
      if (dto.notes) deposit.notes = dto.notes;
      if (dto.picturePath) deposit.picturePath = dto.picturePath;
      if (dto.metadata) deposit.metadata = { ...(deposit.metadata || {}), ...dto.metadata };
      if (dto.status === DepositStatusEnum.COMPLETED || dto.status === DepositStatusEnum.FAILED) {
        deposit.completedAt = new Date();
      }

      if (dto.status === DepositStatusEnum.COMPLETED) {
        await this.enforceDailyDepositLimit(deposit.userId, Number(deposit.amount), queryRunner);

        let wallet = await queryRunner.manager.findOne(WalletEntity, {
          where: { userId: deposit.userId, symbolId: deposit.symbolId, walletType: WalletTypeEnum.DEPOSIT },
          lock: { mode: "pessimistic_write" },
        });

        if (!wallet) {
          const symbol = await this.symbolRepo.findOne({ where: { id: deposit.symbolId } });
          if (!symbol) throw new NotFoundException("Symbol not found");
          wallet = queryRunner.manager.create(WalletEntity, {
            userId: deposit.userId,
            symbolId: deposit.symbolId,
            walletType: WalletTypeEnum.DEPOSIT,
            freeBalance: 0,
            lockedBalance: 0,
            status: WalletStatusEnum.ACTIVE,
          });
          wallet = await queryRunner.manager.save(wallet);
        }

        wallet.freeBalance = Number((Number(wallet.freeBalance) + Number(deposit.amount)).toFixed(8));
        await queryRunner.manager.save(wallet);

        const tx = this.transactionRepo.create({
          walletId: wallet.id,
          transactionId: `DEP-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
          transactionType: TransactionTypeEnum.DEPOSIT,
          status: TransactionStatusEnum.COMPLETED,
          amount: Number(deposit.amount),
          description: `Manual deposit approved: ${deposit.type} - ${deposit.notes || ""}`,
          metadata: { depositId: deposit.id, depositType: deposit.type },
          completedAt: new Date(),
        });
        await queryRunner.manager.save(tx);

        this.logger.log(`Deposit ${deposit.id} completed: ${deposit.amount} added to wallet ${wallet.id}`);
      }

      await queryRunner.manager.save(deposit);
      await queryRunner.commitTransaction();

      this.eventEmitter.emit(
        dto.status === DepositStatusEnum.COMPLETED ? DepositEvents.COMPLETED : DepositEvents.FAILED,
        {
          userId: deposit.userId,
          depositId: deposit.id,
          amount: deposit.amount,
          status: dto.status,
        },
      );

      return this.findById(id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }

  // Enforces the level's WALLET_DAILY_DEPOSIT_LIMIT (amount 0 = unlimited).
  private async enforceDailyDepositLimit(userId: string, amount: number, queryRunner: any): Promise<void> {
    const limit = await this.userLevelService.getFeatureValue(userId, "WALLET_DAILY_DEPOSIT_LIMIT");
    const maxAmount = typeof limit === "object" ? Number(limit?.amount) : Number(limit);
    if (!maxAmount || maxAmount <= 0) return;

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const [rows] = await queryRunner.manager.query(
      `SELECT COALESCE(SUM(amount), 0) AS total
       FROM "transaction"
       WHERE "wallet_id" IN (SELECT "id" FROM "wallet" WHERE "user_id" = $1)
         AND "transaction_type" = 'DEPOSIT' AND "status" = 'completed'
         AND "created_at" >= $2`,
      [userId, start]
    );
    const todayTotal = Number(rows?.total ?? 0);
    if (todayTotal + amount > maxAmount) {
      throw new BadRequestException(
        `سقف واریز روزانه این سطح ${maxAmount.toLocaleString("fa-IR")} ریال است و با این واریز تجاوز می‌شود.`
      );
    }
  }
}
