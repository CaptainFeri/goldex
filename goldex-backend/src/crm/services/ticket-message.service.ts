import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { TicketMessageEntity } from "../entity/ticket-message.entity";
import { SupportTicketEntity } from "../entity/support-ticket.entity";

@Injectable()
export class TicketMessageService {
  constructor(
    @InjectRepository(TicketMessageEntity)
    private readonly messageRepository: Repository<TicketMessageEntity>,
    @InjectRepository(SupportTicketEntity)
    private readonly ticketRepository: Repository<SupportTicketEntity>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async addMessage(dto: {
    ticketId: string;
    senderId: string;
    senderType: "USER" | "ADMIN";
    message: string;
    attachments?: { fileName: string; fileUrl: string; mimeType: string }[];
    isInternal?: boolean;
  }): Promise<TicketMessageEntity> {
    const ticket = await this.ticketRepository.findOne({ where: { id: dto.ticketId } });
    if (!ticket) throw new NotFoundException("Ticket not found");

    const msg = this.messageRepository.create({
      ticketId: dto.ticketId,
      senderId: dto.senderId,
      senderType: dto.senderType,
      message: dto.message,
      attachments: dto.attachments || [],
      isInternal: dto.isInternal || false,
    });
    const saved = await this.messageRepository.save(msg);

    this.eventEmitter.emit("ticket.message_added", {
      ticketId: dto.ticketId,
      senderType: dto.senderType,
      messageId: saved.id,
    });

    return saved;
  }

  async getMessages(ticketId: string): Promise<TicketMessageEntity[]> {
    return this.messageRepository.find({
      where: { ticketId },
      order: { createAt: "ASC" },
    });
  }
}
