export default () => ({
  postgres: {
    url: process.env.GOLDEX_AUTH_POSTGRES_URL,
    port: parseInt(process.env.GOLDEX_AUTH_POSTGRES_INTERNAL_PORT),
    username: process.env.GOLDEX_AUTH_POSTGRES_USERNAME,
    password: process.env.GOLDEX_AUTH_POSTGRES_PASSWORD,
    dbname: process.env.GOLDEX_AUTH_POSTGRES_DBNAME,
  },
  application: {
    url: process.env.GOLDEX_BASE_URL,
    resetPasswordRout: process.env.GOLDEX_RESET_PASSWORD_ROUT,
  },
  user: {
    userJwtSecret: process.env.GOLDEX_AUTH_USER_JWT_SECRET,
    userJwtExpirationTime: process.env.GOLDEX_AUTH_USER_JWT_EXPIRATION_TIME,

    userJwtRefSecret: process.env.GOLDEX_AUTH_USER_REFRESH_JWT_SECRET,
    userJwtRefExpirationTime: process.env.GOLDEX_AUTH_USER_REFRESH_JWT_EXPIRATION_TIME,
    userResetPasswordSecret: process.env.GOLDEX_AUTH_RESET_PASSWORD_SECRET,
    userResetPasswordExpirationTime: process.env.GOLDEX_AUTH_RESET_PASSWORD_EXPIRATION_TIME,
  },
  admin: {
    superAdminJwtSecret: process.env.GOLDEX_AUTH_ADMIN_JWT_SECRET,
    superAdminJwtExpirationTime: process.env.GOLDEX_AUTH_ADMIN_JWT_EXPIRATION_TIME,
  },
  swagger: {
    username: process.env.GOLDEX_SWAGGER_USERNAME,
    password: process.env.GOLDEX_SWAGGER_PASSWORD,
  },
  redis: {
    host: process.env.GOLDEX_REDIS_HOST,
    port: parseInt(process.env.GOLDEX_REDIS_INTERNAL_PORT),
    ttl: process.env.GOLDEX_REDIS_TTL,
    db: process.env.GOLDEX_REDIS_DB,
    password: process.env.GOLDEX_REDIS_PASSWORD,
  },
  // The pricing-engine's own Redis (separate instance) — read-only source for
  // provider price history (`price:history:*`) used by the admin monitoring charts.
  pricingRedis: {
    host: process.env.GOLDEX_PRICING_REDIS_HOST || "localhost",
    port: parseInt(process.env.GOLDEX_PRICING_REDIS_PORT) || 6380,
    db: process.env.GOLDEX_PRICING_REDIS_DB ? parseInt(process.env.GOLDEX_PRICING_REDIS_DB) : 0,
    password: process.env.GOLDEX_REDIS_PASSWORD || process.env.REDIS_PASSWORD,
  },
  rabbitmq: {
    host: process.env.GOLDEX_RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.GOLDEX_RABBITMQ_PORT) || 5672,
    user: process.env.GOLDEX_RABBITMQ_USER || 'guest',
    pass: process.env.GOLDEX_RABBITMQ_PASS || 'guest',
    exchange: process.env.GOLDEX_RABBITMQ_EXCHANGE || 'signalr.providers',
    // Must be DIFFERENT from the pricing-engine's queue ('signalr.providers.queue').
    // Sharing one queue on the topic exchange makes the two services round-robin
    // (and drop) each other's messages — orders would never resolve.
    queue: process.env.GOLDEX_RABBITMQ_QUEUE || 'goldex.backend.queue',
  },
  cbp: {
    // Internal goldex-cbp (payment gateway aggregation) service — used to
    // forward payment-provider callbacks for verification.
    url: process.env.GOLDEX_CBP_URL || 'http://goldex-cbp:4100',
  },
  mailProviders: {
    mailgun: {
      key: process.env.MAILGUN_API_KEY,
      domain: process.env.MAILGUN_DOMAIN,
      email: process.env.MAILGUN_FROM_EMAIL,
      defaultUrl: process.env.MAILGUN_API_DEFAULT_URL || "https://api.mailgun.net",
    },
  },
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    channelId: process.env.TELEGRAM_CHANNEL_ID,
  },
  p2p: {
    // System user that owns the company-side wallets. Admin settlement moves
    // balance between this user's wallet and the customer's, so the internal
    // leg of a company payout is an ordinary ledger pair.
    adminUserId: process.env.GOLDEX_P2P_ADMIN_USER_ID,
  },
  ocr: {
    provider: process.env.OCR_PROVIDER || 'kraken',
    serviceUrl: process.env.OCR_SERVICE_URL || 'http://ocr-worker:8000/ocr',
    feedbackUrl: process.env.OCR_FEEDBACK_URL || 'http://ocr-worker:8000/ocr/feedback',
    healthUrl: process.env.OCR_HEALTH_URL || 'http://ocr-worker:8000/health',
    trainStatusUrl: process.env.OCR_TRAIN_STATUS_URL || 'http://ocr-worker:8000/train/status',
    trainTriggerUrl: process.env.OCR_TRAIN_TRIGGER_URL || 'http://ocr-worker:8000/train/trigger',
    timeout: parseInt(process.env.OCR_TIMEOUT) || 120000,
    mode: process.env.OCR_MODE || 'http',
    feedbackEnabled: process.env.OCR_FEEDBACK_ENABLED !== 'false',
    rabbitmqRequestQueue: process.env.OCR_RABBITMQ_REQUEST_QUEUE || 'ocr_requests',
    rabbitmqResultExchange: process.env.OCR_RABBITMQ_RESULT_EXCHANGE || 'ocr_results',
    rabbitmqResultRoutingKey: process.env.OCR_RABBITMQ_RESULT_ROUTING_KEY || 'ocr.result',
  },
});
