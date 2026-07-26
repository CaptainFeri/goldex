import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
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
import { getDefaultDepositTypes } from "../admin-symbol/constants/symbol-type-type-map";

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

    const deposit = this.depositRepo.create({
      userId,
      symbolId: dto.symbolId,
      type: dto.type,
      amount: dto.amount,
      notes: dto.notes,
      picturePath: dto.picturePath,
      metadata: dto.metadata,
      status: DepositStatusEnum.PENDING,
    });

    return this.depositRepo.save(deposit);
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
    return this.depositRepo.save(deposit);
  }

  async findAll(query: DepositQueryDto) {
    const { status, page = 1, limit = 20 } = query;
    const where: any = {};
    if (status) where.status = status;

    const [items, total] = await this.depositRepo.findAndCount({
      where,
      relations: { symbol: true, user: true },
      order: { createAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { items, total, page, limit };
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
      if (dto.status === DepositStatusEnum.COMPLETED || dto.status === DepositStatusEnum.FAILED) {
        deposit.completedAt = new Date();
      }

      if (dto.status === DepositStatusEnum.COMPLETED) {
        let wallet = await queryRunner.manager.findOne(WalletEntity, {
          where: { userId: deposit.userId, symbolId: deposit.symbolId },
          lock: { mode: "pessimistic_write" },
        });

        if (!wallet) {
          const symbol = await this.symbolRepo.findOne({ where: { id: deposit.symbolId } });
          if (!symbol) throw new NotFoundException("Symbol not found");
          wallet = queryRunner.manager.create(WalletEntity, {
            userId: deposit.userId,
            symbolId: deposit.symbolId,
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

      return this.findById(id);
    } catch (err) {
      await queryRunner.rollbackTransaction();
      throw err;
    } finally {
      await queryRunner.release();
    }
  }
}
