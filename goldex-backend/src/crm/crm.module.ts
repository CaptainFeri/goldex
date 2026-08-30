import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { CustomerNoteEntity } from "./entity/customer-note.entity";
import { SupportTicketEntity } from "./entity/support-ticket.entity";
import { TicketMessageEntity } from "./entity/ticket-message.entity";
import { CustomerTagEntity } from "./entity/customer-tag.entity";
import { CustomerTagAssignmentEntity } from "./entity/customer-tag-assignment.entity";
import { CustomerSegmentEntity } from "./entity/customer-segment.entity";
import { CustomerSegmentAssignmentEntity } from "./entity/customer-segment-assignment.entity";
import { CustomerSegmentCombinationEntity } from "./entity/customer-segment-combination.entity";
import { CommunicationLogEntity } from "./entity/communication-log.entity";
import { CustomerNoteService } from "./services/customer-note.service";
import { SupportTicketService } from "./services/support-ticket.service";
import { TicketMessageService } from "./services/ticket-message.service";
import { CustomerTagService } from "./services/customer-tag.service";
import { CustomerSegmentService } from "./services/customer-segment.service";
import { CommunicationLogService } from "./services/communication-log.service";
import { Customer360Service } from "./services/customer-360.service";
import { UserTicketController } from "./controllers/user-ticket.controller";
import { AdminCrmController } from "./controllers/admin-crm.controller";
import { UserEntity } from "../user/entity/user.entity";
import { UserKycEntity } from "../user/entity/user.kyc.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { OrderEntity } from "../order/order.entity";
import { DepositEntity } from "../deposit/deposit.entity";
import { WithdrawEntity } from "../withdraw/withdraw.entity";
import { CreditModule } from "../credit/credit.module";

@Module({
  imports: [
    CreditModule,
    TypeOrmModule.forFeature([
      CustomerNoteEntity,
      SupportTicketEntity,
      TicketMessageEntity,
      CustomerTagEntity,
      CustomerTagAssignmentEntity,
      CustomerSegmentEntity,
      CustomerSegmentAssignmentEntity,
      CustomerSegmentCombinationEntity,
      CommunicationLogEntity,
      UserEntity,
      UserKycEntity,
      WalletEntity,
      CustomerTagAssignmentEntity,
      OrderEntity,
      DepositEntity,
      WithdrawEntity,
    ]),
  ],
  controllers: [UserTicketController, AdminCrmController],
  providers: [
    CustomerNoteService,
    SupportTicketService,
    TicketMessageService,
    CustomerTagService,
    CustomerSegmentService,
    CommunicationLogService,
    Customer360Service,
  ],
  exports: [
    CustomerNoteService,
    SupportTicketService,
    TicketMessageService,
    CustomerTagService,
    CustomerSegmentService,
    CommunicationLogService,
    Customer360Service,
  ],
})
export class CrmModule {}
