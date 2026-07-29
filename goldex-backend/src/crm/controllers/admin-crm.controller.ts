import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, Req, DefaultValuePipe, ParseIntPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../../admin/auth/Guard/admin.guard";
import { CustomerNoteService } from "../services/customer-note.service";
import { SupportTicketService } from "../services/support-ticket.service";
import { TicketMessageService } from "../services/ticket-message.service";
import { CustomerTagService } from "../services/customer-tag.service";
import { CustomerSegmentService } from "../services/customer-segment.service";
import { CommunicationLogService } from "../services/communication-log.service";
import { Customer360Service } from "../services/customer-360.service";
import { NoteCategoryEnum } from "../entity/customer-note.entity";
import { TicketStatusEnum } from "../enum/ticket-status.enum";
import { TicketPriorityEnum } from "../enum/ticket-priority.enum";
import { TicketCategoryEnum } from "../enum/ticket-category.enum";

@Controller("admin/crm")
@ApiTags("Admin-CRM")
export class AdminCrmController {
  constructor(
    private readonly noteService: CustomerNoteService,
    private readonly ticketService: SupportTicketService,
    private readonly messageService: TicketMessageService,
    private readonly tagService: CustomerTagService,
    private readonly segmentService: CustomerSegmentService,
    private readonly communicationLogService: CommunicationLogService,
    private readonly customer360Service: Customer360Service,
  ) {}

  // ---- Customer 360 ----

  @Get("users/:userId/360")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Customer 360 view" })
  async getCustomer360(@Param("userId") userId: string) {
    return { data: await this.customer360Service.getCustomer360(userId) };
  }

  // ---- Notes ----

  @Get("users/:userId/notes")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get customer notes" })
  async getNotes(@Param("userId") userId: string) {
    return { data: await this.noteService.findByUser(userId) };
  }

  @Post("users/:userId/notes")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Add customer note" })
  async addNote(@Req() req: any, @Param("userId") userId: string, @Body() dto: { content: string; category?: NoteCategoryEnum }) {
    return { data: await this.noteService.create(userId, req.admin.id, dto.content, dto.category) };
  }

  @Patch("notes/:id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update customer note" })
  async updateNote(@Req() req: any, @Param("id") id: string, @Body() dto: { content?: string; category?: NoteCategoryEnum; isPinned?: boolean }) {
    return { data: await this.noteService.update(id, req.admin.id, dto) };
  }

  @Delete("notes/:id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete customer note" })
  async deleteNote(@Param("id") id: string) {
    await this.noteService.remove(id);
    return { data: { success: true } };
  }

  // ---- Tickets ----

  @Get("tickets")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiQuery({ name: "pageNumber", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiQuery({ name: "status", required: false, enum: TicketStatusEnum })
  @ApiQuery({ name: "priority", required: false, enum: TicketPriorityEnum })
  @ApiQuery({ name: "category", required: false, enum: TicketCategoryEnum })
  @ApiQuery({ name: "assignedTo", required: false, type: String })
  @ApiQuery({ name: "search", required: false, type: String })
  @ApiOperation({ summary: "List all tickets (admin)" })
  async getTickets(
    @Query("pageNumber", new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query("pageSize", new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
    @Query("status") status?: TicketStatusEnum,
    @Query("priority") priority?: TicketPriorityEnum,
    @Query("category") category?: TicketCategoryEnum,
    @Query("assignedTo") assignedTo?: string,
    @Query("search") search?: string,
  ) {
    return { data: await this.ticketService.findAdminTickets({ page, limit, status, priority, category, assignedTo, search }) };
  }

  @Get("tickets/stats")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Ticket statistics" })
  async getTicketStats() {
    return { data: await this.ticketService.getStats() };
  }

  @Get("tickets/:id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get ticket details (admin)" })
  async getTicketDetail(@Param("id") id: string) {
    const ticket = await this.ticketService.findById(id);
    const messages = await this.messageService.getMessages(id);
    return { data: { ...ticket, messages } };
  }

  @Patch("tickets/:id/assign")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Assign ticket to admin" })
  async assignTicket(@Req() req: any, @Param("id") id: string) {
    return { data: await this.ticketService.assign(id, req.admin.id) };
  }

  @Patch("tickets/:id/status")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update ticket status" })
  async updateTicketStatus(@Param("id") id: string, @Body() dto: { status: TicketStatusEnum }) {
    return { data: await this.ticketService.updateStatus(id, dto.status) };
  }

  @Post("tickets/:id/messages")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Add admin message to ticket" })
  async addTicketMessage(@Req() req: any, @Param("id") id: string, @Body() dto: { message: string; isInternal?: boolean; attachments?: any[] }) {
    return {
      data: await this.messageService.addMessage({
        ticketId: id,
        senderId: req.admin.id,
        senderType: "ADMIN",
        message: dto.message,
        attachments: dto.attachments,
        isInternal: dto.isInternal,
      }),
    };
  }

  // ---- Tags ----

  @Get("tags")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List all tags" })
  async getTags() {
    return { data: await this.tagService.findAll() };
  }

  @Post("tags")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create tag" })
  async createTag(@Body() dto: { name: string; color: string }) {
    return { data: await this.tagService.create(dto.name, dto.color) };
  }

  @Patch("tags/:id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update tag" })
  async updateTag(@Param("id") id: string, @Body() dto: { name?: string; color?: string }) {
    return { data: await this.tagService.update(id, dto) };
  }

  @Delete("tags/:id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete tag" })
  async deleteTag(@Param("id") id: string) {
    await this.tagService.remove(id);
    return { data: { success: true } };
  }

  @Get("users/:userId/tags")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get user tags" })
  async getUserTags(@Param("userId") userId: string) {
    return { data: await this.tagService.getUserTags(userId) };
  }

  @Post("users/:userId/tags/:tagId")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Assign tag to user" })
  async assignTag(@Req() req: any, @Param("userId") userId: string, @Param("tagId") tagId: string) {
    return { data: await this.tagService.assignToUser(userId, tagId, req.admin.id) };
  }

  @Delete("users/:userId/tags/:tagId")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Unassign tag from user" })
  async unassignTag(@Param("userId") userId: string, @Param("tagId") tagId: string) {
    await this.tagService.unassignFromUser(userId, tagId);
    return { data: { success: true } };
  }

  // ---- Segments ----

  @Get("segments")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List all segments" })
  async getSegments() {
    return { data: await this.segmentService.findAll() };
  }

  @Post("segments")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create segment" })
  async createSegment(@Req() req: any, @Body() dto: { name: string; description?: string; criteria: Record<string, any>; isDynamic?: boolean }) {
    return { data: await this.segmentService.create({ ...dto, createdById: req.admin.id }) };
  }

  @Patch("segments/:id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Update segment" })
  async updateSegment(@Param("id") id: string, @Body() dto: { name?: string; description?: string; criteria?: Record<string, any>; isDynamic?: boolean }) {
    return { data: await this.segmentService.update(id, dto) };
  }

  @Delete("segments/:id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete segment" })
  async deleteSegment(@Param("id") id: string) {
    await this.segmentService.remove(id);
    return { data: { success: true } };
  }

  @Post("segments/:id/evaluate")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Evaluate segment members" })
  async evaluateSegment(@Param("id") id: string) {
    return { data: await this.segmentService.evaluateSegment(id) };
  }

  @Post("segments/:id/assign")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Manually assign users to segment" })
  async assignToSegment(@Param("id") id: string, @Body() dto: { userIds: string[] }) {
    await this.segmentService.assignUsersManually(id, dto.userIds);
    return { data: { success: true } };
  }

  @Post("users/:userId/segments/:segmentId")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Assign user to segment" })
  async assignUserToSegment(@Param("userId") userId: string, @Param("segmentId") segmentId: string) {
    await this.segmentService.assignUsersManually(segmentId, [userId]);
    return { data: { success: true } };
  }

  @Delete("users/:userId/segments/:segmentId")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Unassign user from segment" })
  async unassignUserFromSegment(@Param("userId") userId: string, @Param("segmentId") segmentId: string) {
    await this.segmentService.unassignUser(segmentId, userId);
    return { data: { success: true } };
  }

  // ---- Communication Logs ----

  @Get("users/:userId/communications")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiQuery({ name: "pageNumber", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiOperation({ summary: "Get communication history for a user" })
  async getCommunications(
    @Param("userId") userId: string,
    @Query("pageNumber", new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query("pageSize", new DefaultValuePipe(50), ParseIntPipe) limit: number = 50,
  ) {
    return { data: await this.communicationLogService.findByUser(userId, page, limit) };
  }

  @Post("communications")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Manually log a communication" })
  async logCommunication(@Body() dto: {
    userId: string;
    channel: string;
    direction: string;
    subject?: string;
    body?: string;
    adminId?: string;
  }) {
    return { data: await this.communicationLogService.log(dto as any) };
  }
}
