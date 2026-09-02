import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { P2pWithdrawRequestEntity } from "./entity/p2p-withdraw-request.entity";
import { P2pWithdrawPartEntity } from "./entity/p2p-withdraw-part.entity";
import { P2pDepositIntentEntity } from "./entity/p2p-deposit-intent.entity";
import { P2pMatchEntity } from "./entity/p2p-match.entity";
import { P2pPaymentProofEntity } from "./entity/p2p-payment-proof.entity";
import { P2pEscalationEntity } from "./entity/p2p-escalation.entity";
import { P2pSettingEntity } from "./entity/p2p-setting.entity";
import { P2pAuditLogEntity } from "./entity/p2p-audit-log.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { TransactionEntity } from "../wallet/entities/transaction.entity";
import { DepositEntity } from "../deposit/deposit.entity";
import { WithdrawEntity } from "../withdraw/withdraw.entity";
import { UserBankAccountEntity } from "../user/entity/user.bank.account.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { P2pSettingService } from "./services/p2p-setting.service";
import { P2pAuditService } from "./services/p2p-audit.service";
import { P2pUserBankService } from "./services/p2p-user-bank.service";
import { P2pReceiptService } from "./services/p2p-receipt.service";
import { P2pAdminService } from "./services/p2p-admin.service";
import { P2pLiquidityService } from "./services/p2p-liquidity.service";
import { P2pSettlementService } from "./services/p2p-settlement.service";
import { P2pMatchingService } from "./services/p2p-matching.service";
import { P2pEscalationService } from "./services/p2p-escalation.service";
import { P2pWithdrawService } from "./services/p2p-withdraw.service";
import { P2pDepositService } from "./services/p2p-deposit.service";
import { P2pCronService } from "./p2p-cron.service";
import { P2pUserController } from "./p2p-user.controller";
import { P2pAdminController } from "./p2p-admin.controller";
import { AdminBankAccountModule } from "../admin-bank-account/admin-bank-account.module";
import { MinioModule } from "../minio/minio.module";
import { OcrModule } from "../ocr/ocr.module";
import { RedisModule } from "../redis/redis.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      P2pWithdrawRequestEntity,
      P2pWithdrawPartEntity,
      P2pDepositIntentEntity,
      P2pMatchEntity,
      P2pPaymentProofEntity,
      P2pEscalationEntity,
      P2pSettingEntity,
      P2pAuditLogEntity,
      WalletEntity,
      TransactionEntity,
      DepositEntity,
      WithdrawEntity,
      UserBankAccountEntity,
      SymbolEntity,
    ]),
    AdminBankAccountModule,
    MinioModule,
    OcrModule,
    RedisModule,
  ],
  controllers: [P2pUserController, P2pAdminController],
  providers: [
    P2pSettingService,
    P2pAuditService,
    P2pUserBankService,
    P2pReceiptService,
    P2pAdminService,
    P2pLiquidityService,
    P2pSettlementService,
    P2pMatchingService,
    P2pEscalationService,
    P2pWithdrawService,
    P2pDepositService,
    P2pCronService,
  ],
  // Deposit/Withdraw import these to branch on type === "p2p".
  exports: [P2pWithdrawService, P2pDepositService, P2pSettingService, P2pLiquidityService],
})
export class P2pModule {}
