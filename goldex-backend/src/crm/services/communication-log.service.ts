import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OnEvent } from "@nestjs/event-emitter";
import { CommunicationLogEntity, CommunicationStatusEnum } from "../entity/communication-log.entity";
import { CommunicationChannelEnum } from "../enum/communication-channel.enum";
import { CommunicationDirectionEnum } from "../enum/communication-direction.enum";

@Injectable()
export class CommunicationLogService {
  private readonly logger = new Logger(CommunicationLogService.name);

  constructor(
    @InjectRepository(CommunicationLogEntity)
    private readonly logRepository: Repository<CommunicationLogEntity>,
  ) {}

  async log(dto: {
    userId: string;
    channel: CommunicationChannelEnum;
    direction: CommunicationDirectionEnum;
    subject?: string;
    body?: string;
    templateSlug?: string;
    status?: CommunicationStatusEnum;
    externalId?: string;
    adminId?: string;
  }): Promise<CommunicationLogEntity> {
    return this.logRepository.save(
      this.logRepository.create({
        userId: dto.userId,
        channel: dto.channel,
        direction: dto.direction,
        subject: dto.subject,
        body: dto.body,
        templateSlug: dto.templateSlug,
        status: dto.status || CommunicationStatusEnum.SENT,
        externalId: dto.externalId,
        adminId: dto.adminId,
      }),
    );
  }

  async findByUser(userId: string, page: number = 1, limit: number = 50) {
    const [data, total] = await this.logRepository.findAndCount({
      where: { userId },
      order: { sentAt: "DESC" },
      skip: (page - 1) * limit,
      take: limit,
      relations: { admin: true },
    });
    return { data, total };
  }

  @OnEvent("notification.sent")
  async handleNotificationSent(payload: { userId: string; channel: string; subject?: string; body?: string; externalId?: string; templateSlug?: string }) {
    try {
      await this.log({
        userId: payload.userId,
        channel: payload.channel as CommunicationChannelEnum,
        direction: CommunicationDirectionEnum.OUTBOUND,
        subject: payload.subject,
        body: payload.body,
        templateSlug: payload.templateSlug,
        externalId: payload.externalId,
      });
    } catch (error) {
      this.logger.error(`Failed to log communication: ${(error as Error).message}`);
    }
  }
}
