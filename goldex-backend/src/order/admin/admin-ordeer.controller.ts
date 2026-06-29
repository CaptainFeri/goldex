import { Controller, Get, Put, Delete, Body, Param, Query, UseGuards, HttpStatus, HttpCode } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { AdminOrderService } from "./admin-order.service";
import { AdminAuthGuard } from "../../admin/auth/Guard/admin.guard";
import { AdminUpdateOrderDto } from "./dto/admin-update-order.dto";

@ApiTags("Admin - Orders")
@ApiBearerAuth()
@UseGuards(AdminAuthGuard)
@Controller("admin/orders")
export class AdminOrderController {
  constructor(private readonly adminOrderService: AdminOrderService) {}

  @Get()
  @ApiOperation({ summary: "Get all orders (Admin)" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns all orders" })
  async getAllOrders(@Query() query: any) {
    return this.adminOrderService.getAllOrders(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get order by ID (Admin)" })
  @ApiParam({ name: "id", description: "Order ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns order details" })
  async getOrderById(@Param("id") id: string) {
    return this.adminOrderService.getAllOrders({ id });
  }

  @Put(":id")
  @ApiOperation({ summary: "Update order (Admin)" })
  @ApiParam({ name: "id", description: "Order ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Order updated successfully" })
  async updateOrder(@Param("id") id: string, @Body() dto: AdminUpdateOrderDto, @Query("adminId") adminId: string) {
    return this.adminOrderService.adminUpdateOrder(id, adminId, dto);
  }

  @Delete(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel order (Admin)" })
  @ApiParam({ name: "id", description: "Order ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Order cancelled successfully" })
  async cancelOrder(@Param("id") id: string, @Query("adminId") adminId: string, @Body("reason") reason: string) {
    return this.adminOrderService.cancelOrderAsAdmin(id, adminId, reason);
  }
}
