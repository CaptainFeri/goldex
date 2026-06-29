import { TypeOrmModule } from "@nestjs/typeorm";
import { Module } from "@nestjs/common";
import { AdminEntity } from "../admin/entity/admin.entity";
import { PromotionEntity } from "./entity/promotion.entity";
import { DiscountAdminService } from "./discount-admin.service";
import { DiscountAdminController } from "./discount-admin.controller";
import { DiscountCouponEntity } from "../user-discount/entity/discount.entity";

@Module({
  imports: [TypeOrmModule.forFeature([DiscountCouponEntity, PromotionEntity, AdminEntity])],
  providers: [DiscountAdminService],
  controllers: [DiscountAdminController],
})
export class DiscountAdminModule {}
