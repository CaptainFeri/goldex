import { Module } from "@nestjs/common";
import { EventEmitterModule } from "@nestjs/event-emitter";
import { FilesModule } from "./shared/files/files.module";
import { AcceptLanguageResolver, I18nModule } from "nestjs-i18n";
import { join } from "path";
import * as path from "path";
import { ConfigModule, ConfigService, ConfigType } from "@nestjs/config";
import appEnvConfig from "./config/app.env.config";
import { JwtModule } from "@nestjs/jwt";
import { TypeOrmModule } from "@nestjs/typeorm";
import { UserModule } from "./user/user.module";
import { AdminModule } from "./admin/admin.module";
import { ServeStaticModule } from "@nestjs/serve-static";
import { BaseinfoModule } from "./baseinfo/baseinfo.module";
import { AdminUserModule } from "./admin-user/admin-user.module";
import { DiscountUserModule } from "./user-discount/discount-user.module";
import { DiscountAdminModule } from "./admin-discount/discount-admin.module";
import { FileModule } from "./file/file.module";
import { WinstonLoggerService } from "./logger/winston.logger";
import { KycModule } from "./kyc/kyc.module";
import { MinioModule } from "./minio/minio.module";
import { AdminKycModule } from "./admin-kyc/admin-kyc.module";
import { AdminManagementModule } from "./admin-management/admin-management.module";
import { AdminPairModule } from "./admin-pair/admin-pair.module";
import { AdminSymbolModule } from "./admin-symbol/admin-symbol.module";
import { UserWalletModule } from "./user-wallet/user-wallet.module";
import { AdminWalletModule } from "./admin-wallet/admin-wallet.module";
import { WebSocketModule } from "./websocket/websocket.module";
import { AdminOrderModule } from "./order/admin/admin-order.module";
import { OrderModule } from "./order/order.module";
import { OrderBookModule } from "./order-book/order-book.module";
import { PricingRouteModule } from "./pricing-route/pricing-route.module";
import { RabbitMQModule } from "./rabbitmq/rabbitmq.module";
import { ProviderPairMappingModule } from "./provider-pair-mapping/provider-pair-mapping.module";
import { WalletCoreModule } from "./wallet/wallet-core.module";
import { FinancialModule } from "./financial/financial.module";
import { AdminMonitoringModule } from "./admin-monitoring/admin-monitoring.module";
import { ProviderFinanceModule } from "./provider-finance/provider-finance.module";
import { WarehouseModule } from "./warehouse/warehouse.module";
import { TelegramNotifierModule } from "./telegram-notifier/telegram-notifier.module";
import { UserTelegramModule } from "./user-telegram/user-telegram.module";
import { QuoteRequestModule } from "./quote-request/quote-request.module";
import { CreditModule } from "./credit/credit.module";
import { FinanceLogModule } from "./finance-log/finance-log.module";
import { AdminScheduleModule } from "./admin-schedule/admin-schedule.module";
import { UserLevelModule } from "./user-level/user-level.module";
import { AdminBankAccountModule } from "./admin-bank-account/admin-bank-account.module";
import { P2pModule } from "./p2p/p2p.module";
import { DepositModule } from "./deposit/deposit.module";
import { WithdrawModule } from "./withdraw/withdraw.module";
import { AdminTelegramMonitoringModule } from "./admin-telegram-monitoring/admin-telegram-monitoring.module";
import { NotificationModule } from "./notification/notification.module";
import { CrmModule } from "./crm/crm.module";
import { PaymentBusModule } from "./payment-bus/payment-bus.module";
import { PaymentCallbackModule } from "./payment-callback/payment-callback.module";
import { ShahinModule } from "./shahin/shahin.module";
import { CbpAdminModule } from "./cbp-admin/cbp-admin.module";
import { ProviderModule } from "./provider/provider.module";
import { MarketStatusModule } from "./market-status/market-status.module";
import { AdminArbitrageModule } from "./admin-arbitrage/admin-arbitrage.module";
import { ScheduleModule } from "@nestjs/schedule";

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
    ServeStaticModule.forRoot(
      {
        rootPath: path.join(process.cwd(), "public"),
      },
      {
        // Same files, also exposed under /uploads so the SPA (and its dev proxy)
        // can load user-uploaded images (avatars) on a predictable path.
        rootPath: path.join(process.cwd(), "public"),
        serveRoot: "/uploads",
      }
    ),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: async (configService: ConfigService<ConfigType<typeof appEnvConfig>>) => {
        return {
          secret: configService.get("user", { infer: true }).userJwtRefSecret,
          expiresIn: Number(configService.get("user", { infer: true }).userJwtRefExpirationTime),
        };
      },
    }),
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService<ConfigType<typeof appEnvConfig>>) => {
        const postgresConfig = configService.get("postgres", { infer: true });
        return {
          type: "postgres",
          host: postgresConfig.url,
          port: +postgresConfig.port,
          username: postgresConfig.username,
          password: postgresConfig.password,
          database: postgresConfig.dbname,
          entities: ["dist/**/*.entity{.ts,.js}"],
          autoLoadEntities: true,
          migrations: ["dist/migrations/**/*{.ts,.js}"],
          synchronize: false,
          migrationsRun: true,
          logging: ["warn", "error"],
          retryAttempts: 30,
          retryDelay: 5000,
          keepConnectionAlive: true,
          extra: {
            max: 10,
            min: 1,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            keepAlive: true,
            application_name: "goldex-backend",
          },
        };
      },
      inject: [ConfigService],
    }),
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appEnvConfig],
    }),
    I18nModule.forRoot({
      fallbackLanguage: "en",
      loaderOptions: {
        path: join(__dirname, "i18n"),
        watch: true,
      },
      resolvers: [AcceptLanguageResolver],
    }),
    AdminModule,
    UserModule,
    BaseinfoModule,
    DiscountUserModule,
    DiscountAdminModule,
    FileModule,
    KycModule,
    MinioModule,
    WebSocketModule,
    AdminKycModule,
    AdminUserModule,
    AdminPairModule,
    AdminSymbolModule,
    AdminUserModule,
    UserWalletModule,
    AdminWalletModule,
    AdminOrderModule,
    OrderModule,
    // @Global: exactly one shared Limit Market book per pair. Declaring
    // OrderBookService as a provider anywhere else creates a second, private
    // book that order matching, the admin views and market-close would each
    // see differently.
    OrderBookModule,
    // @Global: one resolver, one cached pair graph, one answer per pair.
    PricingRouteModule,
    RabbitMQModule,
    ProviderPairMappingModule,
    WalletCoreModule,
    FinancialModule,
    AdminMonitoringModule,
    ProviderFinanceModule,
    WarehouseModule,
    CreditModule,
    FinanceLogModule,
    AdminScheduleModule,
    AdminManagementModule,
    TelegramNotifierModule,
    UserTelegramModule,
    QuoteRequestModule,
    UserLevelModule,
    AdminBankAccountModule,
    P2pModule,
    DepositModule,
    WithdrawModule,
    AdminTelegramMonitoringModule,
    NotificationModule,
    CrmModule,
    PaymentBusModule,
    PaymentCallbackModule,
    ShahinModule,
    CbpAdminModule,
    ProviderModule,
    MarketStatusModule,
    AdminArbitrageModule,
    FilesModule,
  ],
  providers: [WinstonLoggerService],
  exports: [WinstonLoggerService],
})
export class AppModule {}
