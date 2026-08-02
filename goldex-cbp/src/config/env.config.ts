import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  port: parseInt(process.env.PORT ?? "4100", 10),
  postgres: {
    host: process.env.PAYMENT_DB_HOST ?? "localhost",
    port: parseInt(process.env.PAYMENT_DB_PORT ?? "5434", 10),
    username: process.env.PAYMENT_DB_USERNAME ?? "postgres",
    password: process.env.PAYMENT_DB_PASSWORD ?? "postgres",
    database: process.env.PAYMENT_DB_NAME ?? "payment-db",
    synchronize: (process.env.PAYMENT_DB_SYNC ?? "true") === "true",
  },
  callbackBaseUrl:
    process.env.PAYMENT_CALLBACK_BASE_URL ?? "http://localhost:4100",
  rabbitmq: {
    host: process.env.CBP_RABBITMQ_HOST ?? "localhost",
    port: parseInt(process.env.CBP_RABBITMQ_PORT ?? "5672", 10),
    user: process.env.CBP_RABBITMQ_USER ?? "guest",
    pass: process.env.CBP_RABBITMQ_PASS ?? "guest",
    exchange: process.env.CBP_RABBITMQ_EXCHANGE ?? "signalr.providers",
    queue: process.env.CBP_RABBITMQ_QUEUE ?? "goldex.cbp.queue",
  },
  kaino: {
    baseUrl: process.env.KAINO_BASE_URL ?? "https://wallet.kaino.ir",
    username: process.env.KAINO_USERNAME ?? "",
    password: process.env.KAINO_PASSWORD ?? "",
    tenant: process.env.KAINO_TENANT ?? "",
    secret: process.env.KAINO_SECRET ?? "",
    payerMobile: process.env.KAINO_PAYER_MOBILE ?? "",
    ipgPayPath:
      process.env.KAINO_IPG_PAY_PATH ??
      "/rest/channel/wallet/v1/chargeWallet/pay",
  },
}));
