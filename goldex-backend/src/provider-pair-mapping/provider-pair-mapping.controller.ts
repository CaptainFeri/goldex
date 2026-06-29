import { Controller, Get, Post, Body, Patch, Param, Delete, ParseUUIDPipe, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags, ApiOperation } from "@nestjs/swagger";
import { ProviderPairMappingService } from "./provider-pair-mapping.service";
import { ProviderPairMappingEntity } from "./entity/provider-pair-mapping.entity";
import { CreateProviderPairMappingDto, UpdateProviderPairMappingDto } from "./dto/create-provider-pair-mapping.dto";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { Roles } from "../admin/auth/Guard/admin.role.guard";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { RedisService, SnapshotItem } from "../redis/redis.service";


@ApiTags("Admin-Provider-Pair-Mapping")
@Controller("admin/pair-mappings")
@UseGuards(AdminAuthGuard)
@ApiBearerAuth()
export class ProviderPairMappingController {
  constructor(
    private readonly mappingService: ProviderPairMappingService,
    private readonly redis: RedisService,
  ) {}

  @Roles(AdminRole.SUPER_ADMIN)
  @Get("all")
  async findAll(): Promise<{ data: ProviderPairMappingEntity[] }> {
    return { data: await this.mappingService.findAll() };
  }

  @Roles(AdminRole.SUPER_ADMIN)
  @Post()
  async create(@Body() dto: CreateProviderPairMappingDto): Promise<{ data: ProviderPairMappingEntity }> {
    return { data: await this.mappingService.create(dto) };
  }

  @Roles(AdminRole.SUPER_ADMIN)
  @Get("available-items")
  @ApiOperation({ summary: "Get available items from all active providers for creating mappings" })
  async getAvailableItems(): Promise<{
    data: Array<{
      providerKey: string;
      items: SnapshotItem[];
    }>;
  }> {
    const redisSnapshots = await this.redis.getAllSnapshotsFromRedis();
    return {
      data: Object.entries(redisSnapshots).map(([providerKey, items]) => ({
        providerKey,
        items,
      })),
    };
  }

  @Roles(AdminRole.SUPER_ADMIN)
  @Get(":id")
  async findOne(@Param("id", ParseUUIDPipe) id: string): Promise<{ data: ProviderPairMappingEntity }> {
    return { data: await this.mappingService.findOne(id) };
  }

  @Roles(AdminRole.SUPER_ADMIN)
  @Get("provider/:providerKey")
  async findByProvider(@Param("providerKey") providerKey: string): Promise<{ data: ProviderPairMappingEntity[] }> {
    return { data: await this.mappingService.findByProvider(providerKey) };
  }

  @Roles(AdminRole.SUPER_ADMIN)
  @Get("pair/:pairId")
  async findByPair(@Param("pairId", ParseUUIDPipe) pairId: string): Promise<{ data: ProviderPairMappingEntity[] }> {
    return { data: await this.mappingService.findByPair(pairId) };
  }

  @Roles(AdminRole.SUPER_ADMIN)
  @Patch(":id")
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateProviderPairMappingDto
  ): Promise<{ data: ProviderPairMappingEntity }> {
    return { data: await this.mappingService.update(id, dto) };
  }

  @Roles(AdminRole.SUPER_ADMIN)
  @Delete(":id")
  async remove(@Param("id", ParseUUIDPipe) id: string): Promise<{ data: void }> {
    return { data: await this.mappingService.remove(id) };
  }
}
