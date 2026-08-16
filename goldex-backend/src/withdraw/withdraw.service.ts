import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { WithdrawEntity } from "./withdraw.entity";
import { CreateWithdrawDto } from "./dto/create-withdraw.dto";
import { WithdrawQueryDto } from "./dto/withdraw-query.dto";
import { ProcessWithdrawDto } from "./dto/process-withdraw.dto";
import { WithdrawStatusEnum } from "./enum/withdraw-status.enum";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { TransactionTypeEnum } from "../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../wallet/enum/transaction.status.enum";
import { getDefaultWithdrawTypes, GATEWAY_BOUND_TYPES } from "../admin-symbol/constants/symbol-type-type-map";
import { PaymentBusService } from "../payment-bus/payment-bus.service";
import { WithdrawEvents } from "../shared/constants/events.constants";
import { UserLevelService } from "../user-level/user-level.service";
import { UserEntity } from "../user/entity/user.entity";
import { UserKycEntity } from "../user/entity/user.kyc.entity";
import { KycStatusEnum } from "../baseinfo/enum/kycStatus.enum";

@Injectable()
export class WithdrawService {
  private readonly logger = new Logger(WithdrawService.name);

  constructor(
    @InjectRepository(WithdrawEntity)
    private withdrawRepo: Repository<WithdrawEntity>,
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
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>,
    @InjectRepository(UserKycEntity)
    private kycRepo: Repository<UserKycEntity>,
  ) {}

  async create(userId: string, dto: CreateWithdrawDto): Promise<WithdrawEntity> {
    const symbol = await this.symbolRepo.findOne({ where: { id: dto.symbolId } });
    if (!symbol) throw new NotFoundException("Symbol not found");

    await this.enforceKyc(userId);
    await this.enforceWithdrawCooldown(userId);
    await this.enforceWithdrawalLimits(userId, Number(dto.amount));

    const allowed = symbol.withdrawTypes?.length
      ? symbol.withdrawTypes
      : getDefaultWithdrawTypes(symbol.symbolType);

    if (!allowed.includes(dto.type)) {
      throw new BadRequestException(
        `Withdraw type "${dto.type}" is not allowed for this symbol. Allowed: ${allowed.join(", ")}`,
      );
    }

    const gatewayBound = GATEWAY_BOUND_TYPES.has(dto.type);
    let gatewayCode: string | undefined;
    if (gatewayBound) {
      if (!symbol.hasPaymentGateway) {
        throw new BadRequestException(
          `Withdraw type "${dto.type}" requires a payment gateway but symbol "${symbol.slug}" has none configured`,
        );
      }
      if (!dto.beneficiaryIban || !dto.beneficiaryName || !dto.beneficiaryId) {
        throw new BadRequestException(
          "beneficiaryIban, beneficiaryName and beneficiaryId are required for gateway withdrawals",
        );
      }
      gatewayCode = dto.gatewayCode ?? symbol.defaultWithdrawGateway;
      if (!gatewayCode) {
        throw new BadRequestException(
          `No withdraw gateway configured for symbol "${symbol.slug}". Choose one of: ${(symbol.withdrawGateways ?? []).join(", ")}`,
        );
      }
      const available = symbol.withdrawGateways ?? [];
      if (available.length && !available.includes(gatewayCode)) {
        throw new BadRequestException(
          `Gateway "${gatewayCode}" is not allowed for symbol "${symbol.slug}". Allowed: ${available.join(", ")}`,
        );
      }
    }

    const withdraw = this.withdrawRepo.create({
      userId,
      symbolId: dto.symbolId,
      type: dto.type,
      amount: dto.amount,
      notes: dto.notes,
      picturePath: dto.picturePath,
      metadata: {
        ...(dto.metadata ?? {}),
        ...(gatewayBound
          ? {
              beneficiaryIban: dto.beneficiaryIban,
              beneficiaryName: dto.beneficiaryName,
              beneficiaryId: dto.beneficiaryId,
            }
          : {}),
      },
      gatewayCode,
      status: WithdrawStatusEnum.PENDING,
    });

    const saved = await this.withdrawRepo.save(withdraw);
    this.eventEmitter.emit(WithdrawEvents.CREATED, {
      userId: saved.userId,
      withdrawId: saved.id,
      amount: saved.amount,
      type: saved.type,
      symbolId: saved.symbolId,
    });

    if (gatewayBound) {
      this.paymentBus.requestWithdraw({
        externalReference: saved.id,
        userId: saved.userId,
        symbolSlug: symbol.slug,
        symbolType: symbol.symbolType,
        type: saved.type,
        amount: saved.amount,
        currency: symbol.name,
        gatewayCode,
        picturePath: saved.picturePath,
        notes: saved.notes,
        metadata: saved.metadata,
        beneficiaryIban: dto.beneficiaryIban,
        beneficiaryName: dto.beneficiaryName,
        beneficiaryId: dto.beneficiaryId,
      });
      this.logger.log(
        `Gateway withdraw ${saved.id} created, payment.request.withdraw published (gateway: ${gatewayCode})`,
      );
    }

    return saved;
  }

  /**
   * Publishes the approval of a gateway-bound withdrawal to goldex-cbp,
   * which then executes the provider transfer. Status is driven by
   * `payment.*` events afterwards.
   */
  async approveGatewayWithdraw(adminId: string, id: string): Promise<WithdrawEntity> {
    const withdraw = await this.findById(id);
    if (!GATEWAY_BOUND_TYPES.has(withdraw.type)) {
      throw new BadRequestException("Only gateway-bound withdrawals can be approved");
    }
    if (withdraw.status !== WithdrawStatusEnum.PENDING) {
      throw new BadRequestException("Withdrawal is not in an approvable state");
    }
    if (!withdraw.metadata?.beneficiaryIban) {
      throw new BadRequestException("Withdrawal is missing beneficiary information");
    }

    this.paymentBus.approveWithdraw(withdraw.id, adminId);
    this.logger.log(`Gateway withdraw ${withdraw.id} approval published by admin ${adminId}`);
    return withdraw;
  }

  async findByUser(userId: string, query: WithdrawQueryDto) {
    const { status, page = 1, limit = 20 } = query;
    const where: any = { userId };
    if (status) where.status = status;

    const [items, total] = await this.withdrawRepo.findAndCount({
      where,
      relations: { symbol: true },
      order: { createAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit };
  }

  async findById(id: string): Promise<WithdrawEntity> {
    const withdraw = await this.withdrawRepo.findOne({
      where: { id },
      relations: { symbol: true, user: true },
    });
    if (!withdraw) throw new NotFoundException("Withdraw not found");
    return withdraw;
  }

  async findUserWithdrawById(userId: string, id: string): Promise<WithdrawEntity> {
    const withdraw = await this.findById(id);
    if (withdraw.userId !== userId) throw new ForbiddenException("Access denied");
    return withdraw;
  }

  async cancel(userId: string, id: string): Promise<WithdrawEntity> {
    const withdraw = await this.findUserWithdrawById(userId, id);
    if (withdraw.status !== WithdrawStatusEnum.PENDING) {
      throw new BadRequestException("Only pending withdrawals can be cancelled");
    }
    withdraw.status = WithdrawStatusEnum.CANCELLED;
    const saved = await this.withdrawRepo.save(withdraw);
    this.eventEmitter.emit(WithdrawEvents.CANCELLED, {
      userId: saved.userId,
      withdrawId: saved.id,
      amount: saved.amount,
    });
    return saved;
  }

  async findAll(query: WithdrawQueryDto) {
    const { status, page = 1, limit = 20 } = query;
    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await this.withdrawRepo.findAndCount({
      where,
      relations: { symbol: true, user: true },
      order: { createAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit };
  }

  async process(adminId: string, id: string, dto: ProcessWithdrawDto): Promise<WithdrawEntity> {
    const withdraw = await this.findById(id);
    if (withdraw.status !== WithdrawStatusEnum.PENDING && withdraw.status !== WithdrawStatusEnum.PROCESSING) {
      throw new BadRequestException("Withdrawal is not in a processable state");
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      withdraw.status = dto.status;
      withdraw.adminId = adminId;
      if (dto.notes) withdraw.notes = dto.notes;
      if (dto.picturePath) withdraw.picturePath = dto.picturePath;
      if (dto.metadata) withdraw.metadata = { ...(withdraw.metadata || {}), ...dto.metadata };
      if (dto.status === WithdrawStatusEnum.COMPLETED || dto.status === WithdrawStatusEnum.FAILED) {
        withdraw.completedAt = new Date();
      }

      if (dto.status === WithdrawStatusEnum.COMPLETED) {
        let wallet = await queryRunner.manager.findOne(WalletEntity, {
          where: { userId: withdraw.userId, symbolId: withdraw.symbolId },
          lock: { mode: "pessimistic_write" },
        });

        if (!wallet) {
          throw new BadRequestException("User does not have a wallet for this symbol");
        }

        const amount = Number(withdraw.amount);
        if (Number(wallet.freeBalance) < amount) {
          throw new BadRequestException("Insufficient balance for withdrawal");
        }

        wallet.freeBalance = Number((Number(wallet.freeBalance) - amount).toFixed(8));
        await queryRunner.manager.save(wallet);

        const tx = this.transactionRepo.create({
          walletId: wallet.id,
          transactionId: `WTH-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
          transactionType: TransactionTypeEnum.WITHDRAWAL,
          status: TransactionStatusEnum.COMPLETED,
          amount: -amount,
          description: `Manual withdrawal approved: ${withdraw.type} - ${withdraw.notes || ""}`,
          metadata: { withdrawId: withdraw.id, withdrawType: withdraw.type },
          completedAt: new Date(),
        });
        await queryRunner.manager.save(tx);

        this.logger.log(`Withdraw ${withdraw.id} completed: ${amount} deducted from wallet ${wallet.id}`);
      }

      await queryRunner.manager.save(withdraw);
      await queryRunner.commitTransaction();

      this.eventEmitter.emit(
        dto.status === WithdrawStatusEnum.COMPLETED ? WithdrawEvents.COMPLETED : WithdrawEvents.FAILED,
        {
          userId: withdraw.userId,
          withdrawId: withdraw.id,
          amount: withdraw.amount,
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

  // Requires the user to be KYC-approved when their level sets KYC_REQUIRED.
  private async enforceKyc(userId: string): Promise<void> {
    const kycRequired = await this.userLevelService.getFeatureValue(userId, "KYC_REQUIRED");
    const enabled = typeof kycRequired === "object" ? kycRequired?.enabled === true : kycRequired === true;
    if (!enabled) return;
    const kyc = await this.kycRepo.findOne({ where: { userId } });
    if (!kyc || kyc.status !== KycStatusEnum.APPROVED) {
      throw new BadRequestException("برای برداشت ابتدا احراز هویت را تکمیل کنید");
    }
  }

  // Blocks withdrawal until the user has been registered for the minimum number
  // of hours defined by their level (WITHDRAW_MIN_HOURS_AFTER_REGISTER).
  private async enforceWithdrawCooldown(userId: string): Promise<void> {
    const hours = await this.userLevelService.getFeatureValue(userId, "WITHDRAW_MIN_HOURS_AFTER_REGISTER");
    const minHours = Number(hours);
    if (!minHours || minHours <= 0) return;

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user?.registeredAt) return;

    const elapsedHours = (Date.now() - new Date(user.registeredAt).getTime()) / 3600000;
    if (elapsedHours < minHours) {
      const remaining = Math.ceil(minHours - elapsedHours);
      throw new BadRequestException(
        `برداشت تا «${minHours}» ساعت پس از ثبت‌نام مجاز نیست. ${remaining} ساعت دیگر مجاز می‌شود.`
      );
    }
  }

  // Enforces per-transaction and daily withdrawal limits from the user's level
  // (amount 0 = unlimited).
  private async enforceWithdrawalLimits(userId: string, amount: number): Promise<void> {
    const perTx = await this.userLevelService.getFeatureValue(userId, "WALLET_WITHDRAWAL_PER_TX_LIMIT");
    const perTxLimit = typeof perTx === "object" ? Number(perTx?.amount) : Number(perTx);
    if (perTxLimit > 0 && amount > perTxLimit) {
      throw new BadRequestException(
        `حداکثر برداشت هر تراکنش در سطح شما ${perTxLimit.toLocaleString("fa-IR")} ریال است`
      );
    }

    const daily = await this.userLevelService.getFeatureValue(userId, "WALLET_WITHDRAWAL_DAILY_LIMIT");
    const dailyLimit = typeof daily === "object" ? Number(daily?.amount) : Number(daily);
    if (dailyLimit > 0) {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const [rows] = await this.withdrawRepo.query(
        `SELECT COALESCE(SUM(amount), 0) AS total
         FROM "withdraw"
         WHERE "user_id" = $1 AND "status" = 'COMPLETED' AND "created_at" >= $2`,
        [userId, start]
      );
      const todayTotal = Number(rows?.[0]?.total ?? 0);
      if (todayTotal + amount > dailyLimit) {
        throw new BadRequestException(
          `سقف برداشت روزانه این سطح ${dailyLimit.toLocaleString("fa-IR")} ریال است`
        );
      }
    }
  }
}
