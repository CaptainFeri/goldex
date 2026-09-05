import { ConfigService, ConfigType } from '@nestjs/config';
import { DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import appEnvConfig from './app.env.config';

config();

export function typeormConfig() {
  const configService: ConfigService = new ConfigService<
    ConfigType<typeof appEnvConfig>
  >();
  const pgConfig = configService.get('postgres', { infer: true });
  return {
    type: 'postgres',
    host: pgConfig.url,
    port: +pgConfig.port,
    username: pgConfig.username,
    password: pgConfig.password,
    database: pgConfig.dbname,
    autoLoadEntities: true,
    entities: ['dist/**/*.entity{.ts,.js}'],
    synchronize: true,
    migrationsRun: false,
    migrations: ['dist/migrations/*{.ts,.js}'],
    logging: ['warn', 'error'],
  } as DataSourceOptions;
}
