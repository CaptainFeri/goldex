import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, HttpStatus, Res, StreamableFile } from "@nestjs/common";
import { Response } from "express";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from "@nestjs/swagger";
import { PacketService } from "./service/packet.service";
import { WarehouseRequestService } from "./service/warehouse-request.service";
import { WarehouseService } from "./service/warehouse.service";
import { CreateDepositRequestDto } from "./dto/create-deposit-request.dto";
import { CreateWithdrawRequestDto } from "./dto/create-withdraw-request.dto";
import { RequestQueryDto } from "./dto/request-query.dto";
import { PacketQueryDto } from "./dto/packet-query.dto";
import { UserAuthGuard } from "../user/auth/Guard/user.guard";
import { UserExpressRequest } from "../user/auth/types/user-express-request";
import { WarehouseQueryDto } from "./dto/warehouse-query.dto";
import { AllocationOptionsQueryDto } from "./dto/allocation-options-query.dto";
import { AllocationService } from "./service/allocation.service";
import { WarehouseStatusEnum } from "./enum/warehouse-status.enum";

@ApiTags("Warehouse")
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller("warehouse")
export class WarehouseController {
  constructor(
    private readonly packetService: PacketService,
    private readonly requestService: WarehouseRequestService,
    private readonly warehouseService: WarehouseService,
    private readonly allocationService: AllocationService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List active warehouses for users" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns active warehouses" })
  async getWarehouses(@Query() query: WarehouseQueryDto) {
    const result = await this.warehouseService.findAll({ ...query, status: WarehouseStatusEnum.ACTIVE } as any);
    return { data: result.warehouses };
  }

  @Post("deposit")
  @ApiOperation({ summary: "Create deposit request" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Deposit request created" })
  async createDepositRequest(@Req() req: UserExpressRequest, @Body() dto: CreateDepositRequestDto) {
    const userId = req.user["id"];
    return { data: await this.requestService.createDepositRequest(userId, dto) };
  }

  @Post("withdraw")
  @ApiOperation({ summary: "Create withdrawal request" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Withdrawal request created" })
  async createWithdrawRequest(@Req() req: UserExpressRequest, @Body() dto: CreateWithdrawRequestDto) {
    const userId = req.user["id"];
    return { data: await this.requestService.createWithdrawRequest(userId, dto) };
  }

  @Get("allocation-options")
  @ApiOperation({
    summary: "List the packages a warehouse could serve a withdrawal of this weight from",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Packages at or under the requested weight" })
  async getAllocationOptions(@Query() query: AllocationOptionsQueryDto) {
    // At or under the requested weight only: handing over more metal than was
    // asked for would give away gold the user has not paid for. What each
    // choice falls short by comes back to their wallet at delivery.
    return { data: await this.allocationService.listCandidates(query) };
  }

  @Get("requests")
  @ApiOperation({ summary: "Get user requests" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns user requests" })
  async getUserRequests(@Req() req: UserExpressRequest, @Query() query: RequestQueryDto) {
    const userId = req.user["id"];
    return { data: await this.requestService.getUserRequests(userId, query) };
  }

  @Post("requests/:id/cancel")
  @ApiOperation({ summary: "Cancel a pending request" })
  @ApiResponse({ status: HttpStatus.OK, description: "Request cancelled" })
  async cancelRequest(@Req() req: UserExpressRequest, @Param("id") id: string) {
    const userId = req.user["id"];
    return { data: await this.requestService.cancelRequest(userId, id) };
  }

  @Get("packets")
  @ApiOperation({
    summary: "Packages this user handed in or took away",
    description:
      "A package in the warehouse belongs to the pool, not to whoever deposited it — what a user " +
      "holds is the balance in their wallet. This is their history with the metal: packages they " +
      "brought in, and packages that were released to them.",
  })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns the packets this user handed in or received" })
  async getUserPackets(@Req() req: UserExpressRequest, @Query() query: PacketQueryDto) {
    const userId = req.user["id"];
    return {
      data: await this.packetService.findAll({
        ...query,
        involvingUserId: userId,
      } as any),
    };
  }

  @Get("packets/:id")
  @ApiOperation({ summary: "Get packet details" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns packet details" })
  async getPacket(@Param("id") id: string) {
    return { data: await this.packetService.findById(id) };
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
}
