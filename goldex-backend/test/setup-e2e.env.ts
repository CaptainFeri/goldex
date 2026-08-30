process.env.NODE_ENV = 'test';
process.env.GOLDEX_APP_INTERNAL_PORT = '4040';

// PostgreSQL (docker-compose.test.yml)
process.env.GOLDEX_AUTH_POSTGRES_URL = 'localhost';
process.env.GOLDEX_AUTH_POSTGRES_INTERNAL_PORT = '55432';
process.env.GOLDEX_AUTH_POSTGRES_USERNAME = 'postgres';
process.env.GOLDEX_AUTH_POSTGRES_PASSWORD = 'postgres';
process.env.GOLDEX_AUTH_POSTGRES_DBNAME = 'backend_e2e';

// JWT secrets (fixed values so tokens minted during tests stay valid)
process.env.GOLDEX_AUTH_USER_JWT_SECRET = 'e2e-user-jwt-secret';
process.env.GOLDEX_AUTH_USER_JWT_EXPIRATION_TIME = '3600';
process.env.GOLDEX_AUTH_USER_REFRESH_JWT_SECRET = 'e2e-user-refresh-jwt-secret';
process.env.GOLDEX_AUTH_USER_REFRESH_JWT_EXPIRATION_TIME = '604800';
process.env.GOLDEX_AUTH_RESET_PASSWORD_SECRET = 'e2e-reset-password-secret';
process.env.GOLDEX_AUTH_RESET_PASSWORD_EXPIRATION_TIME = '3600';
process.env.GOLDEX_AUTH_ADMIN_JWT_SECRET = 'e2e-admin-jwt-secret';
process.env.GOLDEX_AUTH_ADMIN_JWT_EXPIRATION_TIME = '3600';

// Swagger (only wired in main.ts, never touched by e2e specs)
process.env.GOLDEX_SWAGGER_USERNAME = 'admin';
process.env.GOLDEX_SWAGGER_PASSWORD = 'admin';

// Redis (docker-compose.test.yml)
process.env.GOLDEX_REDIS_HOST = 'localhost';
process.env.GOLDEX_REDIS_INTERNAL_PORT = '56179';
process.env.GOLDEX_REDIS_TTL = '120';
process.env.GOLDEX_REDIS_DB = '15';

// RabbitMQ (docker-compose.test.yml)
process.env.GOLDEX_RABBITMQ_HOST = 'localhost';
process.env.GOLDEX_RABBITMQ_PORT = '55672';
process.env.GOLDEX_RABBITMQ_USER = 'guest';
process.env.GOLDEX_RABBITMQ_PASS = 'guest';
process.env.GOLDEX_RABBITMQ_EXCHANGE = 'signalr.providers';
process.env.GOLDEX_RABBITMQ_QUEUE = 'goldex.backend.queue.e2e';

// MinIO (docker-compose.test.yml)
process.env.MINIO_ENDPOINT = 'localhost';
process.env.MINIO_PORT = '59000';
process.env.MINIO_USE_SSL = 'false';
process.env.MINIO_ACCESS_KEY = 'minioadmin';
process.env.MINIO_SECRET_KEY = 'minioadmin';
process.env.MINIO_BUCKET = 'goldex';
process.env.MINIO_REGION = 'us-east-1';

// External services: unreachable — nothing in the e2e suite may call them
process.env.GOLDEX_BASE_URL = 'http://localhost:4040';
process.env.GOLDEX_RESET_PASSWORD_ROUT = '/reset-password';
process.env.GOLDEX_CBP_URL = 'http://localhost:59999';
process.env.TELEGRAM_BOT_TOKEN = '';
process.env.TELEGRAM_CHANNEL_ID = '';
process.env.MAILGUN_API_KEY = '';
process.env.MAILGUN_DOMAIN = '';
process.env.MAILGUN_FROM_EMAIL = '';

// SMS is overridden by the SmsProvider mock in the spec; keep Kavenegar inert
process.env.SMS_PROVIDER = 'kavenegar';
process.env.KAVENEGAR_API_KEY = '';
process.env.KAVENEGAR_SENDER = '';

// KYC provider — only used when a KYC document is uploaded
process.env.JIBIT_BASE_URL = 'http://localhost:59999';
process.env.JIBIT_API_KEY = '';
process.env.JIBIT_SECRET_KEY = '';
