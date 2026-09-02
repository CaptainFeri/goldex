import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from "@nestjs/swagger";
import { P2pWithdrawService } from "./services/p2p-withdraw.service";
import { P2pDepositService } from "./services/p2p-deposit.service";
import { SubmitPaymentProofDto } from "./dto/submit-payment-proof.dto";
import { RejectPaymentDto } from "./dto/reject-payment.dto";
import { UserAuthGuard } from "../user/auth/Guard/user.guard";
import { UserExpressRequest } from "../user/auth/types/user-express-request";
import { P2pAuditActorEnum } from "./enum/p2p.enums";
import { AuditContext } from "./services/p2p-audit.service";

@ApiTags("P2P")
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller("p2p")
export class P2pUserController {
  constructor(
    private readonly withdrawService: P2pWithdrawService,
    private readonly depositService: P2pDepositService,
  ) {}

  /** IP and user-agent are recorded on every state-changing call (spec §12.1). */
  private ctx(req: UserExpressRequest): AuditContext {
    return {
      actorType: P2pAuditActorEnum.USER,
      actorId: req.user["id"],
      ip: (req as any).ip,
      userAgent: (req as any).headers?.["user-agent"],
    };
  }

  // ─── Withdrawer side ─────────────────────────────────────

  @Get("withdrawals")
  @ApiOperation({ summary: "List my p2p withdrawal requests" })
  async listWithdrawals(
    @Req() req: UserExpressRequest,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
  ) {
    return {
      data: await this.withdrawService.listByUser(req.user["id"], Number(page) || 1, Number(limit) || 20),
    };
  }

  @Get("withdrawals/:id/parts")
  @ApiOperation({ summary: "Parts of one withdrawal, with the payment awaiting my response" })
  async listParts(@Req() req: UserExpressRequest, @Param("id") id: string) {
    return { data: await this.withdrawService.listParts(req.user["id"], id) };
  }

  @Post("withdrawal-parts/:id/confirm-payment")
  @ApiOperation({ summary: "Confirm a depositor's payment and settle this part" })
  async confirmPayment(@Req() req: UserExpressRequest, @Param("id") id: string) {
    return { data: await this.withdrawService.confirmPayment(req.user["id"], id, this.ctx(req)) };
  }

  @Post("withdrawal-parts/:id/reject-payment")
  @ApiOperation({ summary: "Reject a payment — always opens an admin escalation" })
  async rejectPayment(
    @Req() req: UserExpressRequest,
    @Param("id") id: string,
    @Body() dto: RejectPaymentDto,
  ) {
    return {
      data: await this.withdrawService.rejectPayment(req.user["id"], id, dto.reason, this.ctx(req)),
    };
  }

  @Post("withdrawals/:id/cancel")
  @ApiOperation({ summary: "Cancel a withdrawal that has nothing reserved against it" })
  async cancelWithdrawal(@Req() req: UserExpressRequest, @Param("id") id: string) {
    return { data: await this.withdrawService.cancel(req.user["id"], id, this.ctx(req)) };
  }

  // ─── Depositor side ──────────────────────────────────────

  @Get("deposit-intents")
  @ApiOperation({ summary: "List my p2p deposit intents" })
  async listIntents(
    @Req() req: UserExpressRequest,
    @Query("page") page?: number,
    @Query("limit") limit?: number,
  ) {
    return {
      data: await this.depositService.listByUser(req.user["id"], Number(page) || 1, Number(limit) || 20),
    };
  }

  @Get("deposit-intents/:id/match")
  @ApiOperation({ summary: "The destination to pay — 404 while still queued" })
  async getMatch(@Req() req: UserExpressRequest, @Param("id") id: string) {
    return { data: await this.depositService.getMatch(req.user["id"], id) };
  }

  @Post("matches/:id/accept")
  @ApiOperation({ summary: "Accept the reserved match" })
  async acceptMatch(@Req() req: UserExpressRequest, @Param("id") id: string) {
    return { data: await this.depositService.acceptMatch(req.user["id"], id, this.ctx(req)) };
  }

  @Post("matches/:id/cancel")
  @ApiOperation({ summary: "Give up the reservation and go back to the queue" })
  async cancelMatch(@Req() req: UserExpressRequest, @Param("id") id: string) {
    return { data: await this.depositService.cancelMatch(req.user["id"], id, this.ctx(req)) };
  }

  @Post("matches/:id/payment-proof")
  @ApiOperation({ summary: "Submit the transfer receipt (idempotent)" })
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage() }))
  async submitProof(
    @Req() req: UserExpressRequest,
    @Param("id") id: string,
    @Body() dto: SubmitPaymentProofDto,
    @UploadedFile() file: Express.Multer.File,
    @Headers("idempotency-key") idempotencyKey?: string,
  ) {
    return {
      data: await this.depositService.submitPaymentProof(
        req.user["id"],
        id,
        dto,
        file,
        idempotencyKey,
        this.ctx(req),
      ),
    };
  }
}
