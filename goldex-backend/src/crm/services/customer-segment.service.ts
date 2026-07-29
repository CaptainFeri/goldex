import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CustomerSegmentEntity } from "../entity/customer-segment.entity";
import { CustomerSegmentAssignmentEntity } from "../entity/customer-segment-assignment.entity";
import { UserEntity } from "../../user/entity/user.entity";

@Injectable()
export class CustomerSegmentService {
  constructor(
    @InjectRepository(CustomerSegmentEntity)
    private readonly segmentRepository: Repository<CustomerSegmentEntity>,
    @InjectRepository(CustomerSegmentAssignmentEntity)
    private readonly assignmentRepository: Repository<CustomerSegmentAssignmentEntity>,
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async create(dto: {
    name: string;
    description?: string;
    criteria: Record<string, any>;
    isDynamic?: boolean;
    createdById: string;
  }): Promise<CustomerSegmentEntity> {
    return this.segmentRepository.save(
      this.segmentRepository.create({
        name: dto.name,
        description: dto.description,
        criteria: dto.criteria,
        isDynamic: dto.isDynamic || false,
        createdById: dto.createdById,
      }),
    );
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
    return this.segmentRepository.save(segment);
  }

  async remove(id: string): Promise<void> {
    await this.assignmentRepository.delete({ segmentId: id });
    const result = await this.segmentRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException("Segment not found");
  }

  async evaluateSegment(id: string): Promise<string[]> {
    const segment = await this.findById(id);
    const criteria = segment.criteria;
    const qb = this.userRepository.createQueryBuilder("u");

    if (criteria.roles) {
      qb.andWhere("u.role IN (:...roles)", { roles: criteria.roles });
    }
    if (criteria.kycStatus !== undefined) {
      qb.innerJoin("u.kyc", "kyc").andWhere("kyc.status = :kycStatus", { kycStatus: criteria.kycStatus });
    }
    if (criteria.hasBlocked !== undefined) {
      if (criteria.hasBlocked) {
        qb.andWhere("u.blockedAt IS NOT NULL");
      } else {
        qb.andWhere("u.blockedAt IS NULL");
      }
    }
    if (criteria.createdAfter) {
      qb.andWhere("u.createAt >= :createdAfter", { createdAfter: new Date(criteria.createdAfter) });
    }
    if (criteria.createdBefore) {
      qb.andWhere("u.createAt <= :createdBefore", { createdBefore: new Date(criteria.createdBefore) });
    }

    const users = await qb.select("u.id").getMany();
    return users.map((u) => u.id);
  }

  async assignUsersManually(segmentId: string, userIds: string[]): Promise<void> {
    const segment = await this.findById(segmentId);
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

  async getUserSegments(userId: string): Promise<CustomerSegmentEntity[]> {
    const assignments = await this.assignmentRepository.find({
      where: { userId },
      relations: { segment: true },
    });
    return assignments.map((a) => a.segment);
  }

  async unassignUser(segmentId: string, userId: string): Promise<void> {
    await this.assignmentRepository.delete({ segmentId, userId });
  }
}
