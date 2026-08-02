import { Module } from "@nestjs/common";
import { KainoModule } from "../../kaino/kaino.module";
import { GatewayRegistry } from "./gateway.registry";
import { KainoGatewayService } from "./informal/kaino-gateway.service";

@Module({
  imports: [KainoModule],
  providers: [KainoGatewayService, GatewayRegistry],
  exports: [GatewayRegistry, KainoGatewayService],
})
export class GatewaysModule {}
