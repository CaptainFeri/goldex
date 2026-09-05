import { Controller, Get, Post, Param, Body, Query, UseGuards, Req, DefaultValuePipe, ParseIntPipe } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import { UserAuthGuard } from "../../user/auth/Guard/user.guard";
import { UserExpressRequest } from "../../user/auth/types/user-express-request";
import { SupportTicketService } from "../services/support-ticket.service";
import { TicketMessageService } from "../services/ticket-message.service";
import { TicketPriorityEnum } from "../enum/ticket-priority.enum";
import { TicketCategoryEnum } from "../enum/ticket-category.enum";

class CreateTicketDto {
  subject: string;
  description: string;
  priority?: TicketPriorityEnum;
  category?: TicketCategoryEnum;
}

class AddMessageDto {
  message: string;
  attachments?: { fileName: string; fileUrl: string; mimeType: string }[];
}

class SetSatisfactionDto {
  score: number;
}

@Controller("tickets")
@ApiTags("Tickets")
export class UserTicketController {
  constructor(
    private readonly ticketService: SupportTicketService,
    private readonly messageService: TicketMessageService,
  ) {}

  @Post()
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Create a support ticket" })
  async create(@Req() req: UserExpressRequest, @Body() dto: CreateTicketDto) {
    return {
      data: await this.ticketService.create({
        userId: req.user.id,
        ...dto,
      }),
    };
  }

  @Get()
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiQuery({ name: "pageNumber", required: false, type: Number })
  @ApiQuery({ name: "pageSize", required: false, type: Number })
  @ApiOperation({ summary: "Get user tickets" })
  async getMyTickets(
    @Req() req: UserExpressRequest,
    @Query("pageNumber", new DefaultValuePipe(1), ParseIntPipe) page: number = 1,
    @Query("pageSize", new DefaultValuePipe(20), ParseIntPipe) limit: number = 20,
  ) {
    return { data: await this.ticketService.findUserTickets(req.user.id, page, limit) };
  }

  @Get(":id")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get ticket details" })
  async getById(@Req() req: UserExpressRequest, @Param("id") id: string) {
    const ticket = await this.ticketService.findById(id);
    const messages = await this.messageService.getMessages(id);
    return { data: { ...ticket, messages } };
  }

  @Post(":id/messages")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Add message to ticket" })
  async addMessage(@Req() req: UserExpressRequest, @Param("id") id: string, @Body() dto: AddMessageDto) {
    return {
      data: await this.messageService.addMessage({
        ticketId: id,
        senderId: req.user.id,
        senderType: "USER",
        message: dto.message,
        attachments: dto.attachments,
      }),
    };
  }

  @Post(":id/satisfaction")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Set ticket satisfaction score" })
  async setSatisfaction(@Req() req: UserExpressRequest, @Param("id") id: string, @Body() dto: SetSatisfactionDto) {
    return { data: await this.ticketService.setSatisfaction(id, req.user.id, dto.score) };
  }
}
