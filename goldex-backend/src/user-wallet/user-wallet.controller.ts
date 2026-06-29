import {
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserWalletService } from "./user-wallet.service";
import { UserAuthGuard } from "../user/auth/Guard/user.guard";
import { UserExpressRequest } from "../user/auth/types/user-express-request";

@ApiTags("User-Wallet")
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller("user-wallet")
export class UserWalletController {
  constructor(private readonly userWalletService: UserWalletService) {}

  @Get()
  @ApiOperation({ summary: "List the current user's wallets and balances" })
  async getWallets(@Req() req: UserExpressRequest) {
    return { data: await this.userWalletService.getUserWallets(req.user.id) };
  }

  @Get("transactions")
  @ApiOperation({ summary: "List the current user's wallet transactions" })
  async getTransactions(
    @Req() req: UserExpressRequest,
    @Query("walletId") walletId: string,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query("offset", new DefaultValuePipe(0), ParseIntPipe) offset: number
  ) {
    return {
      data: await this.userWalletService.getTransactions(req.user.id, { walletId, limit, offset }),
    };
  }

  @Get(":walletId")
  @ApiOperation({ summary: "Get a single wallet by ID" })
  async getWallet(@Req() req: UserExpressRequest, @Param("walletId", ParseUUIDPipe) walletId: string) {
    return { data: await this.userWalletService.getWalletById(req.user.id, walletId) };
  }
}
