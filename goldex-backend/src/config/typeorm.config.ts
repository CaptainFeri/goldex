import { ConfigService, ConfigType } from "@nestjs/config";
import { DataSourceOptions } from "typeorm";
import { config } from "dotenv";
import appEnvConfig from "./app.env.config";
config();

export function typeormConfig() {
  const config: ConfigService = new ConfigService<ConfigType<typeof appEnvConfig>>().get("postgres", { infer: true });
  return {
    type: "postgres",
    host: process.env.GOLDEX_AUTH_POSTGRES_URL || "127.0.0.1",
    port: +process.env.GOLDEX_AUTH_POSTGRES_PORT || 5432,
    username: process.env.GOLDEX_AUTH_POSTGRES_USERNAME || "postgres",
    password: process.env.GOLDEX_AUTH_POSTGRES_PASSWORD || "postgres",
    database: process.env.GOLDEX_AUTH_POSTGRES_DBNAME || "base-db",
    autoLoadEntities: true,
    entities: ["dist/**/*.entity{.ts,.js}"],
    synchronize: false,
    migrationsRun: true,
    migrations: ["dist/migrations/*{.ts,.js}"],
    logging: true,
    retryAttempts: 1,
  } as DataSourceOptions;
}
