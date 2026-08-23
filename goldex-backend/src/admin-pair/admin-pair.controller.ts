import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { PricePairEntity } from "./entity/price.pair.entity";
import { AdminPairService } from "./admin-pair.service";
import { CreatePricePairDto } from "./dto/create-pair.dto";
import { UpdatePricePairDto } from "./dto/update-price-paird.dto";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";

@ApiTags("Admin-Price-Management")
@Controller("admin/pair")
export class AdminPairController {
  constructor(private readonly pricePairService: AdminPairService) {}

  @Post()
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  async create(@Body() createPricePairDto: CreatePricePairDto): Promise<{ data: PricePairEntity }> {
    return { data: await this.pricePairService.create(createPricePairDto) };
  }

  @Get()
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  async findAll(): Promise<{ data: PricePairEntity[] }> {
    return { data: await this.pricePairService.findAll() };
  }

  @Get("valid")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  async getValidPairs(): Promise<{ data: PricePairEntity[] }> {
    return { data: await this.pricePairService.getValidPairs() };
  }

  @Get("base/:baseCode")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  async findByBaseCode(@Param("baseCode") baseCode: string): Promise<{ data: PricePairEntity[] }> {
    return { data: await this.pricePairService.findByBaseCode(baseCode) };
  }

  @Get("quote/:quoteCode")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  async findByQuoteCode(@Param("quoteCode") quoteCode: string): Promise<{ data: PricePairEntity[] }> {
    return { data: await this.pricePairService.findByQuoteCode(quoteCode) };
  }

  @Get(":id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  async findOne(@Param("id", ParseUUIDPipe) id: string): Promise<{ data: PricePairEntity }> {
    return { data: await this.pricePairService.findOne(id) };
  }

  @Patch(":id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
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
  async toggleValidity(@Param("id", ParseUUIDPipe) id: string): Promise<{ data: PricePairEntity }> {
    return { data: await this.pricePairService.toggleValidity(id) };
  }

  @Get(":id/requests-overview")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  async getRequestsOverview(@Param("id", ParseUUIDPipe) id: string) {
    return { data: await this.pricePairService.getRequestsOverview(id) };
  }

  @Delete(":id")
  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<{ data: void }> {
    return { data: await this.pricePairService.remove(id) };
  }
}
