import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, In, Not } from "typeorm";
import { CustomerSegmentEntity } from "../entity/customer-segment.entity";
import { CustomerSegmentAssignmentEntity } from "../entity/customer-segment-assignment.entity";
import { CustomerSegmentCombinationEntity, SegmentOperatorEnum } from "../entity/customer-segment-combination.entity";
import { UserEntity } from "../../user/entity/user.entity";
import { UserKycEntity } from "../../user/entity/user.kyc.entity";
import { CustomerTagAssignmentEntity } from "../entity/customer-tag-assignment.entity";
import { WalletEntity } from "../../wallet/entities/wallet.entity";
import { OrderEntity } from "../../order/order.entity";
import { OrderStatusEnum } from "../../order/enum/order.status.enum";
import { DepositEntity } from "../../deposit/deposit.entity";
import { DepositStatusEnum } from "../../deposit/enum/deposit-status.enum";
import { WithdrawEntity } from "../../withdraw/withdraw.entity";
import { WithdrawStatusEnum } from "../../withdraw/enum/withdraw-status.enum";

export interface SegmentMemberRow {
  userId: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  role?: number;
  registeredAt?: Date;
  kycStatus?: number;
  kycLevel?: number;
  totalBalance?: number;
  assignedAt?: Date;
}

export interface SegmentCriteria {
  roles?: number[];
  kycStatus?: number;
  kycLevel?: number;
  levelId?: string;
  hasBlocked?: boolean;
  emailVerified?: boolean;
  twoFactorActivated?: boolean;
  hasReferral?: boolean;
  createdAfter?: string;
  createdBefore?: string;
  hasTags?: string[];
  hasAnyTag?: string[];
  minTotalBalance?: number;
  maxTotalBalance?: number;
  hasOrders?: boolean;
  minOrderCount?: number;
  hasCompletedOrders?: boolean;
  hasDeposits?: boolean;
  minDepositCount?: number;
  minDepositTotal?: number;
  hasWithdraws?: boolean;
  minWithdrawCount?: number;
  minWithdrawTotal?: number;
  lastActiveAfter?: string;
  lastActiveBefore?: string;
}

@Injectable()
export class CustomerSegmentService {
  private readonly logger = new Logger(CustomerSegmentService.name);

  constructor(
    @InjectRepository(CustomerSegmentEntity)
    private readonly segmentRepository: Repository<CustomerSegmentEntity>,
    @InjectRepository(CustomerSegmentAssignmentEntity)
    private readonly assignmentRepository: Repository<CustomerSegmentAssignmentEntity>,
    @InjectRepository(CustomerSegmentCombinationEntity)
    private readonly combinationRepository: Repository<CustomerSegmentCombinationEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(UserKycEntity)
    private readonly kycRepository: Repository<UserKycEntity>,
    @InjectRepository(CustomerTagAssignmentEntity)
    private readonly tagAssignmentRepository: Repository<CustomerTagAssignmentEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>,
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,
    @InjectRepository(DepositEntity)
    private readonly depositRepository: Repository<DepositEntity>,
    @InjectRepository(WithdrawEntity)
    private readonly withdrawRepository: Repository<WithdrawEntity>,
    private readonly dataSource: DataSource,
  ) {}

  // ---- CRUD ----

  async create(dto: {
    name: string;
    description?: string;
    criteria: Record<string, any>;
    isDynamic?: boolean;
    createdById: string;
  }): Promise<CustomerSegmentEntity> {
    const segment = await this.segmentRepository.save(
      this.segmentRepository.create({
        name: dto.name,
        description: dto.description,
        criteria: dto.criteria || {},
        isDynamic: dto.isDynamic || false,
        createdById: dto.createdById,
      }),
    );
    if (segment.isDynamic) {
      await this.syncSegment(segment.id);
    }
    return segment;
  }

  async findAll(): Promise<CustomerSegmentEntity[]> {
    return this.segmentRepository.find({ order: { name: "ASC" } });
  }

  async findById(id: string): Promise<CustomerSegmentEntity> {
    const segment = await this.segmentRepository.findOne({ where: { id } });
    if (!segment) throw new NotFoundException("Segment not found");
    return segment;
  }

  async update(id: string, dto: { name?: string; description?: string; criteria?: Record<string, any>; isDynamic?: boolean }): Promise<CustomerSegmentEntity> {
    const segment = await this.findById(id);
    if (dto.name !== undefined) segment.name = dto.name;
    if (dto.description !== undefined) segment.description = dto.description;
    if (dto.criteria !== undefined) segment.criteria = dto.criteria;
    if (dto.isDynamic !== undefined) segment.isDynamic = dto.isDynamic;
    await this.segmentRepository.save(segment);
    if (segment.isDynamic) {
      await this.syncSegment(id);
    }
    return this.findById(id);
  }

  async remove(id: string): Promise<void> {
    await this.assignmentRepository.delete({ segmentId: id });
    const result = await this.segmentRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException("Segment not found");
  }

  // ---- Richer criteria evaluation ----

  async evaluateSegment(id: string): Promise<string[]> {
    const segment = await this.findById(id);
    const criteria: SegmentCriteria = segment.criteria || {};
    const qb = this.userRepository
      .createQueryBuilder("u")
      .select("u.id", "id")
      .leftJoin("u.kyc", "kyc")
      .leftJoin("u.level", "lvl")
      .where("1 = 1");

    if (criteria.roles?.length) {
      qb.andWhere("u.role IN (:...roles)", { roles: criteria.roles });
    }
    if (criteria.kycStatus !== undefined) {
      qb.andWhere("kyc.status = :kycStatus", { kycStatus: criteria.kycStatus });
    }
    if (criteria.kycLevel !== undefined) {
      qb.andWhere("kyc.level >= :kycLevel", { kycLevel: criteria.kycLevel });
    }
    if (criteria.levelId) {
      qb.andWhere("u.levelId = :levelId", { levelId: criteria.levelId });
    }
    if (criteria.hasBlocked !== undefined) {
      if (criteria.hasBlocked) {
        qb.andWhere("u.blockedAt IS NOT NULL");
      } else {
        qb.andWhere("u.blockedAt IS NULL");
      }
    }
    if (criteria.emailVerified !== undefined) {
      if (criteria.emailVerified) {
        qb.andWhere("u.emailVerifiedAt IS NOT NULL");
      } else {
        qb.andWhere("u.emailVerifiedAt IS NULL");
      }
    }
    if (criteria.twoFactorActivated !== undefined) {
      if (criteria.twoFactorActivated) {
        qb.andWhere("u.twoFactorActivatedAt IS NOT NULL");
      } else {
        qb.andWhere("u.twoFactorActivatedAt IS NULL");
      }
    }
    if (criteria.hasReferral !== undefined) {
      if (criteria.hasReferral) {
        qb.andWhere("u.ReferralId IS NOT NULL");
      } else {
        qb.andWhere("u.ReferralId IS NULL");
      }
    }
    if (criteria.createdAfter) {
      qb.andWhere("u.createAt >= :createdAfter", { createdAfter: new Date(criteria.createdAfter) });
    }
    if (criteria.createdBefore) {
      qb.andWhere("u.createAt <= :createdBefore", { createdBefore: new Date(criteria.createdBefore) });
    }
    if (criteria.lastActiveAfter) {
      qb.andWhere("u.updateAt >= :lastActiveAfter", { lastActiveAfter: new Date(criteria.lastActiveAfter) });
    }
    if (criteria.lastActiveBefore) {
      qb.andWhere("u.updateAt <= :lastActiveBefore", { lastActiveBefore: new Date(criteria.lastActiveBefore) });
    }

    // Tag-based criteria require membership checks against user ids.
    const tagCriterion = criteria.hasTags?.length ? criteria.hasTags : criteria.hasAnyTag;
    if (tagCriterion?.length) {
      const mode = criteria.hasTags?.length ? "ALL" : "ANY";
      const tagged = await this.findUserIdsByTags(tagCriterion, mode);
      if (tagged.length === 0) {
        return [];
      }
      qb.andWhere("u.id IN (:...tagged)", { tagged });
    }

    // Wallet balance criteria.
    if (criteria.minTotalBalance !== undefined || criteria.maxTotalBalance !== undefined) {
      const balanceSub = qb
        .subQuery()
        .select("w.userId", "userId")
        .from(WalletEntity, "w")
        .groupBy("w.userId")
        .addSelect("SUM(COALESCE(w.freeBalance, 0) + COALESCE(w.lockedBalance, 0))", "bal");
      if (criteria.minTotalBalance !== undefined) {
        balanceSub.having("SUM(COALESCE(w.freeBalance, 0) + COALESCE(w.lockedBalance, 0)) >= :minTotalBalance", {
          minTotalBalance: criteria.minTotalBalance,
        });
      }
      if (criteria.maxTotalBalance !== undefined) {
        balanceSub.having("SUM(COALESCE(w.freeBalance, 0) + COALESCE(w.lockedBalance, 0)) <= :maxTotalBalance", {
          maxTotalBalance: criteria.maxTotalBalance,
        });
      }
      qb.andWhere(`u.id IN ${balanceSub.getQuery()}`)
        .setParameters(balanceSub.getParameters());
    }

    // Order criteria.
    const orderCriterion = criteria.hasOrders !== undefined || criteria.minOrderCount !== undefined || criteria.hasCompletedOrders !== undefined;
    if (orderCriterion) {
      const orderSub = qb
        .subQuery()
        .select("o.userId", "userId")
        .from(OrderEntity, "o")
        .groupBy("o.userId")
        .addSelect("COUNT(o.id)", "cnt")
        .addSelect("SUM(CASE WHEN o.status = :completedStatus THEN 1 ELSE 0 END)", "completedCnt");
      if (criteria.minOrderCount !== undefined) {
        orderSub.having("COUNT(o.id) >= :minOrderCount", { minOrderCount: criteria.minOrderCount });
      }
      if (criteria.hasCompletedOrders === true) {
        orderSub.having("SUM(CASE WHEN o.status = :completedStatus THEN 1 ELSE 0 END) > 0");
      }
      if (criteria.hasCompletedOrders === false) {
        orderSub.having("SUM(CASE WHEN o.status = :completedStatus THEN 1 ELSE 0 END) = 0");
      }
      if (criteria.hasOrders === false) {
        qb.andWhere("u.id NOT IN " + orderSub.getQuery());
      } else {
        qb.andWhere(`u.id IN ${orderSub.getQuery()}`);
      }
      qb.setParameter("completedStatus", OrderStatusEnum.COMPLETED);
    }

    // Deposit criteria.
    const depositCriterion = criteria.hasDeposits !== undefined || criteria.minDepositCount !== undefined || criteria.minDepositTotal !== undefined;
    if (depositCriterion) {
      const depSub = qb
        .subQuery()
        .select("d.userId", "userId")
        .from(DepositEntity, "d")
        .where("d.status = :depStatus")
        .groupBy("d.userId")
        .addSelect("COUNT(d.id)", "cnt")
        .addSelect("SUM(COALESCE(d.amount, 0))", "total");
      if (criteria.minDepositCount !== undefined) {
        depSub.having("COUNT(d.id) >= :minDepositCount", { minDepositCount: criteria.minDepositCount });
      }
      if (criteria.minDepositTotal !== undefined) {
        depSub.having("SUM(COALESCE(d.amount, 0)) >= :minDepositTotal", { minDepositTotal: criteria.minDepositTotal });
      }
      if (criteria.hasDeposits === false) {
        qb.andWhere("u.id NOT IN " + depSub.getQuery());
      } else {
        qb.andWhere(`u.id IN ${depSub.getQuery()}`);
      }
      qb.setParameter("depStatus", DepositStatusEnum.COMPLETED);
    }

    // Withdraw criteria.
    const withdrawCriterion = criteria.hasWithdraws !== undefined || criteria.minWithdrawCount !== undefined || criteria.minWithdrawTotal !== undefined;
    if (withdrawCriterion) {
      const wdSub = qb
        .subQuery()
        .select("w.userId", "userId")
        .from(WithdrawEntity, "w")
        .where("w.status = :wdStatus")
        .groupBy("w.userId")
        .addSelect("COUNT(w.id)", "cnt")
        .addSelect("SUM(COALESCE(w.amount, 0))", "total");
      if (criteria.minWithdrawCount !== undefined) {
        wdSub.having("COUNT(w.id) >= :minWithdrawCount", { minWithdrawCount: criteria.minWithdrawCount });
      }
      if (criteria.minWithdrawTotal !== undefined) {
        wdSub.having("SUM(COALESCE(w.amount, 0)) >= :minWithdrawTotal", { minWithdrawTotal: criteria.minWithdrawTotal });
      }
      if (criteria.hasWithdraws === false) {
        qb.andWhere("u.id NOT IN " + wdSub.getQuery());
      } else {
        qb.andWhere(`u.id IN ${wdSub.getQuery()}`);
      }
      qb.setParameter("wdStatus", WithdrawStatusEnum.COMPLETED);
    }

    const rows = await qb.getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  private async findUserIdsByTags(tagIds: string[], mode: "ALL" | "ANY"): Promise<string[]> {
    const assignments = await this.tagAssignmentRepository.find({ where: { tagId: In(tagIds) } });
    const byUser: Record<string, string[]> = {};
    for (const a of assignments) {
      (byUser[a.userId] = byUser[a.userId] || []).push(a.tagId);
    }
    if (mode === "ANY") {
      return Object.keys(byUser);
    }
    return Object.keys(byUser).filter((uid) => tagIds.every((t) => byUser[uid].includes(t)));
  }

  // ---- Auto-sync of dynamic segments ----

  async syncSegment(id: string): Promise<{ memberCount: number }> {
    const segment = await this.findById(id);
    if (!segment.isDynamic) {
      throw new BadRequestException("Only dynamic segments can be auto-synced");
    }
    const memberIds = await this.evaluateSegment(id);
    const existing = await this.assignmentRepository.find({ where: { segmentId: id } });
    const existingSet = new Set(existing.map((a) => a.userId));
    const targetSet = new Set(memberIds);

    const toAdd = memberIds.filter((uid) => !existingSet.has(uid));
    const toRemove = existing.filter((a) => !targetSet.has(a.userId)).map((a) => a.userId);

    if (toAdd.length) {
      await this.assignmentRepository.save(
        toAdd.map((userId) => this.assignmentRepository.create({ segmentId: id, userId })),
      );
    }
    if (toRemove.length) {
      await this.assignmentRepository.delete({ segmentId: id, userId: In(toRemove) });
    }

    segment.lastSyncedAt = new Date();
    await this.segmentRepository.save(segment);

    this.logger.log(`Segment ${id} synced: ${targetSet.size} members (+${toAdd.length}, -${toRemove.length})`);
    return { memberCount: targetSet.size };
  }

  // ---- Manual assignment ----

  async assignUsersManually(segmentId: string, userIds: string[]): Promise<void> {
    const segment = await this.findById(segmentId);
    if (segment.isDynamic) {
      throw new BadRequestException("Dynamic segments are managed automatically; use sync instead");
    }
    for (const userId of userIds) {
      const existing = await this.assignmentRepository.findOne({ where: { segmentId, userId } });
      if (!existing) {
        await this.assignmentRepository.save(
          this.assignmentRepository.create({ segmentId, userId }),
        );
      }
    }
  }

  async getSegmentMembers(segmentId: string): Promise<string[]> {
    const assignments = await this.assignmentRepository.find({ where: { segmentId } });
    return assignments.map((a) => a.userId);
  }

  async getSegmentMembersPaginated(segmentId: string, page = 1, limit = 50): Promise<{ data: SegmentMemberRow[]; total: number }> {
    const segment = await this.findById(segmentId);
    const [rows, total] = await this.assignmentRepository.findAndCount({
      where: { segmentId },
      relations: { user: { kyc: true, level: true } },
      order: { assignedAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });

    const data: SegmentMemberRow[] = [];
    for (const a of rows) {
      let totalBalance = 0;
      const wallets = await this.walletRepository.find({ where: { userId: a.userId } });
      for (const w of wallets) {
        totalBalance += Number(w.freeBalance) + Number(w.lockedBalance);
      }
      data.push({
        userId: a.userId,
        firstName: a.user?.firstName,
        lastName: a.user?.lastName,
        email: a.user?.email,
        phone: a.user?.phone,
        role: a.user?.role,
        registeredAt: a.user?.registeredAt,
        kycStatus: a.user?.kyc?.status,
        kycLevel: a.user?.kyc?.level,
        totalBalance,
        assignedAt: a.assignedAt,
      });
    }
    return { data, total };
  }

  async getUserSegments(userId: string): Promise<CustomerSegmentEntity[]> {
    const assignments = await this.assignmentRepository.find({
      where: { userId },
      relations: { segment: true },
    });
    return assignments.map((a) => a.segment);
  }

  async unassignUser(segmentId: string, userId: string): Promise<void> {
    const segment = await this.findById(segmentId);
    if (segment.isDynamic) {
      throw new BadRequestException("Dynamic segments are managed automatically");
    }
    await this.assignmentRepository.delete({ segmentId, userId });
  }

  async clearMembers(segmentId: string): Promise<void> {
    await this.findById(segmentId);
    await this.assignmentRepository.delete({ segmentId });
  }

  // ---- Stats & insights ----

  async getSegmentStats(id: string): Promise<any> {
    const segment = await this.findById(id);
    const [total, dynamic] = await Promise.all([
      this.assignmentRepository.count({ where: { segmentId: id } }),
      segment.isDynamic ? this.evaluateSegment(id) : Promise.resolve([]),
    ]);
    const manual = await this.assignmentRepository.count({ where: { segmentId: id } });
    return {
      id: segment.id,
      name: segment.name,
      isDynamic: segment.isDynamic,
      lastSyncedAt: segment.lastSyncedAt,
      memberCount: total,
      dynamicMemberCount: segment.isDynamic ? dynamic.length : null,
      manualMemberCount: segment.isDynamic ? null : manual,
    };
  }

  // ---- Combinations ----

  async createCombination(dto: {
    name: string;
    description?: string;
    segmentIds: string[];
    operator: SegmentOperatorEnum;
    createdById: string;
  }): Promise<CustomerSegmentCombinationEntity> {
    if (dto.segmentIds.length < 2) {
      throw new BadRequestException("A combination requires at least 2 segments");
    }
    return this.combinationRepository.save(
      this.combinationRepository.create({
        name: dto.name,
        description: dto.description,
        segmentIds: dto.segmentIds,
        operator: dto.operator,
        createdById: dto.createdById,
      }),
    );
  }

  async findAllCombinations(): Promise<CustomerSegmentCombinationEntity[]> {
    return this.combinationRepository.find({ order: { createAt: "DESC" } });
  }

  async removeCombination(id: string): Promise<void> {
    const result = await this.combinationRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException("Combination not found");
  }

  async evaluateCombination(id: string): Promise<string[]> {
    const combo = await this.combinationRepository.findOne({ where: { id } });
    if (!combo) throw new NotFoundException("Combination not found");

    const memberSets = new Map<string, Set<string>>();
    for (const segmentId of combo.segmentIds) {
      const segment = await this.findById(segmentId);
      const members = segment.isDynamic
        ? await this.evaluateSegment(segmentId)
        : await this.getSegmentMembersRaw(segmentId);
      memberSets.set(segmentId, new Set(members));
    }

    const all = combo.segmentIds;
    let result = new Set<string>();
    if (combo.operator === SegmentOperatorEnum.UNION) {
      for (const s of all) {
        for (const uid of memberSets.get(s)!) result.add(uid);
      }
    } else if (combo.operator === SegmentOperatorEnum.INTERSECT) {
      const first = memberSets.get(all[0])!;
      for (const uid of first) {
        if (all.every((s) => memberSets.get(s)!.has(uid))) result.add(uid);
      }
    } else if (combo.operator === SegmentOperatorEnum.DIFFERENCE) {
      result = new Set(memberSets.get(all[0])!);
      for (let i = 1; i < all.length; i++) {
        for (const uid of memberSets.get(all[i])!) result.delete(uid);
      }
    }

    combo.lastSyncedAt = new Date();
    await this.combinationRepository.save(combo);
    return [...result];
  }

  private async getSegmentMembersRaw(segmentId: string): Promise<string[]> {
    const assignments = await this.assignmentRepository.find({ where: { segmentId } });
    return assignments.map((a) => a.userId);
  }
}