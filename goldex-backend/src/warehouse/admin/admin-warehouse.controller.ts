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
  Req,
  Res,
  StreamableFile,
} from "@nestjs/common";
import { Response } from "express";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { AdminAuthGuard } from "../../admin/auth/Guard/admin.guard";
import { AdminWorkTimeGuard } from "../../admin-schedule/admin-work-time.guard";
import { WarehouseService } from "../service/warehouse.service";
import { PacketService } from "../service/packet.service";
import { WarehouseRequestService } from "../service/warehouse-request.service";
import { AdminCreateWarehouseDto } from "./dto/admin-create-warehouse.dto";
import { AdminUpdateWarehouseDto } from "./dto/admin-update-warehouse.dto";
import { AdminCreatePacketDto } from "./dto/admin-create-packet.dto";
import { AdminUpdatePacketDto } from "./dto/admin-update-packet.dto";
import { AdminProcessRequestDto } from "./dto/admin-process-request.dto";
import { AdminWarehouseQueryDto } from "./dto/admin-warehouse-query.dto";
import { AdminRequestQueryDto } from "./dto/admin-request-query.dto";
import { PacketQueryDto } from "../dto/packet-query.dto";
import { CreateSettlementPacketDto } from "./dto/create-settlement-packet.dto";
import { RequestStatusEnum } from "../enum/request-status.enum";
import { AdminExpressRequest } from "../../admin/auth/types/adminExpressRequest";

@ApiTags("Admin - Warehouse")
@ApiBearerAuth()
@UseGuards(AdminAuthGuard, AdminWorkTimeGuard)
@Controller("admin/warehouse")
export class AdminWarehouseController {
  constructor(
    private readonly warehouseService: WarehouseService,
    private readonly packetService: PacketService,
    private readonly requestService: WarehouseRequestService
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
  async createPacket(@Body() dto: AdminCreatePacketDto, @UploadedFile() picture?: Express.Multer.File) {
    return { data: await this.packetService.create(dto, picture) };
  }

  @Get("packets")
  @ApiOperation({ summary: "List all packets (Admin)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns all packets" })
  async getAllPackets(@Query() query: PacketQueryDto) {
    return { data: await this.packetService.findAll(query) };
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
    const materialData: any = {};
    if (body.ang !== undefined && body.ang !== "") materialData.ang = Number(body.ang);
    if (body.ayar !== undefined && body.ayar !== "") materialData.ayar = Number(body.ayar);
    if (body.warehouseIndexPosition) materialData.warehouseIndexPosition = body.warehouseIndexPosition;
    if (picture) {
      const fileInfo = await this.packetService.uploadPictureBuffer(
        `confirm-${id}-${Date.now()}`,
        picture
      );
      materialData.picture = fileInfo.url;
    }
    return { data: await this.requestService.confirmDepositMaterial(id, adminId, materialData) };
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
    @Body() dto: CreateSettlementPacketDto,
    @UploadedFile() picture?: Express.Multer.File
  ) {
    return { data: await this.packetService.createFromSettlement(dto, picture) };
  }

  @Get("settlement-material/balance")
  @ApiOperation({ summary: "Get available settlement material balance (from provider settlements)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns settlement material balance" })
  async getSettlementBalance() {
    return { data: await this.warehouseService.getSettlementMaterialBalance() };
  }

  @Put("requests/:id/approve-withdraw")
  @ApiOperation({ summary: "Approve a withdraw request (auto-assigns nearest packet + delivery info)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Withdraw approved, packet assigned" })
  async approveWithdraw(
    @Req() req: AdminExpressRequest,
    @Param("id") id: string,
    @Body() dto: AdminProcessRequestDto
  ) {
    const adminId = req.admin["id"];
    return { data: await this.requestService.processRequest(id, adminId, { ...dto, status: RequestStatusEnum.APPROVED }) };
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

  // -- Warehouse routes with param (:id) — must be last --

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
