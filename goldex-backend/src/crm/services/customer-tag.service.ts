import { Injectable, NotFoundException, ConflictException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { CustomerTagEntity } from "../entity/customer-tag.entity";
import { CustomerTagAssignmentEntity } from "../entity/customer-tag-assignment.entity";

@Injectable()
export class CustomerTagService {
  constructor(
    @InjectRepository(CustomerTagEntity)
    private readonly tagRepository: Repository<CustomerTagEntity>,
    @InjectRepository(CustomerTagAssignmentEntity)
    private readonly assignmentRepository: Repository<CustomerTagAssignmentEntity>,
  ) {}

  async create(name: string, color: string): Promise<CustomerTagEntity> {
    const existing = await this.tagRepository.findOne({ where: { name } });
    if (existing) throw new ConflictException("Tag already exists");
    return this.tagRepository.save(this.tagRepository.create({ name, color }));
  }

  async findAll(): Promise<CustomerTagEntity[]> {
    return this.tagRepository.find({ order: { name: "ASC" } });
  }

  async update(id: string, data: { name?: string; color?: string }): Promise<CustomerTagEntity> {
    const tag = await this.tagRepository.findOne({ where: { id } });
    if (!tag) throw new NotFoundException("Tag not found");
    if (data.name !== undefined) tag.name = data.name;
    if (data.color !== undefined) tag.color = data.color;
    return this.tagRepository.save(tag);
  }

  async remove(id: string): Promise<void> {
    await this.assignmentRepository.delete({ tagId: id });
    const result = await this.tagRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException("Tag not found");
  }

  async assignToUser(userId: string, tagId: string, adminId: string): Promise<CustomerTagAssignmentEntity> {
    const existing = await this.assignmentRepository.findOne({ where: { userId, tagId } });
    if (existing) return existing;
    return this.assignmentRepository.save(
      this.assignmentRepository.create({ userId, tagId, assignedById: adminId }),
    );
  }

  async unassignFromUser(userId: string, tagId: string): Promise<void> {
    await this.assignmentRepository.delete({ userId, tagId });
  }

  async getUserTags(userId: string): Promise<CustomerTagEntity[]> {
    const assignments = await this.assignmentRepository.find({
      where: { userId },
      relations: { tag: true },
    });
    return assignments.map((a) => a.tag);
  }

  async getUsersByTag(tagId: string): Promise<string[]> {
    const assignments = await this.assignmentRepository.find({
      where: { tagId },
    });
    return assignments.map((a) => a.userId);
  }
}
