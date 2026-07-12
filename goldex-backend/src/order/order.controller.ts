// order.controller.ts
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
  Req,
  HttpStatus,
  HttpCode,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from "@nestjs/swagger";
import { OrderService } from "./order.service";
import { CreateOrderDto } from "./dto/create-order.dto";
import { UpdateOrderDto } from "./dto/update-order.dto";
import { OrderQueryDto } from "./dto/order-query.dto";
import { UserAuthGuard } from "../user/auth/Guard/user.guard";
import { UserExpressRequest } from "../user/auth/types/user-express-request";
import { OrderBookService } from "../order-book/order-book.service";

@ApiTags("Orders")
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller("orders")
export class OrderController {
  constructor(
    private readonly orderService: OrderService,
    private readonly orderBookService: OrderBookService,
  ) {}

  @Post()
  @ApiOperation({ summary: "Create a new order" })
  @ApiResponse({ status: HttpStatus.CREATED, description: "Order created successfully" })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: "Invalid input" })
  async createOrder(@Req() req: UserExpressRequest, @Body() dto: CreateOrderDto) {
    const userId = req.user["id"];
    return { data: await this.orderService.createOrder(userId, dto) };
  }

  @Get()
  @ApiOperation({ summary: "Get user orders" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns user orders" })
  async getUserOrders(@Req() req: UserExpressRequest, @Query() query: OrderQueryDto) {
    const userId = req.user["id"];
    return { data: await this.orderService.getUserOrders(userId, query) };
  }

  @Get(":id")
  @ApiOperation({ summary: "Get order by ID" })
  @ApiParam({ name: "id", description: "Order ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Returns order details" })
  @ApiResponse({ status: HttpStatus.NOT_FOUND, description: "Order not found" })
  async getOrderById(@Req() req: UserExpressRequest, @Param("id") id: string) {
    const userId = req.user["id"];
    return { data: await this.orderService.getOrderById(id, userId) };
  }

  @Put(":id")
  @ApiOperation({ summary: "Update order" })
  @ApiParam({ name: "id", description: "Order ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Order updated successfully" })
  async updateOrder(@Req() req: UserExpressRequest, @Param("id") id: string, @Body() dto: UpdateOrderDto) {
    const userId = req.user["id"];
    return { data: await this.orderService.updateOrder(id, dto, userId) };
  }

  @Delete(":id/cancel")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Cancel order" })
  @ApiParam({ name: "id", description: "Order ID" })
  @ApiResponse({ status: HttpStatus.OK, description: "Order cancelled successfully" })
  async cancelOrder(@Req() req: UserExpressRequest, @Param("id") id: string) {
    const userId = req.user["id"];
    return { data: await this.orderService.cancelOrder(userId, id) };
  }

  @Get("book/:pairId")
  @ApiOperation({ summary: "Get order book depth for a pair" })
  @ApiParam({ name: "pairId", description: "Price pair ID" })
  async getOrderBookDepth(@Param("pairId") pairId: string) {
    return { data: this.orderBookService.getDepth(pairId) };
  }
}
