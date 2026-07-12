import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import appEnvConfig from './config/app.env.config';
import { BotModule } from './bot/bot.module';
import { UserModule } from './user/user.module';
import { BackendApiModule } from './backend-api/backend-api.module';
import { ChannelModule } from './channel/channel.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appEnvConfig],
    }),
    TypeOrmModule.forRootAsync({
      useFactory: (configService: ConfigService<ConfigType<typeof appEnvConfig>>) => {
        const pgConfig = configService.get('postgres', { infer: true });
        return {
          type: 'postgres',
          host: pgConfig.url,
          port: +pgConfig.port,
          username: pgConfig.username,
          password: pgConfig.password,
          database: pgConfig.dbname,
          entities: ['dist/**/*.entity{.ts,.js}'],
          synchronize: true,
          logging: ['warn', 'error'],
        };
      },
      inject: [ConfigService],
    }),
    BotModule,
    UserModule,
    BackendApiModule,
    ChannelModule,
  ],
})
export class AppModule {}
