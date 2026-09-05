import { ApiBearerAuth, ApiQuery, ApiResponse, ApiTags } from "@nestjs/swagger";
import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { PromotionDto } from "./dto/promotion.dto";
import { PromotionTypeEnum } from "./enum/promotion.enum";
import { UpdateDiscountDto } from "./dto/update-discount.dto";
import { CreatePromotionDto } from "./dto/create-promotion.dto";
import { UpdatePromotionDto } from "./dto/update-promotion.dto";
import { DiscountAdminService } from "./discount-admin.service";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { CreateAdminDiscountDto } from "./dto/create-discount.dto";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";

@Controller("admin/discounts")
@ApiTags("Admin-Discount")
export class DiscountAdminController {
  constructor(private readonly adminDiscountService: DiscountAdminService) {}

  @ApiQuery({
    name: "pageNumber",
    required: true,
    type: Number,
    description: "page number",
  })
  @ApiQuery({
    name: "pageSize",
    required: true,
    type: Number,
    description: "size of page",
  })
  @ApiQuery({
    name: "searchKey",
    required: false,
    type: String,
    description: "Search keyword on code",
  })
  @Get("coupons")
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  async getDiscountList(
    @Query("pageNumber", new DefaultValuePipe(1), ParseIntPipe)
    page: number = 1,
    @Query("pageSize", new DefaultValuePipe(100), ParseIntPipe)
    limit: number = 100,
    @Query("searchKey")
    searchKey: string
  ) {
    limit = limit > 100 ? 100 : limit;
    page = page < 0 ? 1 : page;
    const skip = limit * (page - 1);
    const take = limit;
    return {
      data: await this.adminDiscountService.getDiscountList(take, skip, searchKey),
    };
  }

  @Get("coupons/:id")
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  async getDiscountCouponDetails(@Param("id") id: number, @Req() request: AdminExpressRequest) {
    return {
      data: await this.adminDiscountService.getDiscountDetails(id, request.admin),
    };
  }

  @Patch("coupons/:id/activation")
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  async activateDiscount(@Req() request: AdminExpressRequest, @Param("id") id: number) {
    return {
      data: await this.adminDiscountService.activateDiscount(request.admin, id),
    };
  }

  @Post("coupons")
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  async createDiscountCoupon(@Req() request: AdminExpressRequest, @Body() data: CreateAdminDiscountDto) {
    return {
      data: {
        discountCoupon: await this.adminDiscountService.createDiscountCoupon(request.admin, data),
      },
    };
  }

  @Patch("coupons/:id")
  @ApiBearerAuth()
  @UseGuards(AdminAuthGuard)
  async updateDiscount(@Req() request: AdminExpressRequest, @Param("id") id: number, @Body() data: UpdateDiscountDto) {
    return {
      data: {
        discountCoupon: await this.adminDiscountService.updateDiscountDto(id, data, request.admin),
      },
    };
  }

  // @Post('promotions')
  // @ApiResponse({
  //   status: HttpStatus.CREATED,
  //   type: PromotionDto,
  //   isArray: false,
  // })
  // @ApiBearerAuth()
  // @UseGuards(AdminAuthGuard)
  // async createNewPromotion(@Body() data: CreatePromotionDto, @Req() req: AdminExpressRequest) {
  //   return {
  //     data: await this.adminDiscountService.createNewPromotion(req.admin, data),
  //   };
  // }

  // @ApiQuery({
  //   name: 'pageNumber',
  //   required: true,
  //   type: Number,
  //   description: 'page number',
  // })
  // @ApiQuery({
  //   name: 'pageSize',
  //   required: true,
  //   type: Number,
  //   description: 'size of page',
  // })
  // @ApiQuery({
  //   name: 'promotionType',
  //   required: true,
  //   type: String,
  //   description: 'Filter by Promotion Types',
  //   enum: PromotionTypeEnum,
  // })
  // @ApiQuery({
  //   name: 'searchTerm',
  //   required: false,
  //   type: String,
  //   description: 'Search keyword on promotion name',
  // })
  // @Get('promotions')
  // @ApiBearerAuth()
  // @UseGuards(AdminAuthGuard)
  // async getPromotions(
  //   @Query('pageNumber', new DefaultValuePipe(1), ParseIntPipe)
  //   page: number = 1,
  //   @Query('pageSize', new DefaultValuePipe(100), ParseIntPipe)
  //   limit: number = 100,
  //   @Query('searchTerm')
  //   searchTerm: string,
  //   @Query('promotionType')
  //   promotionType: string
  // ) {
  //   limit = limit > 100 ? 100 : limit;
  //   page = page < 0 ? 1 : page;
  //   const skip = limit * (page - 1);
  //   const take = limit;
  //   return {
  //     data: await this.adminDiscountService.getPromotions(take, skip, promotionType, searchTerm),
  //   };
  // }

  // @Patch('promotions/:id')
  // @ApiBearerAuth()
  // @UseGuards(AdminAuthGuard)
  // async updatePromotionById(@Body() data: UpdatePromotionDto, @Param('id') id: number) {
  //   return {
  //     data: await this.adminDiscountService.updatePromotion(id, data),
  //   };
  // }

  // @Get('promotions/:id')
  // @ApiBearerAuth()
  // @UseGuards(AdminAuthGuard)
  // async getPromotionDetails(@Param('id') id: number) {
  //   return {
  //     data: await this.adminDiscountService.getPromotionDetail(id),
  //   };
  // }

  // @Delete('promotions/:id')
  // @ApiBearerAuth()
  // @UseGuards(AdminAuthGuard)
  // async deletePromotion(@Param('id') id: number, @Req() req: AdminExpressRequest) {
  //   return {
  //     data: await this.adminDiscountService.deletePromotion(req.admin, id),
  //   };
  // }
}
