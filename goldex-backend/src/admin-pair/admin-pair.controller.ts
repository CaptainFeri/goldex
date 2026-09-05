import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { PricePairEntity } from "./entity/price.pair.entity";
import { AdminPairService } from "./admin-pair.service";
import { CreatePricePairDto } from "./dto/create-pair.dto";
import { UpdatePricePairDto } from "./dto/update-price-paird.dto";
import { UpdatePairRoutingDto } from "./dto/update-pair-routing.dto";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import {
  ApiAdminErrorResponses,
  ApiEnvelopeNoDataResponse,
  ApiEnvelopeResponse,
} from "../shared/swagger";
import { SymbolDto } from "../admin-symbol/dto/symbol-response.dto";
import {
  PairRequestsOverviewDto,
  PairRoutesDto,
  PricePairDto,
} from "./dto/pair-response.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";

@ApiTags("Admin-Price-Management")
@ApiAdminErrorResponses()
@Controller("admin/pair")
export class AdminPairController {
  constructor(private readonly pricePairService: AdminPairService) {}

  @Post()
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Create a trading pair" })
  @ApiEnvelopeResponse(PricePairDto, { status: 201 })
  async create(@Body() createPricePairDto: CreatePricePairDto): Promise<{ data: PricePairEntity }> {
    return { data: await this.pricePairService.create(createPricePairDto) };
  }

  @Get()
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "All trading pairs" })
  @ApiEnvelopeResponse(PricePairDto, { isArray: true })
  async findAll(): Promise<{ data: PricePairEntity[] }> {
    return { data: await this.pricePairService.findAll() };
  }

  @Get("routes")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Resolved buy and sell routes for every pair" })
  @ApiEnvelopeResponse(PairRoutesDto, { isArray: true })
  async getAllRoutes() {
    return { data: await this.pricePairService.getAllRoutes() };
  }

  @Get("bridge-candidates")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({
    summary: "Symbols usable as a pricing bridge",
    description: "Only pure scalars qualify, so the two legs' units cancel",
  })
  @ApiEnvelopeResponse(SymbolDto, { isArray: true })
  async getBridgeCandidates() {
    return { data: await this.pricePairService.getBridgeCandidates() };
  }

  @Get("valid")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Pairs currently tradable" })
  @ApiEnvelopeResponse(PricePairDto, { isArray: true })
  async getValidPairs(): Promise<{ data: PricePairEntity[] }> {
    return { data: await this.pricePairService.getValidPairs() };
  }

  @Get("base/:baseCode")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Pairs with this base symbol" })
  @ApiParam({ name: "baseCode", example: "XAU" })
  @ApiEnvelopeResponse(PricePairDto, { isArray: true })
  async findByBaseCode(@Param("baseCode") baseCode: string): Promise<{ data: PricePairEntity[] }> {
    return { data: await this.pricePairService.findByBaseCode(baseCode) };
  }

  @Get("quote/:quoteCode")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Pairs with this quote symbol" })
  @ApiParam({ name: "quoteCode", example: "IRR" })
  @ApiEnvelopeResponse(PricePairDto, { isArray: true })
  async findByQuoteCode(@Param("quoteCode") quoteCode: string): Promise<{ data: PricePairEntity[] }> {
    return { data: await this.pricePairService.findByQuoteCode(quoteCode) };
  }

  @Get(":id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Get one pair" })
  @ApiEnvelopeResponse(PricePairDto)
  async findOne(@Param("id", ParseUUIDPipe) id: string): Promise<{ data: PricePairEntity }> {
    return { data: await this.pricePairService.findOne(id) };
  }

  @Patch(":id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Edit a pair" })
  @ApiEnvelopeResponse(PricePairDto)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updatePricePairDto: UpdatePricePairDto
  ): Promise<{ data: PricePairEntity }> {
    return { data: await this.pricePairService.update(id, updatePricePairDto) };
  }

  @Patch(":id/price")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Set a pair's price manually" })
  @ApiEnvelopeResponse(PricePairDto)
  async updatePrice(
    @Param("id", ParseUUIDPipe) id: string,
    @Body("price") price: number
  ): Promise<{ data: PricePairEntity }> {
    return { data: await this.pricePairService.updatePrice(id, price) };
  }

  @Patch(":id/validity")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Take a pair in or out of trading" })
  @ApiEnvelopeResponse(PricePairDto)
  async toggleValidity(@Param("id", ParseUUIDPipe) id: string): Promise<{ data: PricePairEntity }> {
    return { data: await this.pricePairService.toggleValidity(id) };
  }

  @Get(":id/requests-overview")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Credit-linked orders and quote requests on this pair" })
  @ApiEnvelopeResponse(PairRequestsOverviewDto)
  async getRequestsOverview(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.pricePairService.getRequestsOverview(id) };
  }

  @Get(":id/route")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Resolved buy and sell routes for one pair" })
  @ApiEnvelopeResponse(PairRoutesDto)
  async getRoute(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.pricePairService.getRoutes(id) };
  }

  @Patch(":id/routing")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Set routing mode, bridge symbol and deviation limit" })
  @ApiEnvelopeResponse(PricePairDto)
  async updateRouting(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdatePairRoutingDto
  ): Promise<{ data: PricePairEntity }> {
    return { data: await this.pricePairService.updateRouting(id, dto) };
  }

  @Delete(":id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Delete a pair" })
  @ApiEnvelopeNoDataResponse({ description: "Deleted; the envelope's data is null" })
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<{ data: void }> {
    return { data: await this.pricePairService.remove(id) };
  }
}
