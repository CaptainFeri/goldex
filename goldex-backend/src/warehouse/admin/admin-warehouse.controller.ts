import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Req,
  Res,
  StreamableFile,
  BadRequestException,
} from "@nestjs/common";
import { Response } from "express";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from "@nestjs/swagger";
import { FileInterceptor, FileFieldsInterceptor } from "@nestjs/platform-express";
import { AdminAuthGuard } from "../../admin/auth/Guard/admin.guard";
import { AdminWorkTimeGuard } from "../../admin-schedule/admin-work-time.guard";
import { AdminPermissionsGuard } from "../../admin-role/guard/admin-permissions.guard";
import { RequirePermissions } from "../../admin-role/guard/require-permissions.decorator";
import { WarehouseService } from "../service/warehouse.service";
import { PacketService } from "../service/packet.service";
import { ConfirmMaterialInput, WarehouseRequestService } from "../service/warehouse-request.service";
import { ConfirmMaterialPartDto } from "./dto/confirm-material.dto";
import { MovementService } from "../service/movement.service";
import { ManualMovementService } from "../service/manual-movement.service";
import { RecordMovementDto } from "./dto/record-movement.dto";
import { MovementQueryDto } from "./dto/movement-query.dto";
import { AdminCreateWarehouseDto } from "./dto/admin-create-warehouse.dto";
import { AdminUpdateWarehouseDto } from "./dto/admin-update-warehouse.dto";
import { AdminCreatePacketDto } from "./dto/admin-create-packet.dto";
import { AdminUpdatePacketDto } from "./dto/admin-update-packet.dto";
import { AdminProcessRequestDto } from "./dto/admin-process-request.dto";
import { AdminWarehouseQueryDto } from "./dto/admin-warehouse-query.dto";
import { AdminRequestQueryDto } from "./dto/admin-request-query.dto";
import { PacketQueryDto } from "../dto/packet-query.dto";
import { CreateSettlementPacketDto } from "./dto/create-settlement-packet.dto";
import { ApproveWithdrawOutputDto } from "./dto/approve-withdraw-output.dto";
import { AdminExpressRequest } from "../../admin/auth/types/adminExpressRequest";
import { ApplyAllocationDto } from "./dto/apply-allocation.dto";
import { SplitPacketDto } from "./dto/split-packet.dto";

@ApiTags("Admin - Warehouse")
@ApiBearerAuth()
/**
 * Every route here moves metal, credits a wallet or books an entry, so the
 * whole controller is gated on the `warehouse` permission rather than the
 * routes being gated one at a time.
 *
 * Permission rather than the legacy role enum: `AdminRolesGuard` compares
 * `Math.max` of the required roles against the caller's rank, so naming
 * superAdmin, admin and warehouse together would demand the *highest* of the
 * three and lock out the two below it — the opposite of listing them. The
 * permission is held by exactly superAdmin, admin and warehouse, and not by
 * finance, which is the set intended.
 */
@UseGuards(AdminAuthGuard, AdminPermissionsGuard, AdminWorkTimeGuard)
@RequirePermissions("warehouse")
@Controller("admin/warehouse")
export class AdminWarehouseController {
  constructor(
    private readonly warehouseService: WarehouseService,
    private readonly packetService: PacketService,
    private readonly requestService: WarehouseRequestService,
    private readonly movementService: MovementService,
    private readonly manualMovementService: ManualMovementService
  ) {}
  @Get("all")
  @ApiOperation({ summary: "List all warehouses (Admin)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns all warehouses" })
  async getAllWarehouses(@Query() query: AdminWarehouseQueryDto) {
    return { data: await this.warehouseService.findAll(query) };
  }

  @Post("create")
  @ApiOperation({ summary: "Create warehouse" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Warehouse created" })
  async createWarehouse(@Body() dto: AdminCreateWarehouseDto) {
    return { data: await this.warehouseService.create(dto) };
  }

  @Get("overview")
  @ApiOperation({ summary: "Warehouse overview dashboard (warehouses, packets, requests stats)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns warehouse overview stats" })
  async getOverview() {
    return { data: await this.warehouseService.getOverview() };
  }

  // -- Packet routes (static before parameterized) --

  @Post("packets")
  @ApiOperation({ summary: "Create packet (admin settlement / add to warehouse)" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Packet created" })
  @ApiConsumes("multipart/form-data")
  @ApiBody({ type: AdminCreatePacketDto })
  @UseInterceptors(FileInterceptor("picture"))
  async createPacket(@Req() req: AdminExpressRequest, @Body() dto: AdminCreatePacketDto, @UploadedFile() picture?: Express.Multer.File) {
    const adminId = req.admin["id"];
    return { data: await this.packetService.create(dto, adminId, picture) };
  }

  @Get("packets")
  @ApiOperation({ summary: "List all packets (Admin)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns all packets" })
  async getAllPackets(@Query() query: PacketQueryDto) {
    return { data: await this.packetService.findAll(query) };
  }

  @Post("packets/:id/split")
  @ApiOperation({
    summary: "Split a package into several child packages (mass conservation: sum(parts) + wastage == parent)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Package split, children created" })
  async splitPacket(
    @Req() req: AdminExpressRequest,
    @Param("id") id: string,
    @Body() dto: SplitPacketDto
  ) {
    const adminId = req.admin["id"];
    return { data: await this.packetService.splitWithParts(id, dto.parts, dto.wastage ?? 0, adminId) };
  }

  @Post("packets/:id/picture")
  @ApiOperation({ summary: "Upload packet picture" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("picture"))
  async uploadPacketPicture(@Param("id") id: string, @UploadedFile() picture: Express.Multer.File) {
    return { data: await this.packetService.uploadPicture(id, picture) };
  }

  @Get("packets/:id/picture")
  @ApiOperation({ summary: "Download packet picture" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns the picture file stream" })
  async downloadPacketPicture(@Res({ passthrough: true }) res: Response, @Param("id") id: string) {
    const stream = await this.packetService.getPictureStream(id);
    const stat = await this.packetService.getPictureStat(id);
    res.set({
      "Content-Type": stat.contentType,
      "Content-Length": stat.size.toString(),
      "Content-Disposition": `inline; filename="${id}-picture"`,
    });
    return new StreamableFile(stream);
  }

  @Get("packets/:id")
  @ApiOperation({ summary: "Get packet by ID (Admin)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns packet details" })
  async getPacket(@Param("id") id: string) {
    return { data: await this.packetService.findById(id) };
  }

  @Put("packets/:id")
  @ApiOperation({ summary: "Update packet (Admin)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Packet updated" })
  async updatePacket(@Param("id") id: string, @Body() dto: AdminUpdatePacketDto) {
    return { data: await this.packetService.update(id, dto) };
  }

  @Delete("packets/:id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete packet (Admin)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Packet deleted" })
  async deletePacket(@Param("id") id: string) {
    await this.packetService.remove(id);
    return { message: "Packet deleted successfully" };
  }

  // -- Request routes (static before parameterized) --

  @Get("requests")
  @ApiOperation({ summary: "List all requests (Admin)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns all requests" })
  async getAllRequests(@Query() query: AdminRequestQueryDto) {
    return { data: await this.requestService.getAllRequests(query) };
  }

  @Get("requests/pending-withdraw")
  @ApiOperation({ summary: "List pending withdraw requests awaiting packet assignment" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns pending withdraw requests" })
  async getPendingWithdrawRequests() {
    return { data: await this.requestService.getPendingWithdrawRequests() };
  }

  @Get("requests/:id/allocation-suggestions")
  @ApiOperation({
    summary: "Smart allocation suggestions for a withdraw request (exact match, best fit, combination)",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns ranked allocation options" })
  async getAllocationSuggestions(@Param("id") id: string) {
    return { data: await this.requestService.getAllocationSuggestions(id) };
  }

  @Post("requests/:id/allocation-apply")
  @ApiOperation({ summary: "Apply a smart allocation suggestion to a withdraw request" })
  @ApiResponse({ status: HttpStatus.OK, description: "Allocation applied, request approved" })
  async applyAllocation(@Req() req: AdminExpressRequest, @Param("id") id: string, @Body() dto: ApplyAllocationDto) {
    const adminId = req.admin["id"];
    return { data: await this.requestService.applyAllocationOption(id, adminId, dto.optionKey) };
  }

  @Get("requests/:id")
  @ApiOperation({ summary: "Get request by ID (Admin)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns request details" })
  async getRequest(@Param("id") id: string) {
    return { data: await this.requestService.getRequestById(id) };
  }

  @Put("requests/:id/process")
  @ApiOperation({ summary: "Process a request (Approve/Reject/Complete)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Request processed" })
  async processRequest(@Req() req: AdminExpressRequest, @Param("id") id: string, @Body() dto: AdminProcessRequestDto) {
    const adminId = req.admin["id"];
    return { data: await this.requestService.processRequest(id, adminId, dto) };
  }

  @Put("requests/:id/confirm-material")
  @UseInterceptors(FileInterceptor("picture"))
  @ApiOperation({ summary: "Confirm deposit material received, lock wallet value" })
  @ApiResponse({ status: HttpStatus.OK, description: "Material confirmed, wallet locked" })
  async confirmDepositMaterial(
    @Req() req: AdminExpressRequest,
    @Param("id") id: string,
    @Body() body: Record<string, any>,
    @UploadedFile() picture?: Express.Multer.File
  ) {
    const adminId = req.admin["id"];
    const materialData: ConfirmMaterialInput = {};
    if (body.ang !== undefined && body.ang !== "") materialData.ang = Number(body.ang);
    if (body.ayar !== undefined && body.ayar !== "") materialData.ayar = Number(body.ayar);
    if (body.apparentWeight !== undefined && body.apparentWeight !== "") materialData.apparentWeight = Number(body.apparentWeight);
    if (body.wastage !== undefined && body.wastage !== "") materialData.wastage = Number(body.wastage);
    if (body.warehouseIndexPosition) materialData.warehouseIndexPosition = body.warehouseIndexPosition;

    // Multipart carries no nested objects, so a split delivery arrives as a
    // JSON string. Rejected loudly rather than silently shelved as one package:
    // the admin who typed three packages must not get one.
    if (body.parts !== undefined && body.parts !== "") {
      materialData.parts = this.parseIntakeParts(body.parts);
    }

    if (picture) {
      const fileInfo = await this.packetService.uploadPictureBuffer(
        `confirm-${id}-${Date.now()}`,
        picture
      );
      materialData.picture = fileInfo.url;
    }
    return { data: await this.requestService.confirmDepositMaterial(id, adminId, materialData) };
  }

  /**
   * `parts` as it arrives over multipart: already an array when the request was
   * JSON, a string when it was a form.
   */
  private parseIntakeParts(raw: unknown): ConfirmMaterialPartDto[] {
    if (Array.isArray(raw)) return raw as ConfirmMaterialPartDto[];

    let parsed: unknown;
    try {
      parsed = JSON.parse(String(raw));
    } catch {
      throw new BadRequestException("INVALID_PARTS: `parts` must be a JSON array of packages");
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new BadRequestException("INVALID_PARTS: `parts` must be a non-empty JSON array of packages");
    }
    return parsed as ConfirmMaterialPartDto[];
  }

  @Post("requests/:id/assign-packet/:packetId")
  @ApiOperation({ summary: "Assign a specific packet to a pending withdraw request" })
  @ApiResponse({ status: HttpStatus.OK, description: "Packet assigned to request" })
  async assignPacketToRequest(
    @Req() req: AdminExpressRequest,
    @Param("id") id: string,
    @Param("packetId") packetId: string
  ) {
    const adminId = req.admin["id"];
    return { data: await this.requestService.assignPacketToRequest(id, packetId, adminId) };
  }

  // -- Settlement routes --

  @Post("settlement-material/release")
  @ApiOperation({ summary: "Create orphan packet from provider settlement material" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Settlement packet created" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("picture"))
  async createSettlementPacket(
    @Req() req: AdminExpressRequest,
    @Body() dto: CreateSettlementPacketDto,
    @UploadedFile() picture?: Express.Multer.File
  ) {
    const adminId = req.admin["id"];
    return { data: await this.packetService.createFromSettlement(dto, adminId, picture) };
  }

  @Get("settlement-material/balance")
  @ApiOperation({ summary: "Get available settlement material balance (from provider settlements)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns settlement material balance" })
  async getSettlementBalance() {
    return { data: await this.warehouseService.getSettlementMaterialBalance() };
  }

  @Post("requests/:id/approve-withdraw")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Approve withdraw request: choose a user packet (split into withdrawal + remainder, 2 pictures)" +
      " or an orphan packet, then deliver",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Withdraw approved, packet assigned" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileFieldsInterceptor([{ name: "picture1", maxCount: 1 }, { name: "picture2", maxCount: 1 }]))
  async approveWithdraw(
    @Req() req: AdminExpressRequest,
    @Param("id") id: string,
    @Body() dto: ApproveWithdrawOutputDto,
    @UploadedFiles() files?: Record<string, Express.Multer.File[]>
  ) {
    const adminId = req.admin["id"];
    const picture1 = files?.picture1?.[0];
    const picture2 = files?.picture2?.[0];
    if (picture1) {
      const fileInfo = await this.packetService.uploadPictureBuffer(`approve-${id}-p1-${Date.now()}`, picture1);
      dto.picture1 = fileInfo.url;
    }
    if (picture2) {
      const fileInfo = await this.packetService.uploadPictureBuffer(`approve-${id}-p2-${Date.now()}`, picture2);
      dto.picture2 = fileInfo.url;
    }
    return { data: await this.requestService.approveWithdrawForOutput(id, adminId, dto) };
  }

  @Get("today-stats")
  @ApiOperation({ summary: "Today's deliveries and withdraws stats" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns today stats" })
  async getTodayStats() {
    return { data: await this.warehouseService.getTodayStats() };
  }

  @Get("today-export")
  @ApiOperation({ summary: "Export today's data as JSON" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns today export data" })
  async getTodayExport() {
    return { data: await this.warehouseService.getTodayExportData() };
  }

  @Get("users/:userId/packets")
  @ApiOperation({ summary: "Get user's in-warehouse packets for withdraw selection" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns user packets" })
  async getUserWarehousePackets(@Param("userId") userId: string, @Query("warehouseId") warehouseId?: string) {
    return { data: await this.packetService.findUserInWarehousePackets(userId, warehouseId) };
  }

  @Get("lookups")
  @ApiOperation({
    summary: "Material symbols and providers, for the movement form",
    description:
      "Served here because the symbol and provider admin APIs require the ADMIN role while these " +
      "screens are for warehouse operators. Carries the names and keys a dropdown needs, nothing more.",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns material symbols and providers" })
  async getMovementLookups() {
    return { data: await this.warehouseService.getMovementLookups() };
  }

  // -- Movements: the physical ledger, separate from the request paperwork --

  @Get("movements")
  @ApiOperation({
    summary: "Warehouse movements",
    description:
      "Metal physically entering or leaving, whatever caused it. Distinct from requests: a request " +
      "is paperwork that may never be fulfilled, and metal can move with no request behind it.",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns movements, newest first" })
  async getMovements(@Query() query: MovementQueryDto) {
    return { data: await this.movementService.findAll(query) };
  }

  @Get("movements/today")
  @ApiOperation({ summary: "Today's inbound and outbound totals" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns today's movement totals" })
  async getTodayMovements(@Query("warehouseId") warehouseId?: string) {
    return { data: await this.movementService.dailyTotals({ warehouseId }) };
  }

  @Post("movements")
  @ApiOperation({
    summary: "Record a movement by hand",
    description:
      "For metal that moved with no request behind it. Inbound may be attributed to a user or a " +
      "provider; a user inbound credits their wallet with the confirmed net weight, exactly as a " +
      "requested deposit does. Outbound is provider-only — releasing material to a user goes " +
      "through a withdrawal request, which locks the balance and refunds the difference.",
  })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Movement recorded" })
  async recordMovement(@Req() req: AdminExpressRequest, @Body() dto: RecordMovementDto) {
    const adminId = req.admin["id"];
    return { data: await this.manualMovementService.record(dto, adminId) };
  }

  // -- Warehouse routes with param (:id) — must be last --

  @Get("summary")
  @ApiOperation({
    summary: "Warehouses with their inventory and package counts",
    description: "Powers the warehouse list: one row per warehouse with what it currently holds.",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns warehouses with per-warehouse figures" })
  async getWarehouseSummary(@Query() query: AdminWarehouseQueryDto) {
    return { data: await this.warehouseService.listWithStats(query) };
  }

  @Get(":id/stats")
  @ApiOperation({ summary: "Inventory, packages and pending requests for one warehouse" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns the warehouse's figures" })
  async getWarehouseStats(@Param("id") id: string) {
    return { data: await this.warehouseService.getWarehouseStats(id) };
  }

  @Get(":id/movements")
  @ApiOperation({ summary: "Movements for one warehouse" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns the warehouse's movements" })
  async getWarehouseMovements(@Param("id") id: string, @Query() query: MovementQueryDto) {
    return { data: await this.movementService.findAll({ ...query, warehouseId: id }) };
  }



  @Get(":id")
  @ApiOperation({ summary: "Get warehouse by ID (Admin)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns warehouse details" })
  async getWarehouse(@Param("id") id: string) {
    return { data: await this.warehouseService.findById(id) };
  }

  @Put(":id")
  @ApiOperation({ summary: "Update warehouse" })
  @ApiResponse({ status: HttpStatus.OK, description: "Warehouse updated" })
  async updateWarehouse(@Param("id") id: string, @Body() dto: AdminUpdateWarehouseDto) {
    return { data: await this.warehouseService.update(id, dto) };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Delete warehouse" })
  @ApiResponse({ status: HttpStatus.OK, description: "Warehouse deleted" })
  async deleteWarehouse(@Param("id") id: string) {
    await this.warehouseService.remove(id);
    return { message: "Warehouse deleted successfully" };
  }
}
