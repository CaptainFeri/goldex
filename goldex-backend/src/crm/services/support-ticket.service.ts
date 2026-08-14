import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { SupportTicketEntity } from "../entity/support-ticket.entity";
import { TicketMessageEntity } from "../entity/ticket-message.entity";
import { TicketPriorityEnum } from "../enum/ticket-priority.enum";
import { TicketStatusEnum } from "../enum/ticket-status.enum";
import { TicketCategoryEnum } from "../enum/ticket-category.enum";
import { TicketSourceEnum } from "../enum/ticket-source.enum";
import { TicketEvents } from "../../shared/constants/events.constants";

@Injectable()
export class SupportTicketService {
  private readonly logger = new Logger(SupportTicketService.name);

  constructor(
    @InjectRepository(SupportTicketEntity)
    private readonly ticketRepository: Repository<SupportTicketEntity>,
    @InjectRepository(TicketMessageEntity)
    private readonly messageRepository: Repository<TicketMessageEntity>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: {
    userId: string;
    subject: string;
    description: string;
    priority?: TicketPriorityEnum;
    category?: TicketCategoryEnum;
    source?: TicketSourceEnum;
  }): Promise<SupportTicketEntity> {
    const ticket = this.ticketRepository.create({
      userId: dto.userId,
      subject: dto.subject,
      description: dto.description,
      priority: dto.priority || TicketPriorityEnum.MEDIUM,
      category: dto.category || TicketCategoryEnum.OTHER,
      source: dto.source || TicketSourceEnum.USER_PANEL,
      status: TicketStatusEnum.OPEN,
    });
    const saved = await this.ticketRepository.save(ticket);
    this.eventEmitter.emit(TicketEvents.CREATED, { ticketId: saved.id, userId: saved.userId, subject: saved.subject });
    return saved;
  }

  async findUserTickets(userId: string, page: number = 1, limit: number = 20) {
    const [data, total] = await this.ticketRepository.findAndCount({
      where: { userId },
      order: { createAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async findAdminTickets(query: {
    page?: number;
    limit?: number;
    status?: TicketStatusEnum;
    priority?: TicketPriorityEnum;
    category?: TicketCategoryEnum;
    assignedTo?: string;
    search?: string;
  }) {
    const qb = this.ticketRepository.createQueryBuilder("t")
      .leftJoinAndSelect("t.user", "user")
      .leftJoinAndSelect("t.assignedTo", "admin")
      .orderBy("t.createAt", "DESC");

    if (query.status) qb.andWhere("t.status = :status", { status: query.status });
    if (query.priority) qb.andWhere("t.priority = :priority", { priority: query.priority });
    if (query.category) qb.andWhere("t.category = :category", { category: query.category });
    if (query.assignedTo) qb.andWhere("t.assignedToId = :assignedTo", { assignedTo: query.assignedTo });
    if (query.search) {
      qb.andWhere("(t.subject ILIKE :search OR user.firstName ILIKE :search OR user.lastName ILIKE :search)", { search: `%${query.search}%` });
    }

    const page = query.page || 1;
    const limit = query.limit || 20;
    qb.skip((page - 1) * limit).take(limit);

    const [data, total] = await qb.getManyAndCount();
    return { data, total };
  }

  async findById(ticketId: string): Promise<SupportTicketEntity> {
    const ticket = await this.ticketRepository.findOne({
      where: { id: ticketId },
      relations: { user: true, assignedTo: true, messages: true },
    });
    if (!ticket) throw new NotFoundException("Ticket not found");
    return ticket;
  }

  async assign(ticketId: string, adminId: string): Promise<SupportTicketEntity> {
    const ticket = await this.findById(ticketId);
    ticket.assignedToId = adminId;
    ticket.status = TicketStatusEnum.IN_PROGRESS;
    const saved = await this.ticketRepository.save(ticket);
    this.eventEmitter.emit(TicketEvents.ASSIGNED, { ticketId, adminId, userId: ticket.userId });
    return saved;
  }

  async updateStatus(ticketId: string, status: TicketStatusEnum): Promise<SupportTicketEntity> {
    const ticket = await this.findById(ticketId);
    ticket.status = status;
    if (status === TicketStatusEnum.RESOLVED) ticket.resolvedAt = new Date();
    if (status === TicketStatusEnum.CLOSED) ticket.closedAt = new Date();
    if (status === TicketStatusEnum.IN_PROGRESS && !ticket.firstResponseAt) {
      ticket.firstResponseAt = new Date();
    }
    const saved = await this.ticketRepository.save(ticket);
    this.eventEmitter.emit(TicketEvents.STATUS_CHANGED, { ticketId, status, userId: ticket.userId });
    return saved;
  }

  async setSatisfaction(ticketId: string, userId: string, score: number): Promise<SupportTicketEntity> {
    const ticket = await this.ticketRepository.findOne({ where: { id: ticketId, userId } });
    if (!ticket) throw new NotFoundException("Ticket not found");
    ticket.satisfactionScore = score;
    return this.ticketRepository.save(ticket);
  }

  async getStats() {
    const total = await this.ticketRepository.count();
    const open = await this.ticketRepository.count({ where: { status: TicketStatusEnum.OPEN } });
    const inProgress = await this.ticketRepository.count({ where: { status: TicketStatusEnum.IN_PROGRESS } });
    const resolved = await this.ticketRepository.count({ where: { status: TicketStatusEnum.RESOLVED } });
    const closed = await this.ticketRepository.count({ where: { status: TicketStatusEnum.CLOSED } });
    const avgSatisfaction = await this.ticketRepository
      .createQueryBuilder("t")
      .select("AVG(t.satisfactionScore)", "avg")
      .where("t.satisfactionScore IS NOT NULL")
      .getRawOne();

    const byCategory = await this.ticketRepository
      .createQueryBuilder("t")
      .select("t.category", "category")
      .addSelect("COUNT(*)", "count")
      .groupBy("t.category")
      .getRawMany();

    return { total, open, inProgress, resolved, closed, avgSatisfaction: Number(avgSatisfaction?.avg || 0), byCategory };
  }
}
