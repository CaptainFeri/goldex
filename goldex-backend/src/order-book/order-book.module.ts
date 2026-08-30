import { Module, Global } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OrderBookService } from "./order-book.service";
import { PricePairEntity } from "../admin-pair/entity/price.pair.entity";
import { OrderEntity } from "../order/order.entity";

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([PricePairEntity, OrderEntity])],
  providers: [OrderBookService],
  exports: [OrderBookService],
})
export class OrderBookModule {}
