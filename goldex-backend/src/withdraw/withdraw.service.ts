import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
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
  ) {}

  async create(userId: string, dto: CreateWithdrawDto): Promise<WithdrawEntity> {
    const symbol = await this.symbolRepo.findOne({ where: { id: dto.symbolId } });
    if (!symbol) throw new NotFoundException("Symbol not found");

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
    return this.withdrawRepo.save(withdraw);
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

      return this.findById(id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
