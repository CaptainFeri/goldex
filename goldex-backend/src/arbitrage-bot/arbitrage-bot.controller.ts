import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  ApiAdminErrorResponses,
  ApiEnvelopeNoDataResponse,
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "../shared/swagger";
import {
  ArbitrageBotDto,
  ArbitrageBotEventDto,
  ArbitrageBotTradeDto,
} from "./dto/arbitrage-bot-response.dto";
import { ArbitrageBotService, BotActor } from "./arbitrage-bot.service";
import { ArbitrageBotEngineService } from "./arbitrage-bot-engine.service";
import { CreateArbitrageBotDto } from "./dto/create-arbitrage-bot.dto";
import { UpdateArbitrageBotDto } from "./dto/update-arbitrage-bot.dto";
import { AllocateCapitalDto, ReleaseCapitalDto } from "./dto/allocate-capital.dto";
import { ArbitrageBotStatusEnum } from "./enum/arbitrage-bot.enums";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminPermissionsGuard } from "../admin-role/guard/admin-permissions.guard";
import { RequirePermissions } from "../admin-role/guard/require-permissions.decorator";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";

@ApiTags("Admin-Arbitrage-Bots")
@ApiBearerAuth()
@ApiAdminErrorResponses()
@UseGuards(AdminAuthGuard, AdminPermissionsGuard)
@RequirePermissions("arbitrage")
@Controller("admin/arbitrage/bots")
export class ArbitrageBotController {
  constructor(
    private readonly bots: ArbitrageBotService,
    private readonly engine: ArbitrageBotEngineService
  ) {}

  @Get()
  @ApiOperation({ summary: "Arbitrage bots with their allocation and risk state" })
  @ApiEnvelopeResponse(ArbitrageBotDto, { isArray: true })
  async list(
    @Query("ownerAdminId") ownerAdminId?: string,
    @Query("status") status?: ArbitrageBotStatusEnum
  ) {
    return { data: await this.bots.list({ ownerAdminId, status }) };
  }

  @Post()
  @ApiOperation({
    summary: "Define a bot, optionally freezing capital from the owner's manager account",
  })
  @ApiEnvelopeResponse(ArbitrageBotDto, { status: 201 })
  async create(@Body() dto: CreateArbitrageBotDto, @Req() req: AdminExpressRequest) {
    const bot = await this.bots.create(dto, this.actor(req));
    this.engine.invalidate();
    return { data: await this.bots.get(bot.id) };
  }

  @Get(":id")
  @ApiOperation({ summary: "One bot with its allocation and risk state" })
  @ApiEnvelopeResponse(ArbitrageBotDto)
  async get(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.bots.get(id) };
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update scope, thresholds, execution mode or notifications" })
  @ApiEnvelopeResponse(ArbitrageBotDto)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateArbitrageBotDto,
    @Req() req: AdminExpressRequest
  ) {
    await this.bots.update(id, dto, this.actor(req));
    this.engine.invalidate();
    return { data: await this.bots.get(id) };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete a stopped bot, releasing any capital it still holds" })
  @ApiEnvelopeNoDataResponse()
  async remove(@Param("id", ParseUUIDPipe) id: string, @Req() req: AdminExpressRequest) {
    await this.bots.remove(id, this.actor(req));
    this.engine.invalidate();
    return { data: null };
  }

  @Post(":id/allocate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Freeze capital from the manager account into this bot" })
  @ApiEnvelopeResponse(ArbitrageBotDto)
  async allocate(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: AllocateCapitalDto,
    @Req() req: AdminExpressRequest
  ) {
    await this.bots.allocate(id, dto, this.actor(req));
    this.engine.invalidate();
    return { data: await this.bots.get(id) };
  }

  @Post(":id/release")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Return frozen capital to the manager account" })
  @ApiEnvelopeResponse(ArbitrageBotDto)
  async release(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReleaseCapitalDto,
    @Req() req: AdminExpressRequest
  ) {
    await this.bots.release(id, dto, this.actor(req));
    this.engine.invalidate();
    return { data: await this.bots.get(id) };
  }

  @Post(":id/start")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Start the bot evaluating live signals" })
  @ApiEnvelopeResponse(ArbitrageBotDto)
  async start(@Param("id", ParseUUIDPipe) id: string, @Req() req: AdminExpressRequest) {
    await this.bots.start(id, this.actor(req));
    this.engine.invalidate();
    return { data: await this.bots.get(id) };
  }

  @Post(":id/pause")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Pause the bot, leaving its allocation frozen" })
  @ApiEnvelopeResponse(ArbitrageBotDto)
  async pause(@Param("id", ParseUUIDPipe) id: string, @Req() req: AdminExpressRequest) {
    await this.bots.pause(id, this.actor(req));
    this.engine.invalidate();
    return { data: await this.bots.get(id) };
  }

  @Post(":id/stop")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Stop the bot and unfreeze whatever capital survived" })
  @ApiEnvelopeResponse(ArbitrageBotDto)
  async stop(@Param("id", ParseUUIDPipe) id: string, @Req() req: AdminExpressRequest) {
    await this.bots.stop(id, this.actor(req));
    this.engine.invalidate();
    return { data: await this.bots.get(id) };
  }

  @Get(":id/trades")
  @ApiOperation({ summary: "Trades this bot opened, newest first" })
  @ApiPaginatedResponse(ArbitrageBotTradeDto)
  async trades(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number
  ) {
    return { data: await this.bots.getTrades(id, limit, offset) };
  }

  @Get(":id/events")
  @ApiOperation({ summary: "The bot's own log, including which alerts went out" })
  @ApiPaginatedResponse(ArbitrageBotEventDto)
  async events(
    @Param("id", ParseUUIDPipe) id: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number
  ) {
    return { data: await this.bots.getEvents(id, limit, offset) };
  }

  /**
   * The acting admin. Ownership and senior-admin rules are enforced in the
   * service against this identity — a bot's allocation is one manager's money.
   */
  private actor(req: AdminExpressRequest): BotActor {
    const admin = (req as any).admin;
    if (!admin?.id) throw new UnauthorizedException("FORBIDDEN");
    return { id: admin.id, role: admin.role };
  }
}
