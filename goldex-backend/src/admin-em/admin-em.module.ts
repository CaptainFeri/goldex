import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AdminBankAccountModule } from "../admin-bank-account/admin-bank-account.module";
import { OperationOtpModule } from "../operation-otp/operation-otp.module";
import { P2pModule } from "../p2p/p2p.module";
import { FilesModule } from "../shared/files";
import { P2pWithdrawRequestEntity } from "../p2p/entity/p2p-withdraw-request.entity";
import { P2pDepositIntentEntity } from "../p2p/entity/p2p-deposit-intent.entity";
import { P2pMatchEntity } from "../p2p/entity/p2p-match.entity";
import { P2pPaymentProofEntity } from "../p2p/entity/p2p-payment-proof.entity";
import { P2pEscalationEntity } from "../p2p/entity/p2p-escalation.entity";
import { AdminEmController } from "./admin-em.controller";
import { AdminEmService } from "./admin-em.service";
import { P2pEmViewService } from "./p2p-em-view.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      P2pWithdrawRequestEntity,
      P2pDepositIntentEntity,
      P2pMatchEntity,
      P2pPaymentProofEntity,
      P2pEscalationEntity,
    ]),
    // The services the write side delegates to; nothing here writes p2p_* itself.
    P2pModule,
    AdminBankAccountModule,
    OperationOtpModule,
    FilesModule,
  ],
  controllers: [AdminEmController],
  providers: [P2pEmViewService, AdminEmService],
  exports: [P2pEmViewService],
})
export class AdminEmModule {}
