import { Controller, Post, Body, Get, Param, Query, UseGuards, Req } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from "@nestjs/swagger";
import {
  ApiAdminErrorResponses,
  ApiEnvelopeResponse,
} from "../shared/swagger";
import {
  AdminWalletDetailsDto,
  AdminWalletListDto,
  AdminWalletMutationDto,
  WalletBalanceHistoryEntryDto,
} from "./dtos/admin-wallet-response.dto";
import { AdminWalletService } from "./admin-wallet.service";
import { AdminAuthGuard } from "../admin/auth/Guard/admin.guard";
import { UpdateBalanceDto } from "./dtos/update-balance.dto";
import { AdjustBalanceDto } from "./dtos/adjust-balance.dto";
import { FreezeWalletDto } from "./dtos/freeze-wallet.dto";
import { WalletActionDto } from "./dtos/wallet-action.dto";
import { AdminRoles } from "../admin/role/admin.role.decorator";
import { AdminRole } from "../admin/role/admin.roles.enum";
import { AdminExpressRequest } from "../admin/auth/types/adminExpressRequest";

@ApiTags("Admin-Wallet-Management")
@Controller("admin/wallets")
@UseGuards(AdminAuthGuard)
@ApiBearerAuth()
@ApiAdminErrorResponses()
export class AdminWalletController {
  constructor(private readonly adminWalletService: AdminWalletService) {}

  @Post("update-balance")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Update wallet balance (credit/debit)" })
  @ApiEnvelopeResponse(AdminWalletMutationDto, { description: "Balance updated; includes the wallet and the transaction written" })
  async updateBalance(@Req() req: AdminExpressRequest, @Body() updateBalanceDto: UpdateBalanceDto) {
    return { data: await this.adminWalletService.updateBalance(req.admin.id, updateBalanceDto) };
  }

  @Get("all-wallets")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Get all wallets with filters" })
  @ApiEnvelopeResponse(AdminWalletListDto)
  async getAllWallets() {
    return { data: await this.adminWalletService.getAllWallets() };
  }

  @Post("adjust-balance")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Adjust wallet balance (increase/decrease free/locked)" })
  @ApiEnvelopeResponse(AdminWalletMutationDto)
  async adjustBalance(@Req() req: AdminExpressRequest, @Body() adjustBalanceDto: AdjustBalanceDto) {
    return { data: await this.adminWalletService.adjustBalance(req.admin.id, adjustBalanceDto) };
  }

  @Post("freeze")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Freeze/unfreeze wallet balances" })
  @ApiEnvelopeResponse(AdminWalletMutationDto, { description: "Freeze applied; `details` carries the frozen balances" })
  async freezeWallet(@Req() req: AdminExpressRequest, @Body() freezeWalletDto: FreezeWalletDto) {
    return { data: await this.adminWalletService.freezeWallet(req.admin.id, freezeWalletDto) };
  }

  @Post("update-status")
  @AdminRoles(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Update wallet status" })
  @ApiEnvelopeResponse(AdminWalletMutationDto, { description: "Status changed; no transaction is written" })
  async updateWalletStatus(@Req() req: AdminExpressRequest, @Body() walletActionDto: WalletActionDto) {
    return { data: await this.adminWalletService.updateWalletStatus(req.admin.id, walletActionDto) };
  }

  @Get(":walletId")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Get wallet details with history" })
  @ApiEnvelopeResponse(AdminWalletDetailsDto)
  async getWalletDetails(@Param("walletId") walletId: string) {
    return { data: await this.adminWalletService.getWalletDetails(walletId) };
  }

  @Get(":walletId/history")
  @AdminRoles(AdminRole.ADMIN, AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Get wallet balance history" })
  @ApiQuery({ name: "startDate", required: false, description: "ISO date; inclusive lower bound" })
  @ApiQuery({ name: "endDate", required: false, description: "ISO date; inclusive upper bound" })
  @ApiEnvelopeResponse(WalletBalanceHistoryEntryDto, { isArray: true, description: "Balance-affecting admin actions, oldest first" })
  async getWalletHistory(
    @Param("walletId") walletId: string,
    @Query("startDate") startDate?: string,
    @Query("endDate") endDate?: string
  ) {
    return {
      data: await this.adminWalletService.getWalletBalanceHistory(
        walletId,
        startDate ? new Date(startDate) : undefined,
        endDate ? new Date(endDate) : undefined
      ),
    };
  }
}
