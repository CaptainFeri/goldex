import { Module } from "@nestjs/common";
import { HttpModule } from "@nestjs/axios";
import { KainoModule } from "../../kaino/kaino.module";
import { GatewayRegistry } from "./gateway.registry";
import { KainoGatewayService } from "./informal/kaino-gateway.service";
import { ShahinGatewayService } from "./shahin/shahin-gateway.service";

@Module({
  imports: [KainoModule, HttpModule],
  providers: [KainoGatewayService, ShahinGatewayService, GatewayRegistry],
  exports: [GatewayRegistry, KainoGatewayService, ShahinGatewayService],
})
export class GatewaysModule {}
