import { Module } from "@nestjs/common";
import { AdminKycService } from "./admin-kyc.service";
import { AdminKycController } from "./admin-kyc.controller";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserKycEntity } from "../user/entity/user.kyc.entity";
import { UserKycDocumentEntity } from "../user/entity/user.kyc.document.entity";
import { UserEntity } from "../user/entity/user.entity";
import { MinioModule } from "../minio/minio.module";
@Module({
  imports: [TypeOrmModule.forFeature([UserKycEntity, UserKycDocumentEntity, UserEntity]), MinioModule],
  providers: [AdminKycService],
  controllers: [AdminKycController],
})
export class AdminKycModule {}
