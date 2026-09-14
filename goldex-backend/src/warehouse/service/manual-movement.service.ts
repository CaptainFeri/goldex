import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { DataSource, Repository } from "typeorm";
import Decimal from "decimal.js";
import { PacketEntity } from "../entity/packet.entity";
import { WarehouseEntity } from "../entity/warehouse.entity";
import { WarehouseHistoryEntity } from "../entity/warehouse-history.entity";
import { WarehouseMovementEntity } from "../entity/warehouse-movement.entity";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { TransactionEntity } from "../../wallet/entities/transaction.entity";
import { TransactionTypeEnum } from "../../wallet/enum/transaction.type.enum";
import { TransactionStatusEnum } from "../../wallet/enum/transaction.status.enum";
import { UserEntity } from "../../user/entity/user.entity";
import { PacketStatusEnum } from "../enum/packet-status.enum";
import { WarehouseStatusEnum } from "../enum/warehouse-status.enum";
import { MovementDirectionEnum, MovementPartyEnum, MovementSourceEnum } from "../enum/movement.enum";
import { RecordMovementDto } from "../admin/dto/record-movement.dto";
import { computeNetWeight } from "../constants/warehouse.constants";
import { MovementService } from "./movement.service";
import { WarehouseService } from "./warehouse.service";
import { AdminAccountingService } from "../../admin-accounting/admin-accounting.service";
import {
  CustomerType,
  VoucherCategory,
  VoucherMovement,
  VoucherSource,
} from "../../admin-accounting/accounting.enums";

/**
 * Crossings an operator records by hand, for metal that moved with no request
 * behind it — a depositor who walked in, or material going back to a provider.
 *
 * Everything the request flow does still happens: the weight is re-derived from
 * the scale, the package joins the pool, the warehouse capacity moves, an
 * accounting entry is booked, and the ledger gets its row. What is missing is
 * only the paperwork, which is what makes these worth listing separately.
 */
@Injectable()
export class ManualMovementService {
  private readonly logger = new Logger(ManualMovementService.name);

  constructor(
    @InjectRepository(PacketEntity)
    private readonly packetRepository: Repository<PacketEntity>,
    @InjectRepository(WarehouseHistoryEntity)
    private readonly historyRepository: Repository<WarehouseHistoryEntity>,
    private readonly movementService: MovementService,
    private readonly warehouseService: WarehouseService,
    private readonly accounting: AdminAccountingService,
    private readonly dataSource: DataSource
  ) {}

  async record(dto: RecordMovementDto, adminId: string): Promise<WarehouseMovementEntity> {
    this.movementService.assertPartyResolved(dto);

    // Releasing metal to a user settles a claim against their wallet, which the
    // withdrawal flow does properly: it locks the balance up front and refunds
    // whatever the packages fall short by. A hand-typed outbound would skip all
    // of that and leave the wallet disagreeing with the vault.
    if (dto.direction === MovementDirectionEnum.OUT && dto.partyType === MovementPartyEnum.USER) {
      throw new BadRequestException(
        "USE_WITHDRAW_REQUEST: releasing material to a user goes through a withdrawal request, " +
          "which locks the balance and refunds the difference"
      );
    }

    return dto.direction === MovementDirectionEnum.IN
      ? this.recordInbound(dto, adminId)
      : this.recordOutbound(dto, adminId);
  }

  /**
   * Metal arriving without a deposit request.
   *
   * From a user this is a walk-in deposit and is worth exactly what a requested
   * one is: the confirmed net weight is credited to their wallet. From a
   * provider it is settlement material, which credits nobody — the platform
   * already owns it.
   */
  private async recordInbound(dto: RecordMovementDto, adminId: string): Promise<WarehouseMovementEntity> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const warehouse = await queryRunner.manager.findOne(WarehouseEntity, {
        where: { id: dto.warehouseId },
      });
      if (!warehouse) throw new NotFoundException("Warehouse not found");
      if (warehouse.status !== WarehouseStatusEnum.ACTIVE) {
        throw new BadRequestException(`Warehouse is not active (status: ${warehouse.status})`);
      }

      const netWeight = this.resolveNetWeight(dto);
      const wastage = new Decimal(dto.wastage ?? 0);

      const packet = await queryRunner.manager.save(
        queryRunner.manager.create(PacketEntity, {
          warehouseId: dto.warehouseId,
          symbolId: dto.symbolId,
          pureWeight: netWeight.toNumber(),
          apparentWeight: dto.apparentWeight ?? netWeight.toNumber(),
          ayar: dto.ayar,
          wastage: wastage.greaterThan(0) ? wastage.toNumber() : null,
          idSecure: `MAN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          dateTime: new Date(),
          deliveryTime: new Date(),
          // Straight onto the free shelf, like every other package: what a user
          // holds is the balance in their wallet, not this piece of metal.
          status: PacketStatusEnum.ORPHAN,
          isOrphan: true,
          userId: null,
          senderUserId: dto.partyType === MovementPartyEnum.USER ? dto.partyUserId : null,
          receivedByAdminId: adminId,
          providerKey: dto.partyType === MovementPartyEnum.PROVIDER ? dto.providerKey : null,
          warehouseIndexPosition: dto.warehouseIndexPosition,
        })
      );

      await this.warehouseService.updateCapacity(dto.warehouseId, netWeight.toNumber(), queryRunner);

      let voucherId: string | null = null;
      if (dto.partyType === MovementPartyEnum.USER) {
        voucherId = await this.creditDepositor(queryRunner, dto, netWeight, adminId, packet.id);
      }

      const movement = await this.movementService.record(queryRunner, {
        warehouseId: dto.warehouseId,
        direction: MovementDirectionEnum.IN,
        source: MovementSourceEnum.MANUAL,
        netWeight,
        symbolId: dto.symbolId,
        partyType: dto.partyType,
        partyUserId: dto.partyUserId,
        providerKey: dto.providerKey,
        packetIds: [packet.id],
        voucherId,
        adminId,
        notes: dto.notes,
        metadata: { wastage: wastage.toString(), apparentWeight: dto.apparentWeight, ayar: dto.ayar },
      });

      await this.addHistory(queryRunner, {
        warehouseId: dto.warehouseId,
        packetId: packet.id,
        action: "MANUAL_INBOUND",
        description:
          `Manual inbound of ${netWeight.toString()}g into ${warehouse.name} as package ${packet.idSecure}, ` +
          `from ${dto.partyType === MovementPartyEnum.USER ? `user ${dto.partyUserId}` : `provider ${dto.providerKey}`}`,
        performedBy: adminId,
        performedRole: "ADMIN",
        metadata: { movementId: movement?.id, voucherId, netWeight: netWeight.toString() },
      });

      await queryRunner.commitTransaction();
      this.logger.log(`Manual inbound ${netWeight.toString()}g recorded in ${dto.warehouseId} by admin ${adminId}`);

      return movement;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Manual inbound failed: ${(error as Error).message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Metal going back out to a provider.
   *
   * Takes a package off the shelf whole. No wallet is touched: a provider holds
   * no balance with the platform, and what they are owed is tracked by the
   * settlement rows instead.
   */
  private async recordOutbound(dto: RecordMovementDto, adminId: string): Promise<WarehouseMovementEntity> {
    if (!dto.packetId) {
      throw new BadRequestException("SELECT_PACKET: an outbound movement names the package leaving");
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const packet = await queryRunner.manager.findOne(PacketEntity, {
        where: { id: dto.packetId },
        lock: { mode: "pessimistic_write" },
      });

      if (!packet) throw new NotFoundException("Packet not found");
      if (packet.status !== PacketStatusEnum.ORPHAN) {
        throw new BadRequestException(
          `Package ${packet.idSecure} is not free to move (status: ${packet.status})`
        );
      }
      if (packet.warehouseId !== dto.warehouseId) {
        throw new BadRequestException(`Package ${packet.idSecure} is in another warehouse`);
      }

      const netWeight = new Decimal(packet.pureWeight);

      packet.status = PacketStatusEnum.WITHDRAWN;
      packet.deliveryTime = new Date();
      packet.deliveredByAdminId = adminId;
      await queryRunner.manager.save(packet);

      await this.warehouseService.updateCapacity(dto.warehouseId, -netWeight.toNumber(), queryRunner);

      const voucher = await this.accounting.issueSystemVoucher(
        {
          adminId,
          source: VoucherSource.PROVIDER_SETTLEMENT,
          category: VoucherCategory.CUSTOMER_SETTLEMENT,
          movement: VoucherMovement.WITHDRAW,
          symbolId: dto.symbolId ?? packet.symbolId,
          amount: netWeight.toString(),
          customerId: null,
          customerName: dto.providerKey,
          customerType: CustomerType.FORMAL,
          description: `خروج دستی انبار — تحویل ${netWeight.toString()} گرم به ${dto.providerKey}`,
          extraDescription: dto.notes ?? null,
        },
        queryRunner.manager
      );

      const movement = await this.movementService.record(queryRunner, {
        warehouseId: dto.warehouseId,
        direction: MovementDirectionEnum.OUT,
        source: MovementSourceEnum.MANUAL,
        netWeight,
        symbolId: dto.symbolId ?? packet.symbolId,
        partyType: MovementPartyEnum.PROVIDER,
        providerKey: dto.providerKey,
        packetIds: [packet.id],
        voucherId: voucher.id,
        adminId,
        notes: dto.notes,
      });

      await this.addHistory(queryRunner, {
        warehouseId: dto.warehouseId,
        packetId: packet.id,
        action: "MANUAL_OUTBOUND",
        description:
          `Manual outbound of package ${packet.idSecure} (${netWeight.toString()}g) to provider ${dto.providerKey}`,
        performedBy: adminId,
        performedRole: "ADMIN",
        metadata: { movementId: movement?.id, voucherId: voucher.id },
      });

      await queryRunner.commitTransaction();
      this.logger.log(`Manual outbound of ${packet.idSecure} to ${dto.providerKey} by admin ${adminId}`);

      return movement;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Manual outbound failed: ${(error as Error).message}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /** Credits a walk-in depositor exactly as a requested deposit would. */
  private async creditDepositor(
    queryRunner: any,
    dto: RecordMovementDto,
    netWeight: Decimal,
    adminId: string,
    packetId: string
  ): Promise<string> {
    const wallet = await queryRunner.manager.findOne(WalletEntity, {
      where: { userId: dto.partyUserId, symbolId: dto.symbolId },
      lock: { mode: "pessimistic_write" },
    });

    if (!wallet) {
      throw new NotFoundException("The depositor has no wallet for this symbol");
    }

    wallet.freeBalance = new Decimal(wallet.freeBalance).plus(netWeight).toNumber();
    await queryRunner.manager.save(wallet);

    const transaction = queryRunner.manager.create(TransactionEntity, {
      walletId: wallet.id,
      transactionId: `TXN-${crypto.randomUUID().split("-")[0].toUpperCase()}`,
      transactionType: TransactionTypeEnum.MATERIAL_DEPOSIT,
      status: TransactionStatusEnum.COMPLETED,
      amount: netWeight.toNumber(),
      fee: 0,
      completedAt: new Date(),
      description: `Manual warehouse inbound: ${netWeight.toString()} credited`,
      metadata: { packetId, recordedBy: adminId, source: "MANUAL_MOVEMENT" },
    });
    await queryRunner.manager.save(transaction);

    const user = await queryRunner.manager.findOne(UserEntity, { where: { id: dto.partyUserId } });
    const customerName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();

    const voucher = await this.accounting.issueSystemVoucher(
      {
        adminId,
        source: VoucherSource.WAREHOUSE_DEPOSIT,
        category: VoucherCategory.DEPOSIT_ENTRY,
        movement: VoucherMovement.DEPOSIT,
        symbolId: dto.symbolId,
        amount: netWeight.toString(),
        customerId: dto.partyUserId,
        customerName: customerName || user?.phone || dto.partyUserId,
        customerType: CustomerType.INFORMAL,
        description: `ورود دستی انبار — ${netWeight.toString()} گرم`,
        extraDescription: dto.notes ?? null,
      },
      queryRunner.manager
    );

    return voucher.id;
  }

  /**
   * Net weight (750) of what is on the scale.
   *
   * Re-derived from apparent weight and fineness whenever both were measured,
   * exactly as a requested deposit is — the scale is the authority, not what
   * anyone typed.
   */
  private resolveNetWeight(dto: RecordMovementDto): Decimal {
    if (dto.apparentWeight && dto.ayar) {
      return new Decimal(computeNetWeight(dto.apparentWeight, dto.ayar));
    }
    if (dto.netWeight) return new Decimal(dto.netWeight);

    throw new BadRequestException(
      "WEIGHT_REQUIRED: give either apparent weight and fineness, or a net weight"
    );
  }

  private async addHistory(queryRunner: any, data: Record<string, any>): Promise<void> {
    const repo = queryRunner
      ? queryRunner.manager.getRepository(WarehouseHistoryEntity)
      : this.historyRepository;
    await repo.save(repo.create(data));
  }
}
