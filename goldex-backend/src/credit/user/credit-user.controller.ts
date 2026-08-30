import { Controller, Get, Patch, Post, Body, Param, Req, UseGuards, NotFoundException, ForbiddenException } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiBearerAuth } from "@nestjs/swagger";
import { CreditService } from "../credit.service";
import { RequestCreditDto } from "../dto/request-credit.dto";
import { RequestSettlementDto, ReceiveSettlementAssetDto, SelectSettlementMethodDto, FundSettlementDto } from "../dto/settlement-workflow.dto";
import { CreditSettlementWorkflowService } from "../settlement-workflow/credit-settlement-workflow.service";
import { CreditCashoutService } from "../cashout/credit-cashout.service";
import { CashoutCreditDto } from "../dto/cashout-credit.dto";
import { UserAuthGuard } from "../../user/auth/Guard/user.guard";
import { UserLevelGuard } from "../../user-level/user-level.guard";

@ApiTags("User-Credit")
@Controller("credits")
@UseGuards(UserAuthGuard, UserLevelGuard)
@ApiBearerAuth()
export class CreditUserController {
  constructor(
    private readonly creditService: CreditService,
    private readonly settlementWorkflowService: CreditSettlementWorkflowService,
    private readonly cashoutService: CreditCashoutService,
  ) {}

  @Post("request")
  @ApiOperation({ summary: "Open a self-service credit facility (freeze collateral + leverage)" })
  async requestCredit(@Req() req: any, @Body() dto: RequestCreditDto) {
    return { data: await this.creditService.requestCredit(req.user.id, dto) };
  }

  @Post(":id/settle")
  @ApiOperation({ summary: "User self-settle: repay credit and release assets to deposit wallet" })
  async settleCredit(@Req() req: any, @Param("id") id: string) {
    return { data: await this.creditService.settleFromUser(req.user.id, id) };
  }

  @Get(":id/cashout-options")
  @ApiOperation({
    summary:
      "Cash-out option 1: list the credit purchases that can be converted into cash " +
      "(paid from the deposit wallet or the frozen collateral) without closing the facility",
  })
  async cashoutOptions(@Req() req: any, @Param("id") id: string) {
    await this.assertCreditOwned(req.user.id, id);
    return { data: await this.cashoutService.getCashoutOptions(id) };
  }

  @Post(":id/cashout")
  @ApiOperation({
    summary:
      "Cash out one credit purchase: pay it off from the deposit wallet or the frozen " +
      "collateral, release the asset to the deposit wallet and keep the facility open",
  })
  async cashout(@Req() req: any, @Param("id") id: string, @Body() dto: CashoutCreditDto) {
    await this.assertCreditOwned(req.user.id, id);
    return {
      data: await this.cashoutService.cashout(
        id,
        { creditOrderId: dto.creditOrderId, source: dto.source, notes: dto.notes },
        { userId: req.user.id },
      ),
    };
  }

  @Get(":id/cashouts")
  @ApiOperation({ summary: "Cash-out history of a credit facility" })
  async cashouts(@Req() req: any, @Param("id") id: string) {
    await this.assertCreditOwned(req.user.id, id);
    return { data: await this.cashoutService.findByCredit(id) };
  }

  @Get(":id/settlement-eligibility")
  @ApiOperation({ summary: "Preview whether the facility can settle right now (credit wallets net to zero or positive)" })
  async settlementEligibility(@Req() req: any, @Param("id") id: string) {
    await this.assertCreditOwned(req.user.id, id);
    return { data: await this.creditService.getSettlementEligibility(id) };
  }

  @Post(":id/settlement")
  @ApiOperation({ summary: "Request a delivery-based settlement workflow for a credit trade" })
  async requestSettlement(@Req() req: any, @Param("id") id: string, @Body() dto: RequestSettlementDto) {
    await this.assertCreditOwned(req.user.id, id);
    return {
      data: await this.settlementWorkflowService.requestSettlement(id, {
        creditOrderId: dto.creditOrderId,
        requestedBy: req.user?.id,
        notes: dto.notes,
      }),
    };
  }

  @Get(":id/settlements")
  @ApiOperation({ summary: "List delivery-based settlement workflows of a credit" })
  async listSettlements(@Req() req: any, @Param("id") id: string) {
    const credit = await this.creditService.getCreditById(id);
    if (credit.userId !== req.user.id) {
      return { data: [] };
    }
    return { data: await this.settlementWorkflowService.findByCredit(id) };
  }

  @Post(":id/settlement/:settlementId/valuate")
  @ApiOperation({ summary: "Valuate a settlement (exposure vs collateral, three states)" })
  async valuateSettlement(@Req() req: any, @Param("id") id: string, @Param("settlementId") settlementId: string) {
    await this.assertOwned(req.user.id, id, settlementId);
    return { data: await this.settlementWorkflowService.valuate(settlementId) };
  }

  @Post(":id/settlement/:settlementId/method")
  @ApiOperation({ summary: "Select the settlement method (FULL/NET/TOPUP)" })
  async selectMethod(@Req() req: any, @Param("id") id: string, @Param("settlementId") settlementId: string, @Body() dto: SelectSettlementMethodDto) {
    await this.assertOwned(req.user.id, id, settlementId);
    return { data: await this.settlementWorkflowService.selectMethod(settlementId, dto.method, req.user?.id) };
  }

  @Post(":id/settlement/:settlementId/fund")
  @ApiOperation({ summary: "Fund the settlement shortfall (partial funding allowed)" })
  async fundSettlement(@Req() req: any, @Param("id") id: string, @Param("settlementId") settlementId: string, @Body() dto: FundSettlementDto) {
    await this.assertOwned(req.user.id, id, settlementId);
    return { data: await this.settlementWorkflowService.fund(settlementId, dto.amount, { fundedBy: req.user?.id, notes: dto.notes }) };
  }

  @Post(":id/settlement/:settlementId/deliver")
  @ApiOperation({ summary: "Record delivery of the required asset (partial allowed)" })
  async deliverAsset(@Req() req: any, @Param("id") id: string, @Param("settlementId") settlementId: string, @Body() dto: ReceiveSettlementAssetDto) {
    await this.assertOwned(req.user.id, id, settlementId);
    return { data: await this.settlementWorkflowService.receiveAsset(settlementId, dto.amount, dto.notes) };
  }

  private async assertCreditOwned(userId: string, creditId: string): Promise<void> {
    const credit = await this.creditService.getCreditById(creditId);
    if (!credit || credit.userId !== userId) {
      throw new ForbiddenException("CREDIT_NOT_FOUND");
    }
  }

  private async assertOwned(userId: string, creditId: string, settlementId: string): Promise<void> {
    await this.assertCreditOwned(userId, creditId);
    const s = await this.settlementWorkflowService.findByCredit(creditId);
    if (!s.some((x) => x.id === settlementId)) {
      throw new NotFoundException("SETTLEMENT_NOT_FOUND");
    }
  }

  @Get("active")
  @ApiOperation({ summary: "Get user's active credit" })
  async getActiveCredit(@Req() req: any) {
    const credit = await this.creditService.getUserActiveCredit(req.user.id);
    return { data: credit };
  }

  @Get("overview")
  @ApiOperation({ summary: "Get user's active credit overview (used/available, collateral, states)" })
  async getOverview(@Req() req: any) {
    return { data: await this.creditService.getCreditOverview(req.user.id) };
  }

  @Get()
  @ApiOperation({ summary: "Get user's credit history" })
  async getCredits(@Req() req: any) {
    return { data: await this.creditService.getUserCredits(req.user.id) };
  }

  @Get("notifications")
  @ApiOperation({ summary: "Get user's credit notifications" })
  async getNotifications(@Req() req: any) {
    return { data: await this.creditService.getUserNotifications(req.user.id) };
  }

  @Patch("notifications/:id/read")
  @ApiOperation({ summary: "Mark a notification as read" })
  async markNotificationRead(@Param("id") id: string, @Req() req: any) {
    return { data: await this.creditService.markNotificationRead(id, req.user.id) };
  }
}
