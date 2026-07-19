import { MiddlewareConsumer, Module, RequestMethod } from "@nestjs/common";
import { ConfigService, ConfigType } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import appEnvConfig from "../config/app.env.config";
import { AdminEntity } from "./entity/admin.entity";
import { AdminService } from "./service/admin.service";
import { AdminAuthController } from "./controller/admin.auth.controller";
import { AdminAuthMiddleware } from "./auth/middleware/admin-auth.middleware";
import { RedisModule } from "../redis/redis.module";
import { AdminScheduleModule } from "../admin-schedule/admin-schedule.module";

@Module({
  imports: [
    RedisModule,
    AdminScheduleModule,
    TypeOrmModule.forFeature([AdminEntity]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService<ConfigType<typeof appEnvConfig>>) => ({
        secret: configService.get("admin", { infer: true }).superAdminJwtSecret,
        signOptions: {
          expiresIn: Number(configService.get("admin", { infer: true }).superAdminJwtExpirationTime),
        },
      }),
    }),
  ],
  providers: [AdminService],
  controllers: [AdminAuthController],
  exports: [AdminService],
})
export class AdminModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AdminAuthMiddleware).forRoutes({
      path: "*",
      method: RequestMethod.ALL,
    });
  }
}
