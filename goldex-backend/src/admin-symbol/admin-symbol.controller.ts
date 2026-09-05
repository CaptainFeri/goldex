import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards } from "@nestjs/common";
import { CreateSymbolDto } from "./dto/create-symbol.dto";
import { UpdateSymbolDto } from "./dto/update-symbol.dto";
import { SymbolTypeEnum } from "./enum/symbol.type.enum";
import { AdminSymbolService } from "./admin-symbol.service";
import { SymbolCapabilitiesService } from "./symbol-capabilities.service";
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from "@nestjs/swagger";
import {
  ApiAdminErrorResponses,
  ApiEnvelopeNoDataResponse,
  ApiEnvelopeResponse,
} from "../shared/swagger";
import { SymbolCapabilitiesDto, SymbolDto } from "./dto/symbol-response.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminRoles } from "../admin/role/admin.role.decorator";

@ApiTags("Admin-Symbol-Management")
@ApiAdminErrorResponses()
@Controller("admin/symbols")
export class AdminSymbolController {
  constructor(
    private readonly symbolService: AdminSymbolService,
    private readonly capabilities: SymbolCapabilitiesService
  ) {}

  /**
   * Everything the symbol form needs to render itself: the deposit/withdraw
   * types each symbol type allows, which of them need a gateway, and the
   * gateways actually registered in goldex-cbp with their health. The admin
   * panel keeps no copy of these rules.
   */
  @Get("capabilities")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Rules and live gateways the symbol form renders from" })
  @ApiEnvelopeResponse(SymbolCapabilitiesDto)
  async getCapabilities() {
    return { data: await this.capabilities.getCapabilities() };
  }

  @Get("active")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "All active symbols" })
  @ApiEnvelopeResponse(SymbolDto, { isArray: true })
  async findActive() {
    return { data: await this.symbolService.findActive() };
  }

  @Post()
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Create a symbol" })
  @ApiEnvelopeResponse(SymbolDto, { status: 201 })
  async create(@Body() createSymbolDto: CreateSymbolDto) {
    return { data: await this.symbolService.create(createSymbolDto) };
  }

  @Get("type/:type")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Symbols of one type" })
  @ApiParam({ name: "type", enum: SymbolTypeEnum })
  @ApiEnvelopeResponse(SymbolDto, { isArray: true })
  async findByType(@Param("type") type: SymbolTypeEnum) {
    return { data: await this.symbolService.findByType(type) };
  }

  @Get("slug/:slug")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Look a symbol up by its code" })
  @ApiParam({ name: "slug", example: "XAU" })
  @ApiEnvelopeResponse(SymbolDto)
  async findBySlug(@Param("slug") slug: string) {
    return { data: await this.symbolService.findBySlug(slug) };
  }

  @Get(":id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Get one symbol" })
  @ApiEnvelopeResponse(SymbolDto)
  async findOne(@Param("id") id: string) {
    return { data: await this.symbolService.findOne(id) };
  }

  @Patch(":id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Edit a symbol" })
  @ApiEnvelopeResponse(SymbolDto)
  async update(@Param("id") id: string, @Body() updateSymbolDto: UpdateSymbolDto) {
    return { data: await this.symbolService.update(id, updateSymbolDto) };
  }

  @Patch(":id/status")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Activate or deactivate a symbol" })
  @ApiEnvelopeResponse(SymbolDto)
  async updateStatus(@Param("id") id: string, @Body("isActive") isActive: boolean) {
    return { data: await this.symbolService.updateStatus(id, isActive) };
  }

  @Delete(":id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Delete a symbol" })
  @ApiEnvelopeNoDataResponse({ description: "Deleted; the envelope's data is null" })
  async remove(@Param("id") id: string) {
    return { data: await this.symbolService.remove(id) };
  }
}
