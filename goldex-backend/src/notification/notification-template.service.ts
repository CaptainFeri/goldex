import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { NotificationTemplateEntity } from "./entity/notification-template.entity";
import { NotificationChannelEnum } from "./enum/notification-channel.enum";

export interface RenderedTemplate {
  title: string;
  body: string;
}

@Injectable()
export class NotificationTemplateService {
  constructor(
    @InjectRepository(NotificationTemplateEntity)
    private readonly templateRepository: Repository<NotificationTemplateEntity>,
  ) {}

  async findAll(): Promise<NotificationTemplateEntity[]> {
    return this.templateRepository.find({ order: { slug: "ASC" } });
  }

  async findBySlug(slug: string): Promise<NotificationTemplateEntity> {
    const template = await this.templateRepository.findOne({ where: { slug } });
    if (!template) throw new NotFoundException(`Notification template "${slug}" not found`);
    return template;
  }

  async create(dto: {
    slug: string;
    title: string;
    channelsConfig: Record<string, { enabled: boolean; subject?: string; body: string }>;
  }): Promise<NotificationTemplateEntity> {
    return this.templateRepository.save(this.templateRepository.create(dto));
  }

  async update(
    slug: string,
    dto: Partial<{
      title: string;
      channelsConfig: Record<string, { enabled: boolean; subject?: string; body: string }>;
    }>,
  ): Promise<NotificationTemplateEntity> {
    const template = await this.findBySlug(slug);
    if (dto.title !== undefined) template.title = dto.title;
    if (dto.channelsConfig !== undefined) template.channelsConfig = dto.channelsConfig;
    return this.templateRepository.save(template);
  }

  async remove(slug: string): Promise<void> {
    const result = await this.templateRepository.delete({ slug });
    if (result.affected === 0) throw new NotFoundException(`Notification template "${slug}" not found`);
  }

  /**
   * Renders the subject/body for a given channel from a template, applying
   * variable interpolation on `{{key}}` placeholders. Returns null when the
   * channel is not configured or is disabled.
   */
  async render(
    slug: string,
    channel: NotificationChannelEnum,
    variables: Record<string, any> = {},
  ): Promise<RenderedTemplate | null> {
    const template = await this.findBySlug(slug);
    const config = template.channelsConfig?.[channel];
    if (!config || config.enabled === false) return null;

    return {
      title: this.interpolate(config.subject ?? template.title, variables),
      body: this.interpolate(config.body, variables),
    };
  }

  private interpolate(text: string, variables: Record<string, any>): string {
    return String(text).replace(/\{\{(\w+)\}\}/g, (match, key: string) =>
      variables[key] !== undefined ? String(variables[key]) : match,
    );
  }
}
