import { ApiQuery, ApiTags } from "@nestjs/swagger";
import { Controller, DefaultValuePipe, Get, ParseIntPipe, Query } from "@nestjs/common";
import { BaseInfoService } from "./baseinfo.service";

@Controller("base-info")
@ApiTags("Base-Info")
export class BaseinfoController {
  constructor(private readonly baseInfoService: BaseInfoService) {}
  @Get("countries")
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
    description: "Search keyword in country name",
  })
  async getCounryList(
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
    const res = await this.baseInfoService.getCountries(take, skip, searchKey);
    return {
      data: res,
    };
  }

  @Get("languages")
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
    description: "Search keyword in locale or name or NativeName",
  })
  async getActiveLangs(
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
      data: await this.baseInfoService.getLanguages(take, skip, searchKey),
    };
  }
}
