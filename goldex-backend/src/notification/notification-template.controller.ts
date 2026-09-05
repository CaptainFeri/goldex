import { Controller, Get, Post, Patch, Delete, Param, Body, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { NotificationTemplateService } from "./notification-template.service";

@Controller("admin/notifications/templates")
@ApiTags("Admin-Notifications")
export class NotificationTemplateController {
  constructor(private readonly templateService: NotificationTemplateService) {}

  @Get()
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List notification templates" })
  async listTemplates() {
    return { data: await this.templateService.findAll() };
  }

  @Get(":slug")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get notification template by slug" })
  async getTemplate(@Param("slug") slug: string) {
    return { data: await this.templateService.findBySlug(slug) };
  }

  @Post()
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create notification template" })
  async createTemplate(@Body() dto: { slug: string; title: string; channelsConfig: Record<string, { enabled: boolean; subject?: string; body: string }> }) {
    return { data: await this.templateService.create(dto) };
  }

  @Patch(":slug")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update notification template" })
  async updateTemplate(
    @Param("slug") slug: string,
    @Body() dto: { title?: string; channelsConfig?: Record<string, { enabled: boolean; subject?: string; body: string }> },
  ) {
    return { data: await this.templateService.update(slug, dto) };
  }

  @Delete(":slug")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete notification template" })
  async deleteTemplate(@Param("slug") slug: string) {
    await this.templateService.remove(slug);
    return { data: { success: true } };
  }
}