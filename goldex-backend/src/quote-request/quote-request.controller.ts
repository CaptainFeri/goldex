import { Controller, Post, Get, Body, Param, HttpCode, HttpStatus, UseGuards, Req, Query, Delete } from "@nestjs/common";
import { ApiTags, ApiBearerAuth } from "@nestjs/swagger";
import { QuoteRequestService } from "./quote-request.service";
import { OrderSideEnum } from "../order/enum/order.side.enum";
import { UserAuthGuard } from "../user/auth/Guard/user.guard";
import { UserExpressRequest } from "../user/auth/types/user-express-request";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";

class CreateQuoteRequestDto {
  side: OrderSideEnum;
  pricePairId: string;
  quantity: number;
  price?: number;
  notes?: string;
}

@ApiTags("Quote-Requests")
@Controller({ path: "quote-requests", version: "1" })
export class QuoteRequestController {
  constructor(
    private readonly service: QuoteRequestService,
    @InjectRepository(PricePairEntity)
    private readonly pairRepo: Repository<PricePairEntity>,
  ) {}

  @Get("pairs")
  async getPairs() {
    const pairs = await this.pairRepo.find({
      where: { isValid: true },
      relations: { baseSymbol: true, quoteSymbol: true },
    });
    return { data: pairs };
  }

  @Post()
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  async create(@Req() req: UserExpressRequest, @Body() dto: CreateQuoteRequestDto) {
    const result = await this.service.create(req.user.id, dto.side, dto.pricePairId, dto.quantity, dto.price, dto.notes);
    return {
      data: {
        request: result.request,
        matchAlert: result.matchAlert || false,
      },
    };
  }

  @Get("my")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  async getMyRequests(@Req() req: UserExpressRequest) {
    const requests = await this.service.findMyRequests(req.user.id);
    return { data: requests };
  }

  @Get("pending")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  async getPending() {
    const requests = await this.service.getPending();
    return { data: requests };
  }

  @Get(":id")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  async getById(@Param("id") id: string) {
    const request = await this.service.findById(id);
    return { data: request };
  }

  @Post(":id/match")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async match(@Param("id") id: string, @Req() req: UserExpressRequest) {
    const result = await this.service.match(id, req.user.id);
    return { data: { request: result.request, matchedBuyOrderId: result.matchedBuyOrderId } };
  }

  @Delete(":id")
  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  async cancel(@Param("id") id: string, @Req() req: UserExpressRequest) {
    await this.service.cancel(id, req.user.id);
  }
}
